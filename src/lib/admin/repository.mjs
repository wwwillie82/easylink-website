import crypto from 'node:crypto';
import { normalizeBlockItems, parseJsonItems } from './validation.mjs';
import { imageMimeTypes, normalizeVideoConfig, videoMimeTypes } from '../content/video.mjs';
import { normalizeSiteSettings, parseSiteSettingsRows } from './settings.mjs';
import { mediaConfig } from './media-storage.mjs';

function normalizeRoute(value) { const raw = String(value || '').trim().toLowerCase().replace(/[^a-z0-9áéíóöőúüű\/-]+/g, '-'); const withStart = raw.startsWith('/') ? raw : `/${raw}`; return withStart.endsWith('/') ? withStart : `${withStart}/`; }
function validationError(message) { const error = new Error(message); error.code = 'VALIDATION_ERROR'; error.status = 400; return error; }

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
  const used = Object.values(settings.legalDocuments || {}).some((path) => path && path === media.path);
  if (used) throw validationError('A dokumentum jelenleg jogi dokumentumként van használatban. Előbb távolítsd el az Alapadatok oldalon.');
}

async function requireLegalPdf(pool, pdfPath, env = process.env) {
  if (!pdfPath) return;
  const base = `${mediaConfig(env).publicBase}/`;
  if (!String(pdfPath).startsWith(base)) throw validationError('Csak feltöltött PDF dokumentum választható.');
  const [rows] = await pool.query('SELECT path,type,status,processing_status FROM site_media_assets WHERE path=? LIMIT 1', [pdfPath]);
  const media = rows[0];
  if (!media || media.status === 'archived' || media.processing_status !== 'ready' || media.type !== 'application/pdf') throw validationError('Csak aktív, kész PDF dokumentum választható.');
}

async function validateVideoConfigForSave(pool, value, context) {
  const config = normalizeVideoConfig(jsonOrNull(value), { context, allowNull: context === 'hero' });
  if (!config) return null;
  if (config.sourceType === 'media') await requireReadyMedia(pool, config.mediaPath, 'video');
  if (config.poster) await requireReadyMedia(pool, config.poster, 'image');
  return config;
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
function normalizeProgressPercent(value) { const n = Number(value); if (!Number.isFinite(n)) return null; return Math.max(0, Math.min(100, Math.round(n))); }
function normalizeProgressMessage(value) { const raw = String(value || '').replace(/\s+/g, ' ').trim(); return raw ? raw.slice(0, 255) : null; }

export function createAdminRepository(pool) {
  return {

    async getSiteSettings() { const [rows] = await pool.query('SELECT `key`,`value` FROM site_settings WHERE `key` IN (?,?) ORDER BY `key`', ['analytics','legalDocuments']); return parseSiteSettingsRows(rows); },
    async updateSiteSettings(input, env = process.env) { const settings = normalizeSiteSettings(input); await requireLegalPdf(pool, settings.legalDocuments.termsPdfPath, env); await requireLegalPdf(pool, settings.legalDocuments.privacyPdfPath, env); await requireLegalPdf(pool, settings.legalDocuments.cookiePdfPath, env); const conn = await pool.getConnection(); try { await conn.beginTransaction(); for (const key of ['analytics','legalDocuments']) await conn.execute('INSERT INTO site_settings (`key`,`value`) VALUES (?,?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`)', [key, JSON.stringify(settings[key])]); await conn.commit(); return settings; } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); } },
    async findAdminUserByEmail(email) { const [r] = await pool.query('SELECT * FROM site_admin_users WHERE email=? LIMIT 1', [email]); return r[0] || null; },
    async markAdminLogin(id) { await pool.execute('UPDATE site_admin_users SET last_login_at=CURRENT_TIMESTAMP WHERE id=?', [id]); },
    async pages() { const [r] = await pool.query('SELECT id, route, slug, type, title, status, sort_order FROM site_pages ORDER BY sort_order, id'); return r; },
    async createPage(p) { const route = normalizeRoute(p.route || p.slug || p.title); if (route === '/') throw validationError('Adj meg érvényes URL-t.'); const [existing] = await pool.query('SELECT id FROM site_pages WHERE route=? LIMIT 1', [route]); if (existing[0]) throw validationError('Ez az URL már létezik.'); const slug = route.replace(/^\//, '').replace(/\/$/, '') || 'home'; const hero = normalizeHeroDisplay(p); const heroVideo = await validateVideoConfigForSave(pool, p.hero_video, 'hero'); const [r] = await pool.execute('INSERT INTO site_pages (route, slug, type, title, seo_title, seo_description, hero_eyebrow, hero_title, hero_description, hero_asset, hero_video, hero_height, hero_image_fit, hero_image_position_x, hero_image_position_y, hero_image_position_mobile_x, hero_image_position_mobile_y, hero_overlay_strength, hero_image_scale, status, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [route, slug, p.type || 'content_page', p.title, p.seo_title || p.title, p.seo_description || '', p.hero_eyebrow || '', p.hero_title || p.title, p.hero_description || '', p.hero_asset || '', heroVideo ? JSON.stringify(heroVideo) : null, hero.hero_height, hero.hero_image_fit, hero.hero_image_position_x, hero.hero_image_position_y, hero.hero_image_position_mobile_x, hero.hero_image_position_mobile_y, hero.hero_overlay_strength, hero.hero_image_scale, p.status || 'draft', Number(p.sort_order || 999)]); return { id: r.insertId, route, slug }; },
    async page(id) { const [p] = await pool.query('SELECT * FROM site_pages WHERE id=?', [id]); if (!p[0]) return null; const [b] = await pool.query('SELECT * FROM site_content_blocks WHERE page_id=? ORDER BY sort_order,id', [id]); return { page: p[0], blocks: b }; },
    async updatePage(id, p) { const current = await this.page(id); if (!current) throw new Error(`Page not found: ${id}`); const merged = { ...current.page, ...p }; const route = normalizeRoute(merged.route); const isExistingHome = current.page.route === '/' || current.page.type === 'home'; if (route === '/' && !isExistingHome) throw validationError('Adj meg érvényes URL-t.'); const [dupe] = await pool.query('SELECT id FROM site_pages WHERE route=? AND id<>? LIMIT 1', [route, id]); if (dupe[0]) throw validationError('Ez az URL már létezik.'); const slug = route === '/' ? 'home' : (merged.slug || route.replace(/^\//, '').replace(/\/$/, '') || 'home'); const hero = normalizeHeroDisplay(merged); const heroVideo = await validateVideoConfigForSave(pool, merged.hero_video, 'hero'); const [r] = await pool.execute('UPDATE site_pages SET route=?, slug=?, type=?, title=?, seo_title=?, seo_description=?, hero_eyebrow=?, hero_title=?, hero_description=?, hero_asset=?, hero_video=?, hero_height=?, hero_image_fit=?, hero_image_position_x=?, hero_image_position_y=?, hero_image_position_mobile_x=?, hero_image_position_mobile_y=?, hero_overlay_strength=?, hero_image_scale=?, status=?, sort_order=? WHERE id=?', [route, slug, merged.type, merged.title, merged.seo_title, merged.seo_description, merged.hero_eyebrow, merged.hero_title, merged.hero_description, merged.hero_asset, heroVideo ? JSON.stringify(heroVideo) : null, hero.hero_height, hero.hero_image_fit, hero.hero_image_position_x, hero.hero_image_position_y, hero.hero_image_position_mobile_x, hero.hero_image_position_mobile_y, hero.hero_overlay_strength, hero.hero_image_scale, merged.status, Number(merged.sort_order || 0), id]); if (r.affectedRows === 0) throw new Error(`Page not found: ${id}`); },
    async upsertBlock(p) {
      const items = normalizeBlockItems(p.type, parseJsonItems(p.items));
      if (p.type === 'video') {
        const cfg = items[0];
        if (cfg.sourceType === 'media') await requireReadyMedia(pool, cfg.mediaPath, 'video');
        if (cfg.poster) await requireReadyMedia(pool, cfg.poster, 'image');
      }
      if (p.id) {
        const [r] = await pool.execute('UPDATE site_content_blocks SET type=?, title=?, body=?, items=?, sort_order=?, status=? WHERE id=?', [p.type, p.title, p.body, JSON.stringify(items), Number(p.sort_order || 0), p.status, p.id]);
        if (r.affectedRows === 0) throw new Error(`Block not found: ${p.id}`);
        return { id: p.id };
      }
      const blockKey = p.block_key || `manual:${crypto.randomUUID()}`;
      const [r] = await pool.execute('INSERT INTO site_content_blocks (page_id, block_key, type, title, body, items, sort_order, status) VALUES (?,?,?,?,?,?,?,?)', [p.page_id, blockKey, p.type, p.title, p.body, JSON.stringify(items), Number(p.sort_order || 0), p.status]);
      return { id: r.insertId, block_key: blockKey };
    },
    async deleteBlock(id) { const [r] = await pool.execute('UPDATE site_content_blocks SET status=? WHERE id=?', ['archived', id]); if (r.affectedRows === 0) throw new Error(`Block not found: ${id}`); },
    async nav() { const [r] = await pool.query('SELECT * FROM site_navigation_items ORDER BY sort_order,id'); return r; },
    async updateNav(items) { for (const item of items) { if (item.id) { const [existing] = await pool.query('SELECT id FROM site_navigation_items WHERE id=? LIMIT 1', [item.id]); if (!existing[0]) throw new Error(`Navigation item not found: ${item.id}`); await pool.execute('UPDATE site_navigation_items SET title=?, href=?, sort_order=?, status=? WHERE id=?', [item.title, item.href, Number(item.sort_order || 0), item.status, item.id]); } else { await pool.execute('INSERT INTO site_navigation_items (title, href, sort_order, status) VALUES (?,?,?,?)', [item.title, item.href, Number(item.sort_order || 0), item.status]); } } },
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
        await conn.query('DELETE FROM site_pages');
        await conn.query('DELETE FROM site_navigation_items');
        await conn.query('DELETE FROM site_settings');
        await conn.query('DELETE FROM site_media_assets');
        for (const p of content.pages || []) await conn.query('INSERT INTO site_pages SET ?', [p]);
        for (const b of content.blocks || []) await conn.query('INSERT INTO site_content_blocks SET ?', [b]);
        for (const n of content.navigation || []) await conn.query('INSERT INTO site_navigation_items SET ?', [n]);
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
