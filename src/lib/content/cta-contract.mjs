import { DEFAULT_SITE_SETTINGS, normalizeSiteSettings } from '../admin/settings.mjs';
export const GOLDEN_CTA_KEY = 'golden:cta-section';
export const CTA_SECTION_ROLE = 'cta-section';
export const PRICING_CTA_ROLE = 'pricing-cta';
export const CTA_SECTION_SORT_ORDER = 900;
const parseItems = (items) => Array.isArray(items) ? items : (typeof items === 'string' && items.trim() ? JSON.parse(items) : []);
export function normalizeDefaultCta(value = {}) { return normalizeSiteSettings({ defaultCta: value }).defaultCta; }
function envDefaultCta() { const envUrl = process.env.PUBLIC_DEPLOY_URL; const url = envUrl && envUrl !== 'undefined' ? envUrl : DEFAULT_SITE_SETTINGS.defaultCta.primaryUrl; return { ...DEFAULT_SITE_SETTINGS.defaultCta, primaryUrl: url, secondaryUrl: url }; }
export function canonicalCtaBlockFromDefault(defaultCta = envDefaultCta()) { const d = normalizeDefaultCta(defaultCta); return { block_key: GOLDEN_CTA_KEY, type: 'cta', title: d.title, body: d.description, items: [{ eyebrow: d.eyebrow, label: d.primaryLabel, url: d.primaryUrl, secondaryLabel: d.secondaryLabel, secondaryUrl: d.secondaryUrl, presentationRole: CTA_SECTION_ROLE, ctaMode: 'global' }], sort_order: CTA_SECTION_SORT_ORDER, status: 'published' }; }
export function blockItems(block) { try { const parsed = parseItems(block?.items); return Array.isArray(parsed) ? parsed : []; } catch { return []; } }
export function itemHasRole(item, role) { return Boolean(item && typeof item === 'object' && (item.presentationRole === role || item.role === role)); }
export function blockHasExplicitRole(block, role) { return blockItems(block).some((item) => itemHasRole(item, role)); }
export function isCanonicalCtaSection(block) { return block?.block_key === GOLDEN_CTA_KEY || block?.blockKey === GOLDEN_CTA_KEY || blockHasExplicitRole(block, CTA_SECTION_ROLE); }
export function isPricingCta(block) { return blockHasExplicitRole(block, PRICING_CTA_ROLE); }
export function assertSingleCanonicalCta(blocks = []) { const found = blocks.filter(isCanonicalCtaSection); const keys = new Set(found.map((b) => b.block_key || '')); if (keys.size > 1) { const e = new Error('Több explicit canonical CTA-section blokk található ugyanazon az oldalon.'); e.code = 'CTA_INTEGRITY_ERROR'; e.status = 409; e.details = found.map((b) => ({ id: b.id, block_key: b.block_key, status: b.status })); throw e; } return found[0] || null; }
export function mergePricingCtaDefaults(existingBlock, targetBlock) { const current = blockItems(existingBlock)[0] || {}; const desired = targetBlock.items?.[0] || {}; return { ...existingBlock, items: [{ ...current, eyebrow: current.eyebrow ?? desired.eyebrow, secondaryLabel: current.secondaryLabel ?? desired.secondaryLabel, secondaryUrl: current.secondaryUrl ?? desired.secondaryUrl, presentationRole: PRICING_CTA_ROLE }] }; }
const hasText = (value) => String(value ?? '').trim().length > 0;
const fillIfBlank = (value, fallback) => hasText(value) ? value : fallback;
export function mergeSpecialCtaDefaults(existingBlock, defaultCta, role) { const current = blockItems(existingBlock)[0] || {}; const desired = normalizeDefaultCta(defaultCta || {}); const item = { ...current, eyebrow: fillIfBlank(current.eyebrow, desired.eyebrow), label: fillIfBlank(current.label, desired.primaryLabel), url: fillIfBlank(current.url, desired.primaryUrl), secondaryLabel: fillIfBlank(current.secondaryLabel, desired.secondaryLabel), secondaryUrl: fillIfBlank(current.secondaryUrl, desired.secondaryUrl) }; if (role) item.presentationRole = fillIfBlank(current.presentationRole, role); return { ...existingBlock, items: [item] }; }
