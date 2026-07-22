import { CTA_SECTION_ROLE, PRICING_CTA_ROLE, blockItems, isCanonicalCtaSection, isPricingCta, normalizeDefaultCta } from './cta-contract.mjs';
import { defaultCtaButtons, itemCtaButtons, withLegacyItemFields } from './cta-buttons.mjs';

export const HOME_LEGACY_CTA_KEY = '/:cta:4';
export const HOME_LEGACY_CTA_ROLE = 'home-legacy-cta';
export const PAGE_CTA_ROLES = Object.freeze([CTA_SECTION_ROLE, PRICING_CTA_ROLE, HOME_LEGACY_CTA_ROLE]);
export const PAGE_CTA_MODES = Object.freeze(['global', 'custom', 'hidden']);

const keyOf = (block) => block?.blockKey ?? block?.block_key ?? '';
const hasText = (value) => String(value ?? '').trim().length > 0;
const fillIfBlank = (value, fallback) => hasText(value) ? value : fallback;
const firstCtaItem = (block) => {
  const first = blockItems(block)[0];
  return first && typeof first === 'object' && !Array.isArray(first) ? first : {};
};
const isActive = (block) => block?.status !== 'archived';

function integrityError(message, details) {
  const error = new Error(`CTA_INTEGRITY_ERROR: ${message}`);
  error.code = 'CTA_INTEGRITY_ERROR';
  error.status = 409;
  error.details = details;
  return error;
}

export function normalizeCtaMode(value) {
  const raw = String(value ?? '').trim();
  return raw && PAGE_CTA_MODES.includes(raw) ? raw : 'global';
}

export function ctaModeOf(block) {
  const current = firstCtaItem(block);
  if (current.ctaMode === undefined || current.ctaMode === null || String(current.ctaMode).trim() === '') return 'global';
  const mode = String(current.ctaMode).trim();
  if (!PAGE_CTA_MODES.includes(mode)) throw integrityError('invalid CTA mode', { key: keyOf(block), mode });
  return mode;
}

export function isHomeLegacyCta(block) { return keyOf(block) === HOME_LEGACY_CTA_KEY; }
export function isRecognizedPageCta(block) { return isCanonicalCtaSection(block) || isPricingCta(block) || isHomeLegacyCta(block); }

export function pageCtaRoles(block) {
  return [
    isCanonicalCtaSection(block) ? CTA_SECTION_ROLE : '',
    isPricingCta(block) ? PRICING_CTA_ROLE : '',
    isHomeLegacyCta(block) ? HOME_LEGACY_CTA_ROLE : '',
  ].filter(Boolean);
}

export function pageCtaRole(block) { return pageCtaRoles(block)[0]; }

function ctaError(blocks) {
  const error = new Error('CTA_INTEGRITY_ERROR: multiple page CTA blocks on one page');
  error.code = 'CTA_INTEGRITY_ERROR';
  error.status = 409;
  error.details = blocks.map((block) => ({ key: keyOf(block), roles: pageCtaRoles(block), status: block?.status }));
  return error;
}

export function resolvePageCtaBlock(blocks = [], { role } = {}) {
  const recognized = blocks.filter((block) => isActive(block) && isRecognizedPageCta(block));
  const conflictEntries = recognized.flatMap((block) => pageCtaRoles(block).map((ctaRole) => `${ctaRole}:${keyOf(block)}`));
  if (new Set(conflictEntries).size > 1 || recognized.some((block) => pageCtaRoles(block).length > 1)) throw ctaError(recognized);
  return role ? recognized.find((block) => pageCtaRole(block) === role) : recognized[0];
}

export function withoutPageCtaBlocks(blocks = []) { return blocks.filter((block) => !isRecognizedPageCta(block)); }

function contentFromButtons(base, buttons) {
  const first = buttons[0] || {};
  const second = buttons[1] || {};
  return {
    ...base,
    buttons,
    primaryLabel: first.label || '',
    primaryUrl: first.url || '',
    secondaryLabel: second.label || '',
    secondaryUrl: second.url || '',
  };
}

export function resolvePageCta(block, defaultCta) {
  const mode = normalizeCtaMode(block ? ctaModeOf(block) : 'global');
  const defaults = normalizeDefaultCta(defaultCta || {});
  const current = firstCtaItem(block);
  const role = pageCtaRole(block) || CTA_SECTION_ROLE;
  const buttons = mode === 'custom' ? itemCtaButtons(current) : defaultCtaButtons(defaults);
  const base = mode === 'custom'
    ? { eyebrow: current.eyebrow || '', title: block?.title || '', description: block?.body || '' }
    : { eyebrow: defaults.eyebrow, title: defaults.title, description: defaults.description };
  const content = contentFromButtons(base, buttons);
  if (mode === 'custom' && (!hasText(content.title) || !buttons.length || !hasText(buttons[0].label) || !hasText(buttons[0].url))) {
    throw integrityError('custom CTA missing required fields', { key: keyOf(block), mode });
  }
  return {
    mode,
    shouldRender: mode !== 'hidden',
    content: mode === 'hidden' ? null : content,
    meta: { role, tracking: current },
    rawBlock: block || null,
  };
}

export function resolvePageHeaderCta(block, defaultCta) {
  const defaults = normalizeDefaultCta(defaultCta || {});
  const current = firstCtaItem(block);
  const mode = normalizeCtaMode(block ? ctaModeOf(block) : 'global');
  if (current.headerHidden === true) return { mode, shouldRender: false, buttons: [], rawBlock: block || null };
  const sourceButtons = mode === 'custom' ? itemCtaButtons(current) : defaultCtaButtons(defaults);
  const buttons = sourceButtons.filter((button) => button.showInHeader && hasText(button.label) && hasText(button.url));
  return { mode, shouldRender: buttons.length > 0, buttons, rawBlock: block || null };
}

export function resolvedCtaToBlock(resolved) {
  if (!resolved?.shouldRender) return null;
  const content = resolved.content || {};
  const tracking = resolved.meta?.tracking || {};
  const item = withLegacyItemFields({
    ...tracking,
    eyebrow: content.eyebrow || '',
    ctaMode: resolved.mode,
    headerHidden: tracking.headerHidden === true,
  }, content.buttons || []);
  if (resolved.meta?.role && resolved.meta.role !== HOME_LEGACY_CTA_ROLE) item.presentationRole = fillIfBlank(item.presentationRole, resolved.meta.role);
  return { ...(resolved.rawBlock || {}), title: content.title || '', body: content.description || '', items: [item], resolvedPageCta: resolved };
}

export function normalizePageCtaBlock(block, defaultCta) { return resolvedCtaToBlock(resolvePageCta(block, defaultCta)); }
