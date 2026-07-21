import { isInternalRouteCandidate, isValidHttpExternalUrl, navigationTitleOverride, normalizeNavigationTargetFields, normalizeNavigationTargetType, positiveNavigationPageId, resolveNavigationItem } from './internal-links.mjs';

export const cardTargetTypes = Object.freeze(['legacy', 'page', 'external']);
const cardTargetSet = new Set(cardTargetTypes);

export function rawCardTargetType(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!cardTargetSet.has(raw)) {
    const error = new Error(`Invalid card target_type: ${raw || '(empty)'}`);
    error.code = 'CARD_TARGET_TYPE_INVALID';
    error.status = 409;
    error.details = { target_type: value };
    throw error;
  }
  return normalizeNavigationTargetType(raw);
}

function hasValue(value) { return value !== undefined && value !== null && String(value).trim() !== ''; }
function firstNonEmpty(...values) { for (const value of values) { const text = String(value ?? '').trim(); if (text) return text; } return ''; }
function cardLabel(item = {}) { return firstNonEmpty(item.title_override, item.title, item.label, item.href, item.url, `#${item.badge || '?'}`); }
function targetError(code, message, details = {}) { const error = new Error(message); error.code = code; error.status = 409; error.details = details; return error; }

export function buildPageIndexById(pages = []) {
  return new Map((pages || []).map((page) => [Number(page?.id), page]).filter(([id]) => Number.isSafeInteger(id) && id > 0));
}

function cleanTitle(value) {
  const title = navigationTitleOverride(value);
  return title || '';
}

function textForPage(item, page) {
  return firstNonEmpty(item.text_override, item.textOverride, item.text, item.description, page?.seoDescription, page?.heroDescription);
}

export function resolveCardTarget(item = {}, { pagesById, allowedPageTypes, requirePublished = true, blockKey = '', itemIndex = 0 } = {}) {
  const targetType = rawCardTargetType(item.target_type);
  const normalized = normalizeNavigationTargetFields(item);
  const baseDetails = { blockKey, itemIndex, target_type: item.target_type, target_page_id: item.target_page_id, title: cardLabel(item) };
  if (targetType === 'page') {
    if (normalized.target_type !== 'page') throw targetError('CARD_TARGET_PAGE_ID_INVALID', `A kártya page célazonosítója hibás: ${cardLabel(item)}`, baseDetails);
    const page = pagesById?.get(Number(normalized.target_page_id));
    if (!page) throw targetError('CARD_TARGET_PAGE_MISSING', `A kártya céloldala nem található: ${cardLabel(item)}`, baseDetails);
    if (requirePublished && String(page.status || '').trim() !== 'published') throw targetError('CARD_TARGET_PAGE_NOT_PUBLISHED', `A kártya céloldala nem publikus: ${cardLabel(item)}`, { ...baseDetails, pageStatus: page.status });
    const allowed = Array.isArray(allowedPageTypes) ? allowedPageTypes : (allowedPageTypes ? [allowedPageTypes] : []);
    if (allowed.length && !allowed.includes(page.type)) throw targetError('CARD_TARGET_PAGE_TYPE_INVALID', `A kártya céloldal típusa hibás: ${cardLabel(item)}`, { ...baseDetails, pageType: page.type, allowedPageTypes: allowed });
    const resolved = resolveNavigationItem({ title: page.title, href: page.route, target_type: 'page', target_page_id: normalized.target_page_id, title_override: normalized.title_override, sort_order: item.badge ?? item.order ?? itemIndex + 1, status: item.status || 'published' }, page);
    return { ...item, target_type: 'page', target_page_id: normalized.target_page_id, title_override: normalized.title_override, title: resolved.title, text: textForPage(item, page), href: resolved.href, url: resolved.href, linkLabel: item.linkLabel || item.label || 'Részletek →', badge: item.badge ?? item.order ?? itemIndex + 1 };
  }
  if (targetType === 'legacy') {
    if (hasValue(item.target_page_id) || hasValue(item.title_override)) throw targetError('CARD_LEGACY_TARGET_INVALID', `Legacy kártyához nem tartozhat oldalazonosító vagy title_override: ${cardLabel(item)}`, baseDetails);
    const href = String(item.href ?? item.url ?? '').trim();
    if (!isInternalRouteCandidate(href)) throw targetError('CARD_LEGACY_URL_INVALID', `Legacy kártya csak biztonságos belső URL lehet: ${cardLabel(item)}`, { ...baseDetails, href });
    return { ...item, target_type: 'legacy', title: cleanTitle(item.title) || cardLabel(item), text: firstNonEmpty(item.text_override, item.text), href, url: href, linkLabel: item.linkLabel || item.label || 'Részletek →', badge: item.badge ?? item.order ?? itemIndex + 1 };
  }
  if (hasValue(item.target_page_id) || hasValue(item.title_override)) throw targetError('CARD_EXTERNAL_TARGET_INVALID', `Külső kártyához nem tartozhat oldalazonosító vagy title_override: ${cardLabel(item)}`, baseDetails);
  const href = String(item.href ?? item.url ?? '').trim();
  if (!isValidHttpExternalUrl(href)) throw targetError('CARD_EXTERNAL_URL_INVALID', `Külső kártya csak érvényes http(s) URL lehet: ${cardLabel(item)}`, { ...baseDetails, href });
  return { ...item, target_type: 'external', title: cleanTitle(item.title) || cardLabel(item), text: firstNonEmpty(item.text_override, item.text), href, url: href, linkLabel: item.linkLabel || item.label || 'Megnyitás →', badge: item.badge ?? item.order ?? itemIndex + 1 };
}

export { isInternalRouteCandidate, isValidHttpExternalUrl, navigationTitleOverride, normalizeNavigationTargetFields, normalizeNavigationTargetType, positiveNavigationPageId, resolveNavigationItem };
