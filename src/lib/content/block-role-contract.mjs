export const GOLDEN_CTA_KEY = 'golden:cta-section';

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
  const key = keyOf(block);
  const legacyRoles = legacyRoleByKey[key] ?? Object.entries(legacyRoleByKey).find(([legacyKey]) => key.endsWith(legacyKey))?.[1];
  return key.includes(`:${role}`) || legacyRoles?.includes(role) || itemsOf(block).some((item) => item && typeof item === 'object' && (item.presentationRole === role || item.role === role));
}

export function blockFixedRole(block) {
  return fixedPresentationRoles.find((role) => blockHasRole(block, role));
}

export function findRoleBlock(blocks, role, fallback) {
  const list = blocks ?? [];
  return list.find((block) => blockHasRole(block, role)) ?? (fallback ? list.find(fallback) : undefined);
}

export function withoutBlocks(blocks, consumed) {
  const used = new Set((consumed ?? []).filter(Boolean));
  return (blocks ?? []).filter((block) => !used.has(block));
}
