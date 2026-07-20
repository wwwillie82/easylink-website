import { CTA_SECTION_ROLE, PRICING_CTA_ROLE, blockItems, isCanonicalCtaSection, isPricingCta, normalizeDefaultCta } from './cta-contract.mjs';

export const HOME_LEGACY_CTA_KEY = '/:cta:4';
export const PAGE_CTA_ROLES = Object.freeze([CTA_SECTION_ROLE, PRICING_CTA_ROLE, 'home-legacy-cta']);

const keyOf = (block) => block?.blockKey ?? block?.block_key ?? '';
const hasText = (value) => String(value ?? '').trim().length > 0;
const fillIfBlank = (value, fallback) => hasText(value) ? value : fallback;
const isActive = (block) => block?.status !== 'archived' && block?.status !== 'draft';

export function isHomeLegacyCta(block) {
  return keyOf(block) === HOME_LEGACY_CTA_KEY;
}

export function isRecognizedPageCta(block) {
  return isCanonicalCtaSection(block) || isPricingCta(block) || isHomeLegacyCta(block);
}

export function pageCtaRoles(block) {
  return [
    isCanonicalCtaSection(block) ? CTA_SECTION_ROLE : '',
    isPricingCta(block) ? PRICING_CTA_ROLE : '',
    isHomeLegacyCta(block) ? 'home-legacy-cta' : '',
  ].filter(Boolean);
}

export function pageCtaRole(block) {
  return pageCtaRoles(block)[0];
}

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

export function withoutPageCtaBlocks(blocks = []) {
  return blocks.filter((block) => !isRecognizedPageCta(block));
}

export function normalizePageCtaBlock(block, defaultCta) {
  if (!block) return block;
  const defaults = normalizeDefaultCta(defaultCta || {});
  const items = blockItems(block);
  const current = items[0] && typeof items[0] === 'object' ? items[0] : {};
  const role = pageCtaRole(block) || CTA_SECTION_ROLE;
  const normalizedFirst = {
    ...current,
    eyebrow: fillIfBlank(current.eyebrow, defaults.eyebrow),
    label: fillIfBlank(current.label, defaults.primaryLabel),
    url: fillIfBlank(current.url, defaults.primaryUrl),
    secondaryLabel: fillIfBlank(current.secondaryLabel, defaults.secondaryLabel),
    secondaryUrl: fillIfBlank(current.secondaryUrl, defaults.secondaryUrl),
    ...(role === 'home-legacy-cta' ? {} : { presentationRole: fillIfBlank(current.presentationRole, role) }),
  };
  return { ...block, items: [normalizedFirst, ...items.slice(1)] };
}
