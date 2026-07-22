import { DEFAULT_SITE_SETTINGS, normalizeSiteSettings } from '../admin/settings.mjs';
import { defaultCtaButtons, itemCtaButtons, withLegacyItemFields } from './cta-buttons.mjs';

export const GOLDEN_CTA_KEY = 'golden:cta-section';
export const CTA_SECTION_ROLE = 'cta-section';
export const PRICING_CTA_ROLE = 'pricing-cta';
export const CTA_SECTION_SORT_ORDER = 900;

const parseItems = (items) => Array.isArray(items) ? items : (typeof items === 'string' && items.trim() ? JSON.parse(items) : []);
const hasText = (value) => String(value ?? '').trim().length > 0;
const fillIfBlank = (value, fallback) => hasText(value) ? value : fallback;

export function normalizeDefaultCta(value = {}) { return normalizeSiteSettings({ defaultCta: value }).defaultCta; }

function envDefaultCta() {
  const envUrl = process.env.PUBLIC_DEPLOY_URL;
  const url = envUrl && envUrl !== 'undefined' ? envUrl : DEFAULT_SITE_SETTINGS.defaultCta.primaryUrl;
  const buttons = defaultCtaButtons(DEFAULT_SITE_SETTINGS.defaultCta).map((button) => ({ ...button, url }));
  return { ...DEFAULT_SITE_SETTINGS.defaultCta, buttons, primaryUrl: url, secondaryUrl: url };
}

export function canonicalCtaBlockFromDefault(defaultCta = envDefaultCta()) {
  const defaults = normalizeDefaultCta(defaultCta);
  const item = withLegacyItemFields({ eyebrow: defaults.eyebrow, presentationRole: CTA_SECTION_ROLE, ctaMode: 'global', headerHidden: false }, defaultCtaButtons(defaults));
  return {
    block_key: GOLDEN_CTA_KEY,
    type: 'cta',
    title: defaults.title,
    body: defaults.description,
    items: [item],
    sort_order: CTA_SECTION_SORT_ORDER,
    status: 'published',
  };
}

export function blockItems(block) {
  try {
    const parsed = parseItems(block?.items);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function itemHasRole(item, role) { return Boolean(item && typeof item === 'object' && (item.presentationRole === role || item.role === role)); }
export function blockHasExplicitRole(block, role) { return blockItems(block).some((item) => itemHasRole(item, role)); }
export function isCanonicalCtaSection(block) { return block?.block_key === GOLDEN_CTA_KEY || block?.blockKey === GOLDEN_CTA_KEY || blockHasExplicitRole(block, CTA_SECTION_ROLE); }
export function isPricingCta(block) { return blockHasExplicitRole(block, PRICING_CTA_ROLE); }

export function assertSingleCanonicalCta(blocks = []) {
  const found = blocks.filter(isCanonicalCtaSection);
  const keys = new Set(found.map((block) => block.block_key || ''));
  if (keys.size > 1) {
    const error = new Error('Több explicit canonical CTA-section blokk található ugyanazon az oldalon.');
    error.code = 'CTA_INTEGRITY_ERROR';
    error.status = 409;
    error.details = found.map((block) => ({ id: block.id, block_key: block.block_key, status: block.status }));
    throw error;
  }
  return found[0] || null;
}

export function mergePricingCtaDefaults(existingBlock, targetBlock) {
  const current = blockItems(existingBlock)[0] || {};
  const desired = targetBlock.items?.[0] || {};
  const currentButtons = itemCtaButtons(current);
  const desiredButtons = itemCtaButtons(desired);
  const buttons = currentButtons.length ? currentButtons : desiredButtons;
  return {
    ...existingBlock,
    items: [withLegacyItemFields({
      ...current,
      eyebrow: current.eyebrow ?? desired.eyebrow,
      presentationRole: PRICING_CTA_ROLE,
      headerHidden: current.headerHidden === true,
    }, buttons)],
  };
}

export function mergeSpecialCtaDefaults(existingBlock, defaultCta, role) {
  const current = blockItems(existingBlock)[0] || {};
  const desired = normalizeDefaultCta(defaultCta || {});
  const currentButtons = itemCtaButtons(current);
  const buttons = currentButtons.length ? currentButtons : defaultCtaButtons(desired);
  const item = withLegacyItemFields({
    ...current,
    eyebrow: fillIfBlank(current.eyebrow, desired.eyebrow),
    headerHidden: current.headerHidden === true,
  }, buttons);
  if (role) item.presentationRole = fillIfBlank(current.presentationRole, role);
  return { ...existingBlock, items: [item] };
}
