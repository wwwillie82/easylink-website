import { isValidHttpExternalUrl, navigationTitleOverride, positiveNavigationPageId } from './internal-links.mjs';
import { validatePublishedHomeBlocksForSnapshot } from './home-blocks.mjs';

const targetTypes = new Set(['legacy', 'page', 'external']);
const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);
const labelOf = (item = {}) => String(item.title || item.target_title || `#${item.id || '?'}`);
const statusOf = (v) => String(v || '').trim().toLowerCase();
const rawTargetType = (value) => String(value ?? '').trim().toLowerCase();
const hasValue = (value) => value !== undefined && value !== null && String(value).trim() !== '';
const errorBase = (item = {}) => ({ navigationItemId: item.id ?? null, targetPageId: positiveNavigationPageId(item.target_page_id), title: labelOf(item) });

export function activePageUsageBlockers(usages = [], targetStatus = 'published') {
  const active = usages.filter((u) => statusOf(u.status) !== 'archived');
  if (targetStatus === 'archived') return active;
  if (targetStatus === 'draft') return active.filter((u) => statusOf(u.status) === 'published');
  return [];
}
export function pageInUseError(usages = [], targetStatus = 'archived') {
  const blockers = activePageUsageBlockers(usages, targetStatus);
  const names = blockers.map(labelOf).filter(Boolean).join(', ');
  const action = targetStatus === 'draft' ? 'piszkozatba helyezhető' : 'archiválható';
  const error = new Error(`Az oldal nem ${action}, mert aktív menüpont hivatkozik rá${names ? `: ${names}` : ''}.`);
  error.code = 'PAGE_IN_USE'; error.status = 409; error.details = { usages: blockers };
  return error;
}

export function normalizeSnapshotForReferenceValidation(content = {}) {
  const pages = Array.isArray(content.pages) ? content.pages : [];
  return { ...content, pages, navigation: (content.navigation || []).map((row) => {
    if (!hasOwn(row, 'target_type')) return { ...row, target_type: 'legacy', target_page_id: null, title_override: null };
    const type = rawTargetType(row.target_type);
    if (type === 'external' || type === 'legacy') return { ...row, target_type: type, target_page_id: null, title_override: null };
    if (type === 'page') return { ...row, target_type: 'page', target_page_id: positiveNavigationPageId(row.target_page_id), title_override: navigationTitleOverride(row.title_override) };
    return { ...row };
  }) };
}

export function validateContentReferences(content = {}) {
  const pages = Array.isArray(content.pages) ? content.pages : [];
  const pagesById = new Map(pages.map((p) => [Number(p.id), p]));
  const errors = [], warnings = [];
  for (const item of content.navigation || []) {
    const status = statusOf(item.status);
    if (status === 'archived') continue;
    if (status !== 'published') continue;
    if (!hasOwn(item, 'target_type')) { warnings.push({ code: 'NAVIGATION_LEGACY_TARGET', message: `Örökölt menüpont cél maradt publikálva: ${labelOf(item)}.`, ...errorBase(item) }); continue; }
    const type = rawTargetType(item.target_type);
    if (!targetTypes.has(type)) { errors.push({ code: 'NAVIGATION_TARGET_TYPE_INVALID', message: `A publikált menüpont cél típusa hibás: ${labelOf(item)}.`, ...errorBase(item) }); continue; }
    if (type === 'legacy') {
      if (hasValue(item.target_page_id) || hasValue(item.title_override)) errors.push({ code: 'NAVIGATION_TARGET_TYPE_INVALID', message: `Legacy menüponthoz nem tartozhat oldalazonosító vagy felirat override: ${labelOf(item)}.`, ...errorBase(item) });
      else warnings.push({ code: 'NAVIGATION_LEGACY_TARGET', message: `Örökölt menüpont cél maradt publikálva: ${labelOf(item)}.`, ...errorBase(item) });
      continue;
    }
    if (type === 'page') {
      const pageId = positiveNavigationPageId(item.target_page_id);
      if (!pageId) { errors.push({ code: 'NAVIGATION_TARGET_PAGE_ID_INVALID', message: `A publikált menüpont céloldal azonosítója hibás: ${labelOf(item)}.`, ...errorBase(item), targetPageId: null }); continue; }
      const page = pagesById.get(pageId);
      if (!page) { errors.push({ code: 'NAVIGATION_TARGET_PAGE_MISSING', message: `A publikált menüpont céloldala nem található: ${labelOf(item)}.`, ...errorBase(item), targetPageId: pageId }); continue; }
      if (statusOf(page.status) !== 'published') errors.push({ code: 'NAVIGATION_TARGET_PAGE_NOT_PUBLISHED', message: `A publikált menüpont céloldala nem publikus: ${labelOf(item)}.`, ...errorBase(item), targetPageId: pageId });
      if (String(item.href || '') !== String(page.route || '')) errors.push({ code: 'NAVIGATION_TARGET_ROUTE_MISMATCH', message: `A publikált menüpont linkje nem egyezik a céloldal route-jával: ${labelOf(item)}.`, ...errorBase(item), targetPageId: pageId });
      const expectedTitle = navigationTitleOverride(item.title_override) || String(page.title || '');
      if (String(item.title || '') !== expectedTitle) errors.push({ code: 'NAVIGATION_TARGET_TITLE_MISMATCH', message: `A publikált menüpont felirata nem egyezik a céloldal címével vagy override-jával: ${labelOf(item)}.`, ...errorBase(item), targetPageId: pageId });
      continue;
    }
    if (type === 'external' && (!isValidHttpExternalUrl(item.href) || hasValue(item.target_page_id) || hasValue(item.title_override))) errors.push({ code: 'NAVIGATION_EXTERNAL_TARGET_INVALID', message: `A publikált külső menüpont célja hibás: ${labelOf(item)}.`, ...errorBase(item) });
  }
  errors.push(...validatePublishedHomeBlocksForSnapshot(content));
  return { ok: errors.length === 0, errors, warnings };
}
export const referenceValidationSummary = (result) => (result?.errors || []).map((e) => `${e.code}: ${e.message}`).join('\n') || 'Tartalmi referenciahiba.';
