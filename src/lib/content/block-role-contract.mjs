import { GOLDEN_CTA_KEY, isCanonicalCtaSection, isPricingCta, blockHasExplicitRole } from './cta-contract.mjs';
export { GOLDEN_CTA_KEY };

export const legacyRoleByKey = Object.freeze({
  '/megoldasaink/:cards:0': ['golden-cards'],
  '/kinek-szol/:cards:0': ['golden-cards'],
  '/integraciok/:text:0': ['integrations-intro'],
  '/integraciok/:cards:1': ['integrations-cards'],
  '/integraciok/:text:2': ['integrations-important'],
  '/arak/:feature-list:0': ['pricing-features'],
  '/arak/:text:1': ['pricing-explainer'],
  '/arak/:cta:2': ['pricing-cta'],
  '/kapcsolat/:cta:0': ['contact-main'],
  '/kapcsolat/:feature-list:1': ['contact-features'],
});

export const fixedPresentationRoles = Object.freeze([
  'golden-cards',
  'integrations-intro',
  'integrations-cards',
  'integrations-important',
  'pricing-features',
  'pricing-explainer',
  'pricing-cta',
  'contact-main',
  'contact-features',
  'cta-section',
]);

const keyOf = (block) => block?.blockKey ?? block?.block_key ?? '';
const itemsOf = (block) => Array.isArray(block?.items) ? block.items : [];

export function blockHasRole(block, role) {
  if (role === 'cta-section') return isCanonicalCtaSection(block);
  if (role === 'pricing-cta') return isPricingCta(block);
  const key = keyOf(block);
  const legacyRoles = legacyRoleByKey[key] ?? Object.entries(legacyRoleByKey).find(([legacyKey]) => key.endsWith(legacyKey))?.[1];
  return key.includes(`:${role}`) || legacyRoles?.includes(role) || blockHasExplicitRole(block, role);
}

export function blockFixedRole(block) {
  return fixedPresentationRoles.find((role) => blockHasRole(block, role));
}

export function findRoleBlock(blocks, role, fallback) {
  const list = blocks ?? [];
  const explicit = list.filter((block) => blockHasRole(block, role));
  if (role === 'cta-section') {
    const keys = new Set(explicit.map((block) => block?.blockKey ?? block?.block_key ?? ''));
    if (keys.size > 1) throw new Error('CTA_INTEGRITY_ERROR: multiple cta-section blocks on one page');
    return explicit.find((block) => block.status !== 'archived' && block.status !== 'draft');
  }
  if (role === 'pricing-cta') return explicit.find((block) => block.status !== 'archived' && block.status !== 'draft');
  return explicit[0] ?? (fallback ? list.find(fallback) : undefined);
}

export function withoutBlocks(blocks, consumed) {
  const used = new Set((consumed ?? []).filter(Boolean));
  return (blocks ?? []).filter((block) => !used.has(block));
}
