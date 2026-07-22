import crypto from 'node:crypto';
import { isRecognizedPageCta, normalizeCtaMode, pageCtaRole, pageCtaRoles } from '../content/page-cta-contract.mjs';
import { normalizeBlockItems, parseJsonItems } from './validation.mjs';
import { normalizeBlockItemsByType } from '../content/block-contracts.mjs';
import { imageMimeTypes, normalizeVideoConfig, videoMimeTypes } from '../content/video.mjs';
import { normalizeSiteSettings, parseSiteSettingsRows } from './settings.mjs';
import { canonicalCtaBlockFromDefault } from '../content/cta-contract.mjs';
import { mediaConfig } from './media-storage.mjs';
import { isInternalRouteCandidate, isValidHttpExternalUrl, normalizeNavigationTargetFields, normalizeNavigationTargetType, positiveNavigationPageId, resolveNavigationItem } from '../content/internal-links.mjs';
import { activePageUsageBlockers, pageInUseError } from '../content/reference-validation.mjs';
import { assertEditorRevision, computeGenericHomeEditorRevision, homeEditableBlocks, homeValidationError, isHomeCanonicalKey } from './home-validation.mjs';

function normalizeRoute(value) { const raw = String(value || '').trim().toLowerCase().replace(/[^a-z0-9áéíóöőúüű\/-]+/g, '-'); const withStart = raw.startsWith('/') ? raw : `/${raw}`; return withStart.endsWith('/') ? withStart : `${withStart}/`; }
function validationError(message) { const error = new Error(message); error.code = 'VALIDATION_ERROR'; error.status = 400; return error; }
function navigationConflictError(code, message, details) { const error = new Error(message); error.code = code; error.status = 409; if (details) error.details = details; return error; }

const HERO_HEIGHTS = new Set(['compact','normal','tall','xlarge']);
const HERO_FITS = new Set(['cover','contain','stretch']);
const HERO_OVERLAYS = new Set(['weak','normal','strong']);
function normalizeEnum(value, allowed, field) { const raw = String(value ?? '').trim(); if (!raw) return null; if (!allowed.has(raw)) throw validationError(`Hibás hero beállítás: ${field}.`); return raw; }
function normalizeHeroPosition(value, field) { if (value === undefined || value === null || String(value).trim() === '') return null; if (!/^\d+$/.test(String(value).trim())) throw validationError(`Hibás hero pozíció: ${field}.`); const n = Number(value); if (!Number.isInteger(n) || n < 0 || n > 100) throw validationError(`Hibás hero pozíció: ${field}.`); return n; }
function normalizeHeroScale(value) { if (value === undefined || value === null || String(value).trim() === '') return null; if (!/^\d+$/.test(String(value).trim())) throw validationError('Hibás hero kép méret.'); const n = Number(value); if (!Number.isInteger(n) || n < 50 || n > 200) throw validationError('Hibás hero kép méret.'); return n; }
function jsonOrNull(value) { if (value == null || value === '') return null; if (typeof value === 'string') { try { return JSON.parse(value); } catch { return value; } } return value; }
async function requireReadyMedia(pool, path, kind) {
  const [rows] = await pool.query('SELECT path,type,status,processing_status FROM site_media_assets WHERE path=? LIMIT 1', [path]);
  const media = rows[0];
  const types = kind === 'video' ? videoMimeTypes : imageMimeTypes;
  if (!media || media.path !== path || media.status === 'archived' || media.processing_status !== 'ready' || !types.has(media.type)) throw validationError(kind === 'video' ? 'Csak aktív, kész MP4 videó választható.' : 'Csak aktív, kész WebP/JPG/PNG kép választható posternek.');
  return media;
}


async function requirePdfNotUsedAsLegalDocument(pool, media) {
  if (!media || media.type !== 'application/pdf') return;
  const [rows] = await pool.query('SELECT `key`,`value` FROM site_settings WHERE `key`=? LIMIT 1', ['legalDocuments']);
  const settings = parseSiteSettingsRows(rows);
  const used = [settings.legalDocuments?.termsPdfPath,settings.legalDocuments?.privacyPdfPath,settings.legalDocuments?.cookiePdfPath,...(settings.legalDocuments?.items||[]).map((d)=>d.pdfPath)].some((path) => path && path === media.path);
  if (used) throw validationError('A dokumentum jelenleg jogi dokumentumként van használatban. Előbb távolítsd el az Alapadatok oldalon.');
}

async function requireMediaPath(pool, path, env, { type, message, baseMessage }) {
  if (!path) return;
  const base = `${mediaConfig(env).publicBase}/`;
  if (!String(path).startsWith(base)) throw validationError(baseMessage);
  const [rows] = await pool.query('SELECT path,type,status,processing_status FROM site_media_assets WHERE path=? LIMIT 1', [path]);
  const media = rows[0];
  const okType = type === 'image' ? imageMimeTypes.has(media?.type) : media?.type === type;
  if (!media || media.status === 'archived' || media.processing_status !== 'ready' || !okType) throw validationError(message);
}
async function requireLegalPdf(pool, pdfPath, env = process.env) { return requireMediaPath(pool, pdfPath, env, { type: 'application/pdf', baseMessage: 'Csak feltöltött PDF dokumentum választható.', message: 'Csak aktív, kész PDF dokumentum választható.' }); }
async function requireLogoImage(pool, imagePath, env = process.env) { return requireMediaPath(pool, imagePath, env, { type: 'image', baseMessage: 'Csak feltöltött képfájl választható logóként.', message: 'Csak aktív, kész képfájl választható logóként.' }); }

async function validateVideoConfigForSave(pool, value, context) {
  const config = normalizeVideoConfig(jsonOrNull(value), { context, allowNull: context === 'hero' });
  if (!config) return null;
  if (config.sourceType === 'media') await requireReadyMedia(pool, config.mediaPath, 'video');
  if (config.poster) await requireReadyMedia(pool, config.poster, 'image');
  return config;
}

function normalizeNavigationSnapshotRow(row = {}, options = {}) {
  return { ...row, ...normalizeNavigationTargetFields(row, options) };
}
function hasOwn(obj, key) { return Object.prototype.hasOwnProperty.call(obj || {}, key); }
function normalizeNavSortOrder(value) {
  if (value === undefined || value === null || String(value).trim() === '') throw validationError('A sorrend csak pozitív egész szám lehet.');
  if (!/^\d+$/.test(String(value).trim())) throw validationError('A sorrend csak pozitív egész szám lehet.');
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) throw validationError('A sorrend csak pozitív egész szám lehet.');
  return n;
}
function validateUniqueNavigationHrefs(items = []) {
  const seen = new Map();
  for (const [index, item] of items.entries()) {
    const href = String(item?.href || '').trim();
    if (!href) continue;
    if (seen.has(href)) throw validationError(`Duplikált menüpont link (${seen.get(href) + 1}. és ${index + 1}. sor).`);
    seen.set(href, index);
  }
}

async function validateNavigationHrefConflicts(pool, items = []) {
  for (const item of items) {
    const href = String(item?.href || '').trim();
    if (!href) continue;
    const id = item?.id && /^\d+$/.test(String(item.id)) ? Number(item.id) : 0;
    const [rows] = id
      ? await pool.query('SELECT id FROM site_navigation_items WHERE href=? AND id<>? LIMIT 1', [href, id])
      : await pool.query('SELECT id FROM site_navigation_items WHERE href=? LIMIT 1', [href]);
    if (rows[0]) throw validationError('Duplikált menüpont link.');
  }
}

async function normalizeNavTargetPatch(pool, item, existing = {}) {
  const typeProvided = hasOwn(item, 'target_type');
  const pageProvided = hasOwn(item, 'target_page_id');
  const overrideProvided = hasOwn(item, 'title_override');
  const existingTarget = normalizeNavigationTargetFields(existing);
  if (!typeProvided && (pageProvided || overrideProvided)) throw validationError('A cél típusát is meg kell adni a target mezők mellé.');
  if (!typeProvided && !pageProvided && !overrideProvided) {
    if (existingTarget.target_type !== 'page') return existingTarget;
    const [pages] = await pool.query('SELECT id, route, title FROM site_pages WHERE id=? LIMIT 1', [existingTarget.target_page_id]);
    const page = pages[0];
    if (!page) return { target_type: 'legacy', target_page_id: null, title_override: null };
    if (String(item.href || '') !== String(page.route || '')) return { target_type: 'legacy', target_page_id: null, title_override: null };
    return { target_type: 'page', target_page_id: existingTarget.target_page_id, title_override: String(item.title || '') === String(page.title || '') ? null : String(item.title || '') };
  }
  const targetType = typeProvided ? normalizeNavigationTargetType(item.target_type) : existingTarget.target_type;
  if (targetType === 'page') {
    const pageId = pageProvided ? item.target_page_id : existingTarget.target_page_id;
    const normalized = normalizeNavigationTargetFields({ target_type: 'page', target_page_id: pageId, title_override: overrideProvided ? item.title_override : existingTarget.title_override });
    if (normalized.target_type !== 'page') throw validationError('Belső oldalhivatkozáshoz érvényes oldalazonosító szükséges.');
    const [pages] = await pool.query('SELECT id, route, title FROM site_pages WHERE id=? LIMIT 1', [normalized.target_page_id]);
    const page = pages[0];
    if (!page) throw validationError('A kiválasztott belső oldal nem található.');
    if (String(item.href || '') !== String(page.route || '')) throw validationError('A belső oldal linkje csak az oldal aktuális route-ja lehet.');
    if (normalized.title_override && String(item.title || '') !== String(normalized.title_override)) throw validationError('Az egyedi menüfelirat és a kompatibilitási title mező eltér.');
    if (!normalized.title_override && String(item.title || '') !== String(page.title || '')) throw validationError('Örökölt feliratnál a title az oldal címe legyen.');
    return normalized;
  }
  if ((pageProvided && item.target_page_id !== undefined && item.target_page_id !== null && String(item.target_page_id).trim() !== '') || (overrideProvided && item.title_override !== undefined && item.title_override !== null && String(item.title_override).trim() !== '')) throw validationError('Legacy és külső link célhoz nem tartozhat oldalazonosító vagy menüfelirat override.');
  if (targetType === 'external' && !isValidHttpExternalUrl(item.href)) throw validationError('A külső URL csak http:// vagy https:// lehet.');
  return normalizeNavigationTargetFields({ target_type: targetType });
}

function normalizeHeroDisplay(p = {}) { return {
  hero_height: normalizeEnum(p.hero_height, HERO_HEIGHTS, 'magasság'),
  hero_image_fit: normalizeEnum(p.hero_image_fit, HERO_FITS, 'kép illesztése'),
  hero_image_position_x: normalizeHeroPosition(p.hero_image_position_x, 'vízszintes'),
  hero_image_position_y: normalizeHeroPosition(p.hero_image_position_y, 'függőleges'),
  hero_image_position_mobile_x: normalizeHeroPosition(p.hero_image_position_mobile_x, 'mobil vízszintes'),
  hero_image_position_mobile_y: normalizeHeroPosition(p.hero_image_position_mobile_y, 'mobil függőleges'),
  hero_overlay_strength: normalizeEnum(p.hero_overlay_strength, HERO_OVERLAYS, 'overlay'),
  hero_image_scale: normalizeHeroScale(p.hero_image_scale),
}; }

const PAGE_HERO_VARIANTS = new Set(['listing','detail']);
const BLOCK_SECTION_THEMES = new Set(['default','light','gradient-light']);
const BLOCK_LAYOUTS = new Set(['stack','grid']);
const BLOCK_CONTENT_LAYOUTS = new Set(['default','lead']);
const BLOCK_HEADING_SCALES = new Set(['default','section','display','prominent']);
const BLOCK_SURFACE_VARIANTS = new Set(['default','gradient','emphasis']);
const BLOCK_BODY_WHITESPACES = new Set(['normal','preserve-lines']);
const BLOCK_CHROMES = new Set(['default','none']);
const BLOCK_SURFACES = new Set(['default','polished']);
function parseJsonObject(value, field) { const parsed = jsonOrNull(value); if (parsed == null || parsed === '') return null; if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw validationError(`${field} csak JSON objektum lehet.`); return parsed; }
function normalizePagePresentation(value) { const source = value && typeof value === 'object' && !Array.isArray(value) && !Object.prototype.hasOwnProperty.call(value, 'heroVariant') && !Object.prototype.hasOwnProperty.call(value, 'hero_variant') && Object.prototype.hasOwnProperty.call(value, 'presentation_hero_variant') ? { heroVariant: value.presentation_hero_variant } : value; const raw = parseJsonObject(source, 'Oldal megjelenés') || {}; const variant = String(raw.heroVariant ?? raw.hero_variant ?? 'listing').trim() || 'listing'; if (!PAGE_HERO_VARIANTS.has(variant)) throw validationError('Hibás hero variant.'); return { heroVariant: variant }; }
function normalizeBlockPresentation(value) { const raw = parseJsonObject(value, 'Blokk megjelenés'); if (!raw) return null; const out = {}; const str = (k) => String(raw[k] ?? '').trim(); if (str('sectionGroupKey')) out.sectionGroupKey = str('sectionGroupKey'); if (str('section_group_key')) out.sectionGroupKey = str('section_group_key'); if (str('sectionTheme') || str('section_theme')) { const v = str('sectionTheme') || str('section_theme'); if (!BLOCK_SECTION_THEMES.has(v)) throw validationError('Hibás section theme.'); out.sectionTheme = v; } if (str('layout')) { const v = str('layout'); if (!BLOCK_LAYOUTS.has(v)) throw validationError('Hibás layout.'); out.layout = v; } const cols = raw.gridColumns ?? raw.grid_columns; if (cols !== undefined && cols !== null && String(cols).trim() !== '') { const n = Number(cols); if (!Number.isSafeInteger(n) || n < 1 || n > 4) throw validationError('Hibás grid oszlopszám.'); out.gridColumns = n; } const ratio = str('columnRatio') || str('column_ratio'); if (ratio) { if (!/^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(ratio)) throw validationError('Hibás oszloparány.'); out.columnRatio = ratio; } const order = raw.sectionOrder ?? raw.section_order; if (order !== undefined && order !== null && String(order).trim() !== '') { const n = Number(order); if (!Number.isSafeInteger(n) || n < 1 || n > 999) throw validationError('Hibás section sorrend.'); out.sectionOrder = n; } const pos = raw.columnPosition ?? raw.column_position; if (pos !== undefined && pos !== null && String(pos).trim() !== '') { const n = Number(pos); if (!Number.isSafeInteger(n) || n < 1 || n > 6) throw validationError('Hibás blokk oszloppozíció.'); out.columnPosition = n; } if (str('surface') || str('surfaceStyle') || str('surface_style')) { const v = str('surface') || str('surfaceStyle') || str('surface_style'); if (!BLOCK_SURFACES.has(v)) throw validationError('Hibás surface/card style.'); out.surface = v; } if (str('contentLayout') || str('content_layout')) { const v = str('contentLayout') || str('content_layout'); if (!BLOCK_CONTENT_LAYOUTS.has(v)) throw validationError('Hibás content layout.'); out.contentLayout = v; } if (str('headingScale') || str('heading_scale')) { const v = str('headingScale') || str('heading_scale'); if (!BLOCK_HEADING_SCALES.has(v)) throw validationError('Hibás heading scale.'); out.headingScale = v; } if (str('surfaceVariant') || str('surface_variant')) { const v = str('surfaceVariant') || str('surface_variant'); if (!BLOCK_SURFACE_VARIANTS.has(v)) throw validationError('Hibás surface variant.'); out.surfaceVariant = v; } if (str('bodyWhitespace') || str('body_whitespace')) { const v = str('bodyWhitespace') || str('body_whitespace'); if (!BLOCK_BODY_WHITESPACES.has(v)) throw validationError('Hibás body whitespace.'); out.bodyWhitespace = v; } if (str('blockChrome') || str('block_chrome')) { const v = str('blockChrome') || str('block_chrome'); if (!BLOCK_CHROMES.has(v)) throw validationError('Hibás block chrome.'); out.blockChrome = v; } return Object.keys(out).length ? out : null; }

function normalizeVisiblePresentationKeys(value) { const raw = jsonOrNull(value); if (!Array.isArray(raw)) return null; const allowed = new Set(['sectionTheme','layout','gridColumns','columnRatio','surface','contentLayout','headingScale','surfaceVariant','bodyWhitespace','blockChrome']); return raw.map((key) => String(key || '').trim()).filter((key) => allowed.has(key)); }
function mergeBlockPresentationForSave(submitted, existingBlock = null, visibleKeysValue = null) {
  const existing = normalizeBlockPresentation(existingBlock?.presentation) || {};
  const next = normalizeBlockPresentation(submitted) || {};
  const visibleKeys = normalizeVisiblePresentationKeys(visibleKeysValue);
  const out = { ...existing };
  if (visibleKeys) for (const key of visibleKeys) delete out[key];
  return { ...out, ...next };
}

async function validateRelatedLinksItems(pool, items) { for (const [index,item] of items.entries()) { if (String(item?.target_type || '') !== 'page') throw validationError(`Related links ${index + 1}. cél típusa csak page lehet.`); const id = Number(item?.target_page_id); if (!Number.isSafeInteger(id) || id <= 0) throw validationError(`Related links ${index + 1}. céloldal hibás.`); const [rows] = await pool.query('SELECT id,status FROM site_pages WHERE id=? LIMIT 1', [id]); if (!rows[0] || rows[0].status !== 'published') throw validationError('Related links céloldal csak publikus oldal lehet.'); item.target_page_id = id; item.target_type = 'page'; if (item.title_override != null) item.title_override = String(item.title_override).trim(); } }

function normalizeProgressPercent(value) { const n = Number(value); if (!Number.isFinite(n)) return null; return Math.max(0, Math.min(100, Math.round(n))); }
function normalizeProgressMessage(value) { const raw = String(value || '').replace(/\s+/g, ' ').trim(); return raw ? raw.slice(0, 255) : null; }

const persistedUrlFields = new Set(['url','href','primaryUrl','secondaryUrl','primary_url','secondary_url']);
function isSyncableInternalRoute(value, oldRoute) {
  const raw = String(value ?? '').trim();
  if (!raw.startsWith('/') || raw.startsWith('/assets/')) return false;
  return normalizeRoute(raw) === oldRoute;
}
function syncRouteValue(value, oldRoute, newRoute) {
  if (typeof value !== 'string') return { value, changed: false };
  return isSyncableInternalRoute(value, oldRoute) ? { value: newRoute, changed: true } : { value, changed: false };
}
function syncRouteReferences(value, oldRoute, newRoute, key = '') {
  if (Array.isArray(value)) {
    let changed = false;
    const items = value.map((item) => { const result = syncRouteReferences(item, oldRoute, newRoute); changed ||= result.changed; return result.value; });
    return { value: items, changed };
  }
  if (value && typeof value === 'object') {
    let changed = false;
    const next = {};
    for (const [entryKey, entryValue] of Object.entries(value)) {
      const result = persistedUrlFields.has(entryKey) ? syncRouteValue(entryValue, oldRoute, newRoute) : syncRouteReferences(entryValue, oldRoute, newRoute, entryKey);
      changed ||= result.changed;
      next[entryKey] = result.value;
    }
    return { value: next, changed };
  }
  return persistedUrlFields.has(key) ? syncRouteValue(value, oldRoute, newRoute) : { value, changed: false };
}
async function syncContentBlockRouteReferences(conn, oldRoute, newRoute) {
  const [rows] = await conn.query("SELECT id,items,status FROM site_content_blocks WHERE items IS NOT NULL AND status<>? ORDER BY id FOR UPDATE", ['archived']);
  for (const row of rows) {
    let items;
    try { items = typeof row.items === 'string' ? JSON.parse(row.items) : row.items; } catch (error) { throw validationError(`Hibás JSON a tartalmi blokk items mezőben, route szinkron megszakítva: blockId=${row.id}`); }
    const result = syncRouteReferences(items, oldRoute, newRoute);
    if (result.changed) await conn.execute('UPDATE site_content_blocks SET items=? WHERE id=?', [JSON.stringify(result.value), row.id]);
  }
}
async function syncSettingsRouteReferences(conn, oldRoute, newRoute) {
  const [rows] = await conn.query('SELECT `key`,`value` FROM site_settings WHERE `key`=? LIMIT 1 FOR UPDATE', ['defaultCta']);
  const row = rows[0];
  if (!row) return;
  let value;
  try { value = typeof row.value === 'string' ? JSON.parse(row.value) : row.value; } catch { throw validationError('Hibás JSON a defaultCta site_settings értékben, route szinkron megszakítva.'); }
  const result = syncRouteReferences(value, oldRoute, newRoute);
  if (result.changed) await conn.execute('UPDATE site_settings SET `value`=? WHERE `key`=?', [JSON.stringify(result.value), 'defaultCta']);
}
async function syncPersistedRouteReferences(conn, oldRoute, newRoute) {
  if (oldRoute === newRoute) return;
  await syncContentBlockRouteReferences(conn, oldRoute, newRoute);
  await syncSettingsRouteReferences(conn, oldRoute, newRoute);
}


function validateCtaBlockForSave(p, items, existingBlock = null) {
  const submittedCandidate = { ...p, items };
  const existingIsPageCta = existingBlock ? isRecognizedPageCta(existingBlock) : false;
  const submittedIsPageCta = isRecognizedPageCta(submittedCandidate);
  if (existingBlock && !existingIsPageCta && submittedIsPageCta) throw validationError('Manual inline CTA nem alakítható page CTA-vá.');
  const pageCta = existingBlock ? existingIsPageCta : submittedIsPageCta;
  if (!pageCta) return;
  if (existingBlock && String(p.type || existingBlock.type) !== 'cta') throw validationError('Page CTA blokk típusa nem módosítható.');
  p.type = 'cta';
  const first = items[0] && typeof items[0] === 'object' && !Array.isArray(items[0]) ? items[0] : {};
  const existingRole = existingIsPageCta ? pageCtaRole(existingBlock) : '';
  const submittedRoles = pageCtaRoles(submittedCandidate);
  if (submittedRoles.length > 1) throw validationError('Több page CTA role nem menthető egy CTA blokkra.');
  if (existingRole && submittedRoles.length && submittedRoles[0] !== existingRole) throw validationError('Page CTA role nem módosítható.');
  if (existingRole && existingRole !== 'home-legacy-cta') first.presentationRole = existingRole;
  if ('ctaMode' in first && first.ctaMode !== undefined && first.ctaMode !== null && String(first.ctaMode).trim() && !['global', 'custom', 'hidden'].includes(String(first.ctaMode).trim())) throw validationError('Ismeretlen CTA mód.');
  first.ctaMode = normalizeCtaMode(first.ctaMode);
  const required = (v) => String(v ?? '').trim().length > 0;
  const safeUrl = (value) => {
    const raw = String(value ?? '').trim();
    if (!raw) return true;
    return isInternalRouteCandidate(raw) || isValidHttpExternalUrl(raw) || raw.startsWith('mailto:') || raw.startsWith('tel:');
  };
  if (!safeUrl(first.url) || !safeUrl(first.secondaryUrl)) throw validationError('A CTA link csak biztonságos belső vagy http(s) URL lehet.');
  if (first.ctaMode === 'custom' && (!required(p.title) || !required(first.label) || !required(first.url))) throw validationError('Egyedi CTA módban a cím, elsődleges gomb felirat és cél kötelező.');
  if (!items[0]) items[0] = first;
}

export function createAdminRepository(pool) {
  return {

    async getSiteSettings() { const [rows] = await pool.query('SELECT `key`,`value` FROM site_settings WHERE `key` IN (?,?,?,?,?,?,?) ORDER BY `key`', ['analytics','legalDocuments','contact','brand','social','defaultCta','searchVisibility']); return parseSiteSettingsRows(rows); },
    async updateSiteSettings(input, env = process.env) { const settings = normalizeSiteSettings(input); for (const d of settings.legalDocuments.items) await requireLegalPdf(pool, d.pdfPath, env); await requireLogoImage(pool, settings.brand.headerLogoPath, env); await requireLogoImage(pool, settings.brand.footerLogoPath, env); const conn = await pool.getConnection(); try { await conn.beginTransaction(); for (const key of ['analytics','legalDocuments','contact','brand','social','defaultCta','searchVisibility']) await conn.execute('INSERT INTO site_settings (`key`,`value`) VALUES (?,?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`)', [key, JSON.stringify(settings[key])]); await conn.commit(); return settings; } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); } },
    async findAdminUserByEmail(email) { const [r] = await pool.query('SELECT * FROM site_admin_users WHERE email=? LIMIT 1', [email]); return r[0] || null; },
    async markAdminLogin(id) { await pool.execute('UPDATE site_admin_users SET last_login_at=CURRENT_TIMESTAMP WHERE id=?', [id]); },
    async pages() { const [r] = await pool.query('SELECT id, route, slug, type, title, status, sort_order FROM site_pages ORDER BY sort_order, id'); return r; },
    async createPage(p) { const route = normalizeRoute(p.route || p.slug || p.title); if (route === '/') throw validationError('Adj meg érvényes URL-t.'); const slug = route.replace(/^\//, '').replace(/\/$/, '') || 'home'; const hero = normalizeHeroDisplay(p); const heroVideo = await validateVideoConfigForSave(pool, p.hero_video, 'hero'); const pagePresentation = normalizePagePresentation(p.presentation ?? p); const conn = await pool.getConnection(); try { await conn.beginTransaction(); const [existing] = await conn.query('SELECT id FROM site_pages WHERE route=? LIMIT 1 FOR UPDATE', [route]); if (existing[0]) throw validationError('Ez az URL már létezik.'); const [settingsRows] = await conn.query('SELECT `key`,`value` FROM site_settings WHERE `key`=? LIMIT 1 FOR UPDATE', ['defaultCta']); const settings = parseSiteSettingsRows(settingsRows); const cta = canonicalCtaBlockFromDefault(settings.defaultCta); const [r] = await conn.execute('INSERT INTO site_pages (route, slug, type, title, seo_title, seo_description, hero_eyebrow, hero_title, hero_description, hero_asset, hero_video, hero_height, hero_image_fit, hero_image_position_x, hero_image_position_y, hero_image_position_mobile_x, hero_image_position_mobile_y, hero_overlay_strength, hero_image_scale, presentation, status, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [route, slug, p.type || 'content_page', p.title, p.seo_title || p.title, p.seo_description || '', p.hero_eyebrow || '', p.hero_title || p.title, p.hero_description || '', p.hero_asset || '', heroVideo ? JSON.stringify(heroVideo) : null, hero.hero_height, hero.hero_image_fit, hero.hero_image_position_x, hero.hero_image_position_y, hero.hero_image_position_mobile_x, hero.hero_image_position_mobile_y, hero.hero_overlay_strength, hero.hero_image_scale, JSON.stringify(pagePresentation), p.status || 'draft', Number(p.sort_order || 999)]); await conn.execute('INSERT INTO site_content_blocks (page_id, block_key, type, title, body, items, presentation, sort_order, status) VALUES (?,?,?,?,?,?,?,?,?)', [r.insertId, cta.block_key, cta.type, cta.title, cta.body, JSON.stringify(cta.items), null, cta.sort_order, cta.status]); await conn.commit(); return { id: r.insertId, route, slug }; } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); } },
    async page(id) { const [p] = await pool.query('SELECT * FROM site_pages WHERE id=?', [id]); if (!p[0]) return null; const [b] = await pool.query('SELECT * FROM site_content_blocks WHERE page_id=? ORDER BY sort_order,id', [id]); const [settingsRows] = await pool.query('SELECT `key`,`value` FROM site_settings WHERE `key`=? LIMIT 1', ['defaultCta']); const settings = parseSiteSettingsRows(settingsRows); const pageTargetPages = await this.pages(); const data = { page: p[0], blocks: b, defaultCta: settings.defaultCta, navigationUsages: await this.listPageNavigationUsages(id), pageTargetPages }; if (p[0].route === '/' && p[0].type === 'home') data.homeEditor = { editor_revision: computeGenericHomeEditorRevision(p[0], b), pages: pageTargetPages }; return data; },
    async listPageNavigationUsages(pageId) { const [rows] = await pool.query(`SELECT n.id, n.title, n.href, n.status, n.sort_order, n.target_type, n.target_page_id, n.title_override, p.title AS target_title FROM site_navigation_items n LEFT JOIN site_pages p ON p.id=n.target_page_id WHERE n.target_type='page' AND n.target_page_id=? AND n.status<>'archived' ORDER BY n.sort_order,n.id`, [pageId]); return rows.map((row) => ({ id: row.id, title: row.title_override || row.title || row.target_title || `#${row.id}`, status: row.status, sort_order: row.sort_order, target_type: row.target_type, target_page_id: row.target_page_id })); },
    async updatePage(id, p) { const conn = await pool.getConnection(); try { await conn.beginTransaction(); const [pages] = await conn.query('SELECT * FROM site_pages WHERE id=? LIMIT 1 FOR UPDATE', [id]); const currentPage = pages[0]; if (!currentPage) throw new Error(`Page not found: ${id}`); const previousRoute = normalizeRoute(currentPage.route); const merged = { ...currentPage, ...p }; const route = normalizeRoute(merged.route); const isExistingHome = currentPage.route === '/' && currentPage.type === 'home'; if (isExistingHome && (route !== '/' || merged.type !== 'home')) throw validationError('A főoldal route és type mezője nem módosítható.'); if (route === '/' && !isExistingHome) throw validationError('Adj meg érvényes URL-t.'); const [dupe] = await conn.query('SELECT id FROM site_pages WHERE route=? AND id<>? LIMIT 1', [route, id]); if (dupe[0]) throw validationError('Ez az URL már létezik.'); const [usageRows] = await conn.query(`SELECT n.id, n.title, n.href, n.status, n.sort_order, n.target_type, n.target_page_id, n.title_override, p.title AS target_title FROM site_navigation_items n LEFT JOIN site_pages p ON p.id=n.target_page_id WHERE n.target_type='page' AND n.target_page_id=? ORDER BY n.sort_order,n.id FOR UPDATE`, [id]); const usages = usageRows.filter((row) => row.status !== 'archived').map((row) => ({ id: row.id, title: row.title_override || row.title || row.target_title || `#${row.id}`, status: row.status, sort_order: row.sort_order, target_type: row.target_type, target_page_id: row.target_page_id })); const statusChanged = String(currentPage.status) !== String(merged.status); if (statusChanged && activePageUsageBlockers(usages, merged.status).length) throw pageInUseError(usages, merged.status); const slug = route === '/' ? 'home' : (merged.slug || route.replace(/^\//, '').replace(/\/$/, '') || 'home'); const hero = normalizeHeroDisplay(merged); const heroVideo = await validateVideoConfigForSave(conn, merged.hero_video, 'hero'); const pagePresentation = normalizePagePresentation(hasOwn(p, 'presentation') ? p.presentation : (hasOwn(p, 'presentation_hero_variant') ? p : currentPage.presentation)); const [r] = await conn.execute('UPDATE site_pages SET route=?, slug=?, type=?, title=?, seo_title=?, seo_description=?, hero_eyebrow=?, hero_title=?, hero_description=?, hero_asset=?, hero_video=?, hero_height=?, hero_image_fit=?, hero_image_position_x=?, hero_image_position_y=?, hero_image_position_mobile_x=?, hero_image_position_mobile_y=?, hero_overlay_strength=?, hero_image_scale=?, presentation=?, status=?, sort_order=? WHERE id=?', [route, slug, merged.type, merged.title, merged.seo_title, merged.seo_description, merged.hero_eyebrow, merged.hero_title, merged.hero_description, merged.hero_asset, heroVideo ? JSON.stringify(heroVideo) : null, hero.hero_height, hero.hero_image_fit, hero.hero_image_position_x, hero.hero_image_position_y, hero.hero_image_position_mobile_x, hero.hero_image_position_mobile_y, hero.hero_overlay_strength, hero.hero_image_scale, JSON.stringify(pagePresentation), merged.status, Number(merged.sort_order || 0), id]); if (r.affectedRows === 0) throw new Error(`Page not found: ${id}`); await conn.execute("UPDATE site_navigation_items SET href=?, title=COALESCE(title_override, ?) WHERE target_type='page' AND target_page_id=?", [route, merged.title, id]); await syncPersistedRouteReferences(conn, previousRoute, route); await conn.commit(); } catch (error) { await conn.rollback(); if (error.code === 'ER_DUP_ENTRY') throw navigationConflictError('DUPLICATE_NAVIGATION_HREF', 'Az új oldal URL ütközne egy meglévő menüpont linkjével.'); throw error; } finally { conn.release(); } },
    async upsertBlock(p) {
      let existingBlock = null;
      if (p.id) { const [rows] = await pool.query('SELECT * FROM site_content_blocks WHERE id=? LIMIT 1', [p.id]); existingBlock = rows[0] || null; }
      if (isHomeCanonicalKey(existingBlock?.block_key || p.block_key)) { const e = validationError('Canonical főoldali blokk csak a főoldal szerkesztővel módosítható.'); e.code = 'HOME_CANONICAL_USE_HOME_EDITOR'; throw e; }
      let rawItems = parseJsonItems(p.items);
      let targetPages = [];
      if (['cards','card-grid','related-links'].includes(String(p.type))) { const ids = [...new Set((Array.isArray(rawItems) ? rawItems : []).flatMap((entry) => entry?.version === 2 ? [...(entry.cards || []), entry.action || null] : [entry]).map((entry) => Number(entry?.target_page_id)).filter((id) => Number.isSafeInteger(id) && id > 0))]; if (ids.length) { const [rows] = await pool.query(`SELECT id,route,slug,type,title,status,seo_description,hero_description,sort_order FROM site_pages WHERE id IN (${ids.map(()=>'?').join(',')}) ORDER BY id`, ids); targetPages = rows; } }
      const items = ['cards','card-grid','related-links'].includes(String(p.type)) ? normalizeBlockItemsByType(p.type, rawItems, { pages: targetPages, requirePublishedTargets: true, path: 'items' }) : normalizeBlockItems(p.type, rawItems); if (String(p.type) === 'related-links') await validateRelatedLinksItems(pool, items);
      validateCtaBlockForSave(p, items, existingBlock);
      if (isRecognizedPageCta(existingBlock ? { ...p, block_key: existingBlock.block_key, type: existingBlock.type, items } : { ...p, items })) p.status = 'published';
      if (p.type === 'video') {
        const cfg = items[0];
        if (cfg.sourceType === 'media') await requireReadyMedia(pool, cfg.mediaPath, 'video');
        if (cfg.poster) await requireReadyMedia(pool, cfg.poster, 'image');
      }
      if (p.id) {
        const [r] = await pool.execute('UPDATE site_content_blocks SET type=?, title=?, body=?, items=?, presentation=?, sort_order=?, status=? WHERE id=?', [p.type, p.title, p.body, JSON.stringify(items), (() => { const v = mergeBlockPresentationForSave(p.presentation, existingBlock, p.presentation_visible_keys); return v ? JSON.stringify(v) : null; })(), Number(p.sort_order || 0), p.status, p.id]);
        if (r.affectedRows === 0) throw new Error(`Block not found: ${p.id}`);
        return { id: p.id };
      }
      const blockKey = p.block_key || `manual:${crypto.randomUUID()}`;
      const [r] = await pool.execute('INSERT INTO site_content_blocks (page_id, block_key, type, title, body, items, presentation, sort_order, status) VALUES (?,?,?,?,?,?,?,?,?)', [p.page_id, blockKey, p.type, p.title, p.body, JSON.stringify(items), (() => { const v = mergeBlockPresentationForSave(p.presentation, existingBlock, p.presentation_visible_keys); return v ? JSON.stringify(v) : null; })(), Number(p.sort_order || 0), p.status]);
      return { id: r.insertId, block_key: blockKey };
    },
    async deleteBlock(id) { const [rows] = await pool.query('SELECT block_key FROM site_content_blocks WHERE id=? LIMIT 1', [id]); if (isHomeCanonicalKey(rows[0]?.block_key)) { const e = validationError('Canonical főoldali blokk nem törölhető.'); e.code = 'HOME_CANONICAL_USE_HOME_EDITOR'; throw e; } const [r] = await pool.execute('UPDATE site_content_blocks SET status=? WHERE id=?', ['archived', id]); if (r.affectedRows === 0) throw new Error(`Block not found: ${id}`); },

    async updateHomePageAtomic(id, payload = {}) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [pages] = await conn.query('SELECT * FROM site_pages WHERE id=? LIMIT 1 FOR UPDATE', [id]);
        const page = pages[0];
        if (!page || page.route !== '/' || page.type !== 'home') throw homeValidationError('Csak a route=/ type=home oldal menthető ezzel az endpointtal.', { page: 'Nem főoldal.' }, 'INVALID_HOME');
if (Array.isArray(payload.blocks)) {
          const [allBlocks] = await conn.query('SELECT * FROM site_content_blocks WHERE page_id=? ORDER BY sort_order,id FOR UPDATE', [id]);
          const currentRevision = computeGenericHomeEditorRevision(page, allBlocks);
          assertEditorRevision(payload, currentRevision);
          const normalizedPage = { ...page, ...(payload.page || {}), route: '/', type: 'home', slug: page.slug || 'home', status: page.status, sort_order: page.sort_order };
          const hero = normalizeHeroDisplay(normalizedPage);
          const heroVideo = await validateVideoConfigForSave(conn, normalizedPage.hero_video, 'hero');
          const fieldErrors = {};
          const seenIds = new Set(), seenKeys = new Set(), seenOrders = new Set();
          const existingById = new Map(allBlocks.map((b)=>[Number(b.id), b]));
          const targetIds = [...new Set((payload.blocks || []).flatMap((raw) => {
            const parsed = Array.isArray(raw.items) ? raw.items : parseJsonItems(raw.items);
            return parsed.flatMap((entry) => entry?.version === 2 ? [...(entry.cards || []), entry.action || null] : [entry]).map((entry)=>Number(entry?.target_page_id)).filter((n)=>Number.isSafeInteger(n)&&n>0);
          }))].sort((a,b)=>a-b);
          let pageRows = [];
          if (targetIds.length) { const [rows] = await conn.query(`SELECT id,route,slug,type,title,status,seo_description,hero_description,sort_order FROM site_pages WHERE id IN (${targetIds.map(()=>'?').join(',')}) ORDER BY id FOR UPDATE`, targetIds); pageRows = rows; }
          const planned = [];
          const blockMappings = [];
          for (const [index, raw] of payload.blocks.entries()) {
            const path = `blocks.${raw.client_key || raw.id || index}`;
            const blockId = raw.id ? Number(raw.id) : 0;
            if (blockId && seenIds.has(blockId)) fieldErrors[`${path}.id`] = 'Duplikált blokk id.';
            if (blockId) seenIds.add(blockId);
            const existing = blockId ? existingById.get(blockId) : null;
            if (blockId && !existing) fieldErrors[`${path}.id`] = 'A blokk nem ehhez a főoldalhoz tartozik.';
            const block_key = existing?.block_key || raw.block_key || `manual:${crypto.randomUUID()}`;
            if (isHomeCanonicalKey(block_key)) fieldErrors[`${path}.block_key`] = 'Hero meta nem lehet tartalmi komponens.';
            if (seenKeys.has(block_key)) fieldErrors[`${path}.block_key`] = 'Duplikált block_key.';
            seenKeys.add(block_key);
            const sort_order = Number(raw.sort_order || 0);
            if (seenOrders.has(sort_order)) fieldErrors[`${path}.sort_order`] = 'Duplikált sorrend.';
            seenOrders.add(sort_order);
            const type = String(raw.type || existing?.type || 'text');
            const parsedItems = Array.isArray(raw.items) ? raw.items : parseJsonItems(raw.items);
            let items = [];
            try { items = normalizeBlockItemsByType(type, parsedItems, { block: raw, status: raw.status || 'published', pages: pageRows, requirePublishedTargets: ['cards','card-grid'].includes(type), path: `${path}.items`, fieldErrors }); }
            catch (error) { fieldErrors[`${path}.items`] = error.message || 'Hibás blokk tartalom.'; }
            planned.push({ existing, blockId, client_key: raw.client_key || '', block_key, type, title: raw.title || '', body: raw.body || '', items, sort_order, status: raw.status || 'published' });
          }
          for (const rawId of payload.archived_block_ids || []) { const blockId = Number(rawId); const existing = existingById.get(blockId); if (!existing || isHomeCanonicalKey(existing.block_key)) fieldErrors[`archived_block_ids.${blockId}`] = 'A blokk nem archiválható.'; }
          if (Object.keys(fieldErrors).length) throw homeValidationError('A főoldal tartalma hibás.', fieldErrors);
          const [pageUpdate] = await conn.execute('UPDATE site_pages SET route=?, slug=?, type=?, title=?, seo_title=?, seo_description=?, hero_eyebrow=?, hero_title=?, hero_description=?, hero_asset=?, hero_video=?, hero_height=?, hero_image_fit=?, hero_image_position_x=?, hero_image_position_y=?, hero_image_position_mobile_x=?, hero_image_position_mobile_y=?, hero_overlay_strength=?, hero_image_scale=? WHERE id=?', ['/', page.slug || 'home', 'home', normalizedPage.title, normalizedPage.seo_title, normalizedPage.seo_description, normalizedPage.hero_eyebrow, normalizedPage.hero_title, normalizedPage.hero_description, normalizedPage.hero_asset, heroVideo ? JSON.stringify(heroVideo) : null, hero.hero_height, hero.hero_image_fit, hero.hero_image_position_x, hero.hero_image_position_y, hero.hero_image_position_mobile_x, hero.hero_image_position_mobile_y, hero.hero_overlay_strength, hero.hero_image_scale, id]);
          if (pageUpdate.affectedRows !== 1) throw new Error(`Page not found: ${id}`);
          for (const item of planned) {
            if (item.existing) { const [r] = await conn.execute('UPDATE site_content_blocks SET type=?, title=?, body=?, items=?, sort_order=?, status=? WHERE id=? AND page_id=?', [item.type, item.title, item.body, JSON.stringify(item.items), item.sort_order, item.status, item.blockId, id]); if (r.affectedRows !== 1) throw new Error(`Block update failed: ${item.blockId}`); }
            else { const [r] = await conn.execute('INSERT INTO site_content_blocks (page_id, block_key, type, title, body, items, sort_order, status) VALUES (?,?,?,?,?,?,?,?)', [id, item.block_key, item.type, item.title, item.body, JSON.stringify(item.items), item.sort_order, item.status]); item.blockId = r.insertId; blockMappings.push({ client_key: item.client_key, id: r.insertId, block_key: item.block_key }); }
          }
          for (const rawId of payload.archived_block_ids || []) { const blockId = Number(rawId); const [r] = await conn.execute('UPDATE site_content_blocks SET status=? WHERE id=? AND page_id=?', ['archived', blockId, id]); if (r.affectedRows !== 1) throw new Error(`Block archive failed: ${blockId}`); }
          const [freshPages] = await conn.query('SELECT * FROM site_pages WHERE id=? LIMIT 1', [id]);
          const [freshBlocks] = await conn.query('SELECT * FROM site_content_blocks WHERE page_id=? ORDER BY sort_order,id', [id]);
          const editor_revision = computeGenericHomeEditorRevision(freshPages[0], freshBlocks);
          await conn.commit();
          return { page: freshPages[0], blocks: homeEditableBlocks(freshBlocks), block_mappings: blockMappings, editor_revision, warnings: [] };
        }
        throw homeValidationError('A főoldal szerkesztése csak generic aggregate block payloadot fogad.', { blocks: 'Hiányzó blokkok.' }, 'INVALID_HOME');
      } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
    },
    async nav() { const [r] = await pool.query('SELECT n.*, p.route AS target_route, p.title AS target_title FROM site_navigation_items n LEFT JOIN site_pages p ON p.id=n.target_page_id ORDER BY n.sort_order,n.id'); return r.map((row) => { const normalized = normalizeNavigationSnapshotRow(row); const resolved = resolveNavigationItem(normalized, normalized.target_type === 'page' && row.target_route ? { id: normalized.target_page_id, route: row.target_route, title: row.target_title } : null); return { ...normalized, title: resolved.title, href: resolved.href }; }); },
    async updateNav(items) { const conn = await pool.getConnection(); const savedIds = []; try { await conn.beginTransaction(); validateUniqueNavigationHrefs(items); for (const item of items) normalizeNavSortOrder(item.sort_order); const existingIds = [...new Set(items.map((item) => item.id && /^\d+$/.test(String(item.id)) ? Number(item.id) : null).filter(Boolean))]; const existingById = new Map(); if (existingIds.length) { for (const id of existingIds) { const [existingRows] = await conn.query('SELECT * FROM site_navigation_items WHERE id=? LIMIT 1', [id]); if (existingRows[0]) existingById.set(Number(existingRows[0].id), existingRows[0]); } } const effectivePageTargetIds = new Set(); for (const item of items) { if (item.status !== 'published') continue; const existing = item.id ? existingById.get(Number(item.id)) : null; const explicitType = hasOwn(item, 'target_type'); const effectiveType = explicitType ? normalizeNavigationTargetType(item.target_type) : normalizeNavigationTargetType(existing?.target_type); const effectivePageId = explicitType ? positiveNavigationPageId(item.target_page_id) : positiveNavigationPageId(existing?.target_page_id); if (effectiveType === 'page' && effectivePageId) effectivePageTargetIds.add(effectivePageId); } const pageTargetIds = [...effectivePageTargetIds].sort((a, b) => a - b); const statusById = new Map(); if (pageTargetIds.length) { const [targetPages] = await conn.query(`SELECT id,status FROM site_pages WHERE id IN (${pageTargetIds.map(() => '?').join(',')}) ORDER BY id FOR UPDATE`, pageTargetIds); for (const page of targetPages) statusById.set(Number(page.id), page.status); for (const pageId of pageTargetIds) if (statusById.has(pageId) && statusById.get(pageId) !== 'published') throw navigationConflictError('NAVIGATION_TARGET_PAGE_NOT_PUBLISHED', 'Publikus menüpont csak publikus oldalra mutathat.', { targetPageId: pageId, pageStatus: statusById.get(pageId) || null }); } await validateNavigationHrefConflicts(conn, items); for (const item of items) { const sortOrder = normalizeNavSortOrder(item.sort_order); if (item.id) { const [rows] = await conn.query('SELECT * FROM site_navigation_items WHERE id=? LIMIT 1 FOR UPDATE', [item.id]); const existing = rows[0]; if (!existing) throw new Error(`Navigation item not found: ${item.id}`); const patch = await normalizeNavTargetPatch(conn, item, existing); if (item.status === 'published' && patch.target_type === 'page') { const pageId = positiveNavigationPageId(patch.target_page_id); if (!pageId || (!pageTargetIds.includes(pageId) && !statusById.has(pageId))) throw navigationConflictError('NAVIGATION_TARGET_PAGE_NOT_PUBLISHED', 'A menüpont céloldala időközben megváltozott, próbáld újra.', { targetPageId: pageId || null }); if (statusById.has(pageId) && statusById.get(pageId) !== 'published') throw navigationConflictError('NAVIGATION_TARGET_PAGE_NOT_PUBLISHED', 'Publikus menüpont csak publikus oldalra mutathat.', { targetPageId: pageId, pageStatus: statusById.get(pageId) || null }); } if (patch.target_type !== undefined) await conn.execute('UPDATE site_navigation_items SET title=?, href=?, sort_order=?, status=?, target_type=?, target_page_id=?, title_override=? WHERE id=?', [item.title, item.href, sortOrder, item.status, patch.target_type, patch.target_page_id, patch.title_override, item.id]); else await conn.execute('UPDATE site_navigation_items SET title=?, href=?, sort_order=?, status=? WHERE id=?', [item.title, item.href, sortOrder, item.status, item.id]); savedIds.push(Number(item.id)); } else { const patch = await normalizeNavTargetPatch(conn, item, { target_type: 'legacy', target_page_id: null, title_override: null }); if (item.status === 'published' && patch.target_type === 'page') { const pageId = positiveNavigationPageId(patch.target_page_id); if (!pageId || (!pageTargetIds.includes(pageId) && !statusById.has(pageId))) throw navigationConflictError('NAVIGATION_TARGET_PAGE_NOT_PUBLISHED', 'Publikus menüpont csak publikus oldalra mutathat.', { targetPageId: pageId || null }); } const [result] = await conn.execute('INSERT INTO site_navigation_items (title, href, target_type, target_page_id, title_override, sort_order, status) VALUES (?,?,?,?,?,?,?)', [item.title, item.href, patch.target_type || 'legacy', patch.target_page_id ?? null, patch.title_override ?? null, sortOrder, item.status]); savedIds.push(Number(result.insertId)); } } await conn.commit(); return savedIds; } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); } },
    async listMedia({ includeArchived = false } = {}) { const [r] = includeArchived ? await pool.query('SELECT * FROM site_media_assets ORDER BY created_at DESC, id DESC') : await pool.query('SELECT * FROM site_media_assets WHERE status<>? ORDER BY created_at DESC, id DESC', ['archived']); return r; },
    async getMedia(id) { const [r] = await pool.query('SELECT * FROM site_media_assets WHERE id=? LIMIT 1', [id]); return r[0] || null; },
    async createMedia(p) { const [r] = await pool.execute('INSERT INTO site_media_assets (path, alt, type, status, processing_status, staging_path, original_size_bytes, final_size_bytes, processing_error, processing_progress_percent, processing_progress_message, processing_progress_updated_at, duration_seconds, width, height) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [p.path, p.alt || '', p.type || '', p.status || 'active', p.processing_status || 'ready', p.staging_path || null, p.original_size_bytes || null, p.final_size_bytes || null, p.processing_error || null, p.processing_progress_percent ?? null, p.processing_progress_message || null, p.processing_progress_percent == null ? null : new Date(), p.duration_seconds || null, p.width || null, p.height || null]); return { id: r.insertId, path: p.path, alt: p.alt || '', type: p.type || '', status: p.status || 'active', processing_status: p.processing_status || 'ready', staging_path: p.staging_path || null, original_size_bytes: p.original_size_bytes || null, final_size_bytes: p.final_size_bytes || null, processing_error: p.processing_error || null, processing_progress_percent: p.processing_progress_percent ?? null, processing_progress_message: p.processing_progress_message || null, duration_seconds: p.duration_seconds || null, width: p.width || null, height: p.height || null }; },
    async updateMedia(id, p) { const media = await this.getMedia(id); if (!media) return null; const status = p.status || media.status; if (!['active','archived'].includes(status)) throw validationError('Hibás média státusz.'); if (status === 'archived' && media.status !== 'archived') await requirePdfNotUsedAsLegalDocument(pool, media); await pool.execute('UPDATE site_media_assets SET alt=?, status=? WHERE id=?', [p.alt ?? media.alt ?? '', status, id]); return { ...media, alt: p.alt ?? media.alt ?? '', status }; },
    async archiveMedia(id) { const media = await this.getMedia(id); if (!media) return null; await requirePdfNotUsedAsLegalDocument(pool, media); await pool.execute('UPDATE site_media_assets SET status=? WHERE id=?', ['archived', id]); return { ...media, status: 'archived' }; },
    async claimNextMediaProcessingJob() { const conn = await pool.getConnection(); try { await conn.beginTransaction(); const [rows] = await conn.query("SELECT * FROM site_media_assets WHERE status<>'archived' AND processing_status='queued' ORDER BY id ASC LIMIT 1 FOR UPDATE SKIP LOCKED"); const media = rows[0]; if (!media) { await conn.commit(); return null; } await conn.execute("UPDATE site_media_assets SET processing_status='processing', processing_started_at=CURRENT_TIMESTAMP, processing_error=NULL, processing_progress_percent=0, processing_progress_message='Feldolgozás indult', processing_progress_updated_at=CURRENT_TIMESTAMP WHERE id=? AND processing_status='queued'", [media.id]); await conn.commit(); return { ...media, processing_status: 'processing', processing_started_at: new Date(), processing_progress_percent: 0, processing_progress_message: 'Feldolgozás indult' }; } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); } },
    async recoverStaleMediaProcessingJobs({ timeoutSeconds = 3600 } = {}) { const [r] = await pool.execute("UPDATE site_media_assets SET processing_status='queued', processing_started_at=NULL, processing_progress_percent=NULL, processing_progress_message=NULL, processing_progress_updated_at=NULL, processing_error='Stale processing job recovered.' WHERE status<>'archived' AND processing_status='processing' AND processing_started_at IS NOT NULL AND processing_started_at < (CURRENT_TIMESTAMP - INTERVAL ? SECOND)", [Number(timeoutSeconds || 3600)]); return r.affectedRows || 0; },
    async markMediaProgress(id, p = {}) { const percent = normalizeProgressPercent(p.processing_progress_percent); const message = normalizeProgressMessage(p.processing_progress_message); if (percent == null && !message) return this.getMedia(id); await pool.execute("UPDATE site_media_assets SET processing_progress_percent=COALESCE(?, processing_progress_percent), processing_progress_message=COALESCE(?, processing_progress_message), processing_progress_updated_at=CURRENT_TIMESTAMP, duration_seconds=COALESCE(?, duration_seconds) WHERE id=? AND processing_status='processing'", [percent, message, p.duration_seconds || null, id]); return this.getMedia(id); },
    async markMediaReady(id, p = {}) { await pool.execute("UPDATE site_media_assets SET processing_status='ready', staging_path=NULL, original_size_bytes=?, final_size_bytes=?, processing_error=NULL, processing_progress_percent=100, processing_progress_message='Kész', processing_progress_updated_at=CURRENT_TIMESTAMP, duration_seconds=?, width=?, height=?, processing_finished_at=CURRENT_TIMESTAMP WHERE id=?", [p.original_size_bytes || null, p.final_size_bytes || null, p.duration_seconds || null, p.width || null, p.height || null, id]); return this.getMedia(id); },
    async markMediaFailed(id, p = {}) { await pool.execute("UPDATE site_media_assets SET processing_status='failed', staging_path=NULL, processing_progress_message='Sikertelen', processing_progress_updated_at=CURRENT_TIMESTAMP, processing_error=?, processing_finished_at=CURRENT_TIMESTAMP WHERE id=?", [p.processing_error || 'Videó feldolgozási hiba.', id]); return this.getMedia(id); },
    async exportContentSnapshot() {
      const [pages] = await pool.query('SELECT * FROM site_pages ORDER BY id');
      const [blocks] = await pool.query('SELECT * FROM site_content_blocks ORDER BY id');
      const [navigation] = await pool.query('SELECT * FROM site_navigation_items ORDER BY id');
      const [settings] = await pool.query('SELECT * FROM site_settings ORDER BY `key`');
      const [media] = await pool.query('SELECT * FROM site_media_assets ORDER BY id');
      return { pages, blocks, navigation, settings, media };
    },
    async importContentSnapshot(content) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query('DELETE FROM site_content_blocks');
        await conn.query('DELETE FROM site_navigation_items');
        await conn.query('DELETE FROM site_pages');
        await conn.query('DELETE FROM site_settings');
        await conn.query('DELETE FROM site_media_assets');
        for (const p of content.pages || []) await conn.query('INSERT INTO site_pages SET ?', [p]);
        for (const b of content.blocks || []) await conn.query('INSERT INTO site_content_blocks SET ?', [b]);
        const validPageIds = new Set((content.pages || []).map((p) => Number(p.id)).filter((id) => Number.isSafeInteger(id) && id > 0));
        for (const n of content.navigation || []) await conn.query('INSERT INTO site_navigation_items SET ?', [normalizeNavigationSnapshotRow(n, { validPageIds })]);
        for (const st of content.settings || []) await conn.query('INSERT INTO site_settings SET ?', [st]);
        for (const m of content.media || []) await conn.query('INSERT INTO site_media_assets SET ?', [m]);
        await conn.commit();
      } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
    },
    async createPublishSnapshot(snapshot) { const [r] = await pool.execute('INSERT INTO site_publish_snapshots (created_by_admin_id,label,content_json,content_hash,status) VALUES (?,?,?,?,?)', [snapshot.created_by_admin_id, snapshot.label, JSON.stringify(snapshot.content_json), snapshot.content_hash, snapshot.status]); return r.insertId; },
    async markPublishStarted(id) { await pool.execute('UPDATE site_publish_snapshots SET build_started_at=CURRENT_TIMESTAMP WHERE id=?', [id]); },
    async markPublishFinished(id, p) { if (p.status === 'success') await pool.execute('UPDATE site_publish_snapshots SET is_current=0 WHERE status=\'success\''); await pool.execute('UPDATE site_publish_snapshots SET status=?, build_finished_at=CURRENT_TIMESTAMP, build_log_excerpt=?, release_path=?, is_current=? WHERE id=?', [p.status, p.build_log_excerpt || null, p.release_path || null, p.status === 'success' ? 1 : 0, id]); },
    async prunePublishSnapshots(limit = 20) { await pool.execute('DELETE FROM site_publish_snapshots WHERE status=\'success\' AND id NOT IN (SELECT id FROM (SELECT id FROM site_publish_snapshots WHERE status=\'success\' ORDER BY created_at DESC, id DESC LIMIT ?) keepers)', [limit]); },
    async publishSnapshots(limit = 20) { const [r] = await pool.query('SELECT id, created_at, created_by_admin_id, label, content_hash, status, build_started_at, build_finished_at, build_log_excerpt, release_path, is_current FROM site_publish_snapshots WHERE status=\'success\' ORDER BY created_at DESC, id DESC LIMIT ?', [limit]); return r; },
    async publishStatus() { const [success] = await pool.query('SELECT id, created_at, content_hash, is_current FROM site_publish_snapshots WHERE status=\'success\' ORDER BY created_at DESC, id DESC LIMIT 1'); const [failed] = await pool.query('SELECT id, build_finished_at, build_log_excerpt FROM site_publish_snapshots WHERE status=\'failed\' ORDER BY created_at DESC, id DESC LIMIT 1'); return { lastSuccess: success[0] || null, lastError: failed[0] || null }; },
    async publishSnapshot(id) { const [r] = await pool.query('SELECT * FROM site_publish_snapshots WHERE id=? AND status=\'success\' LIMIT 1', [id]); if (!r[0]) return null; return { ...r[0], content_json: typeof r[0].content_json === 'string' ? JSON.parse(r[0].content_json) : r[0].content_json }; },
  };
}
