export const navigationTargetTypes = Object.freeze(['legacy', 'page', 'external']);
const targetTypeSet = new Set(navigationTargetTypes);

export function normalizeNavigationTargetType(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  return targetTypeSet.has(raw) ? raw : 'legacy';
}

export function isHttpExternalHref(value) {
  return /^https?:\/\//i.test(String(value ?? '').trim());
}

export function isValidHttpExternalUrl(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname || url.host);
  } catch {
    return false;
  }
}

export function isInternalRouteCandidate(value) {
  const raw = String(value ?? '').trim();
  if (!raw || !raw.startsWith('/')) return false;
  if (raw.startsWith('//')) return false;
  if (/[?#]/.test(raw)) return false;
  return true;
}

export function normalizeRouteForExactMatch(value) {
  const raw = String(value ?? '').trim();
  if (!isInternalRouteCandidate(raw)) return '';
  const normalized = raw.replace(/\/+/g, '/').toLowerCase();
  const withStart = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return withStart.endsWith('/') ? withStart : `${withStart}/`;
}

export function navigationTitleOverride(value) {
  const raw = String(value ?? '').trim();
  return raw ? raw : null;
}


export function positiveNavigationPageId(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  if (!/^\d+$/.test(String(value).trim())) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function normalizeNavigationTargetFields(row = {}, { validPageIds } = {}) {
  const targetType = normalizeNavigationTargetType(row.target_type);
  if (targetType === 'page') {
    const pageId = positiveNavigationPageId(row.target_page_id);
    if (!pageId || (validPageIds && !validPageIds.has(pageId))) return { target_type: 'legacy', target_page_id: null, title_override: null };
    return { target_type: 'page', target_page_id: pageId, title_override: navigationTitleOverride(row.title_override) };
  }
  if (targetType === 'external') return { target_type: 'external', target_page_id: null, title_override: null };
  return { target_type: 'legacy', target_page_id: null, title_override: null };
}

export function resolveNavigationItem(row = {}, page = null) {
  const targetType = normalizeNavigationTargetType(row.target_type);
  const legacy = {
    title: String(row.title ?? ''),
    href: String(row.href ?? ''),
    sortOrder: row.sortOrder ?? row.sort_order ?? 0,
    status: row.status ?? 'draft',
  };
  if (targetType !== 'page') return legacy;
  if (!page?.route) return legacy;
  const override = navigationTitleOverride(row.title_override);
  return {
    ...legacy,
    title: override || String(page.title ?? legacy.title),
    href: String(page.route),
  };
}

export function classifyNavigationHref(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return { kind: 'legacy', reason: 'üres href' };
  if (isHttpExternalHref(raw)) return { kind: 'external' };
  if (raw.startsWith('/') && /[?#]/.test(raw)) return { kind: 'legacy', reason: 'query vagy hash van' };
  if (isInternalRouteCandidate(raw)) return { kind: 'internal', route: normalizeRouteForExactMatch(raw) };
  return { kind: 'legacy', reason: 'nem támogatott vagy bizonytalan URL' };
}

export function originalNavigationCompareFields(nav = {}) {
  return {
    title: String(nav.title ?? ''),
    href: String(nav.href ?? ''),
    target_type: normalizeNavigationTargetType(nav.target_type),
    target_page_id: positiveNavigationPageId(nav.target_page_id),
    title_override: navigationTitleOverride(nav.title_override),
  };
}

export function planNavigationBackfillItem(nav, routeMatches = new Map()) {
  const original = originalNavigationCompareFields(nav);
  if (String(nav?.status ?? '').trim().toLowerCase() === 'archived') return { action: 'archived_skipped', id: nav.id, original, reason: 'archivált rekord' };
  const normalized = normalizeNavigationTargetFields(nav);
  if (normalized.target_type === 'page' || normalized.target_type === 'external') return { action: 'already_migrated', id: nav.id, original };
  const oldResolved = resolveNavigationItem({ ...nav, target_type: 'legacy' });
  const classified = classifyNavigationHref(nav.href);
  if (classified.kind === 'external') {
    const next = { ...nav, target_type: 'external', target_page_id: null, title_override: null };
    const nextResolved = resolveNavigationItem(next);
    if (oldResolved.title !== nextResolved.title || oldResolved.href !== nextResolved.href) return { action: 'error', id: nav.id, original, reason: 'public invariancia eltérés', oldResolved, nextResolved };
    return { action: 'external', id: nav.id, original, update: { target_type: 'external', target_page_id: null, title_override: null }, oldResolved, nextResolved };
  }
  if (classified.kind === 'internal') {
    const matches = routeMatches.get(classified.route) || [];
    if (matches.length === 1) {
      const page = matches[0];
      const titleOverride = String(nav.title ?? '') === String(page.title ?? '') ? null : String(nav.title ?? '');
      const next = { ...nav, target_type: 'page', target_page_id: page.id, title_override: titleOverride };
      const nextResolved = resolveNavigationItem(next, page);
      if (oldResolved.title !== nextResolved.title || oldResolved.href !== nextResolved.href) return { action: 'error', id: nav.id, original, reason: 'public invariancia eltérés', oldResolved, nextResolved };
      return { action: 'page', id: nav.id, original, page, update: { target_type: 'page', target_page_id: page.id, title_override: titleOverride }, oldResolved, nextResolved };
    }
    return { action: 'legacy', id: nav.id, original, reason: matches.length > 1 ? 'többértelmű route egyezés' : 'nincs egyező oldal', route: classified.route };
  }
  return { action: 'legacy', id: nav.id, original, reason: classified.reason || 'más ok' };
}

export function buildRouteMatchMap(pages = []) {
  const map = new Map();
  for (const page of pages) {
    const route = normalizeRouteForExactMatch(page.route);
    if (!route) continue;
    if (!map.has(route)) map.set(route, []);
    map.get(route).push(page);
  }
  return map;
}
