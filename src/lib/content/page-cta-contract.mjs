import { CTA_SECTION_ROLE, PRICING_CTA_ROLE, blockItems, isCanonicalCtaSection, isPricingCta, normalizeDefaultCta } from './cta-contract.mjs';

export const HOME_LEGACY_CTA_KEY = '/:cta:4';
export const HOME_LEGACY_CTA_ROLE = 'home-legacy-cta';
export const PAGE_CTA_ROLES = Object.freeze([CTA_SECTION_ROLE, PRICING_CTA_ROLE, HOME_LEGACY_CTA_ROLE]);

const keyOf = (block) => block?.blockKey ?? block?.block_key ?? '';
const hasText = (value) => String(value ?? '').trim().length > 0;
const fillIfBlank = (value, fallback) => hasText(value) ? value : fallback;
export const PAGE_CTA_MODES = Object.freeze(['global', 'custom', 'hidden']);
export function normalizeCtaMode(value) { const raw = String(value ?? '').trim(); return raw && PAGE_CTA_MODES.includes(raw) ? raw : 'global'; }
function firstCtaItem(block) { const first = blockItems(block)[0]; return first && typeof first === 'object' && !Array.isArray(first) ? first : {}; }
function integrityError(message, details) { const error = new Error(`CTA_INTEGRITY_ERROR: ${message}`); error.code = 'CTA_INTEGRITY_ERROR'; error.status = 409; error.details = details; return error; }
export function ctaModeOf(block) { const current = firstCtaItem(block); if (current.ctaMode === undefined || current.ctaMode === null || String(current.ctaMode).trim() === '') return 'global'; const mode = String(current.ctaMode).trim(); if (!PAGE_CTA_MODES.includes(mode)) throw integrityError('invalid CTA mode', { key: keyOf(block), mode }); return mode; }
const isActive = (block) => block?.status !== 'archived';

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
    isHomeLegacyCta(block) ? HOME_LEGACY_CTA_ROLE : '',
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

export function resolvePageCta(block, defaultCta) {
  const mode = normalizeCtaMode(block ? ctaModeOf(block) : 'global');
  const defaults = normalizeDefaultCta(defaultCta || {});
  const items = blockItems(block);
  const current = firstCtaItem(block);
  const role = pageCtaRole(block) || CTA_SECTION_ROLE;
  if (mode === 'hidden') return { mode, shouldRender: false, content: null, meta: { role, tracking: current }, rawBlock: block || null };
  const content = mode === 'global' ? { eyebrow: defaults.eyebrow, title: defaults.title, description: defaults.description, primaryLabel: defaults.primaryLabel, primaryUrl: defaults.primaryUrl, secondaryLabel: defaults.secondaryLabel, secondaryUrl: defaults.secondaryUrl } : { eyebrow: current.eyebrow || '', title: block?.title || '', description: block?.body || '', primaryLabel: current.label || '', primaryUrl: current.url || '', secondaryLabel: current.secondaryLabel || '', secondaryUrl: current.secondaryUrl || '' };
  if (mode === 'custom' && (!hasText(content.title) || !hasText(content.primaryLabel) || !hasText(content.primaryUrl))) throw integrityError('custom CTA missing required fields', { key: keyOf(block), mode });
  return { mode, shouldRender: true, content, meta: { role, tracking: current }, rawBlock: block || null };
}

export function resolvedCtaToBlock(resolved) {
  if (!resolved?.shouldRender) return null;
  const c = resolved.content || {};
  const tracking = resolved.meta?.tracking || {};
  const item = { ...tracking, eyebrow: c.eyebrow || '', label: c.primaryLabel || '', url: c.primaryUrl || '', secondaryLabel: c.secondaryLabel || '', secondaryUrl: c.secondaryUrl || '', ctaMode: resolved.mode };
  if (resolved.meta?.role && resolved.meta.role !== HOME_LEGACY_CTA_ROLE) item.presentationRole = fillIfBlank(item.presentationRole, resolved.meta.role);
  return { ...(resolved.rawBlock || {}), title: c.title || '', body: c.description || '', items: [item], resolvedPageCta: resolved };
}

export function normalizePageCtaBlock(block, defaultCta) { return resolvedCtaToBlock(resolvePageCta(block, defaultCta)); }
