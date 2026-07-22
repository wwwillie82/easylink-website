import { publishedAudiences } from '@/content/audiences';
import { publishedSolutions } from '@/content/solutions';
import { normalizeCardsItems } from './block-contracts.mjs';
import { staticPages, type SitePage } from './static';

export type PublicContentMode = 'db-authoritative' | 'static';
export type PublicRouteIndex = {
  pages: SitePage[];
  byRoute: Map<string, SitePage>;
  byId: Map<string, SitePage>;
  byType: Map<string, SitePage[]>;
  byTypeAndSlug: Map<string, Map<string, SitePage>>;
};
export type PublishedPublicPagesResult = { mode: PublicContentMode; pages: SitePage[] };

type LinkableItem = Record<string, unknown>;
export type ListingCardSource = 'db-block' | 'golden' | 'static';

export function normalizePublicRoute(route: unknown) {
  const raw = String(route ?? '').trim();
  if (!raw || raw === '/') return '/';
  return `/${raw.replace(/^\/+|\/+$/g, '')}/`;
}

export function routeToStaticParam(route: string) {
  const normalized = normalizePublicRoute(route);
  if (normalized === '/') throw new Error('A root route nem használható catch-all public pathként.');
  return normalized.replace(/^\//, '').replace(/\/$/, '');
}

export function publishedNonHomePages(pages: SitePage[]) {
  return pages.filter((page) => page.status === 'published' && page.route !== '/' && page.type !== 'home');
}

function pageIdentity(page: SitePage) {
  return `id=${page.id ?? 'n/a'} title=${page.title ?? 'n/a'} type=${page.type} route=${page.route}`;
}

export function buildPublicRouteIndex(pages: SitePage[]): PublicRouteIndex {
  const byRoute = new Map<string, SitePage>();
  const byId = new Map<string, SitePage>();
  const byType = new Map<string, SitePage[]>();
  const byTypeAndSlug = new Map<string, Map<string, SitePage>>();
  for (const page of pages.filter((entry) => entry.status === 'published')) {
    const route = normalizePublicRoute(page.route);
    const existingRoute = byRoute.get(route);
    if (existingRoute) throw new Error(`Duplikált public route index kulcs: route=${route}; first=${pageIdentity(existingRoute)}; duplicate=${pageIdentity(page)}`);
    byRoute.set(route, page);
    const id = String(page.id ?? '').trim();
    if (id) byId.set(id, page);
    const typed = byType.get(page.type) ?? [];
    typed.push(page);
    byType.set(page.type, typed);
    const slugMap = byTypeAndSlug.get(page.type) ?? new Map<string, SitePage>();
    if (page.slug) {
      const slug = String(page.slug);
      const existingSlug = slugMap.get(slug);
      if (existingSlug) throw new Error(`Duplikált public type+slug index kulcs: type=${page.type} slug=${slug}; first=${pageIdentity(existingSlug)}; duplicate=${pageIdentity(page)}`);
      slugMap.set(slug, page);
    }
    byTypeAndSlug.set(page.type, slugMap);
  }
  for (const entries of byType.values()) entries.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.route).localeCompare(String(b.route)));
  return { pages, byRoute, byId, byType, byTypeAndSlug };
}

export function firstPageByType(index: PublicRouteIndex, type: string) {
  return index.byType.get(type)?.[0];
}

export function detailPageForSlug(index: PublicRouteIndex, type: 'solution_detail' | 'audience_detail', slug: unknown) {
  const key = String(slug ?? '').trim();
  if (!key) return undefined;
  return index.byTypeAndSlug.get(type)?.get(key);
}

function legacyUrlSlug(item: LinkableItem) {
  const url = String(item.target_url ?? item.url ?? item.href ?? '').trim();
  if (!url || !url.startsWith('/')) return '';
  const clean = normalizePublicRoute(url).replace(/^\//, '').replace(/\/$/, '');
  return clean.split('/').filter(Boolean).pop() ?? '';
}

function cardError({ item, itemIndex, sourcePage, blockLabel, detailType, reason }: { item: LinkableItem; itemIndex: number; sourcePage: SitePage; blockLabel: string; detailType: 'solution_detail' | 'audience_detail'; reason: string }) {
  const title = String(item.title ?? item.title_override ?? item.label ?? item.slug ?? item.target_url ?? item.url ?? item.href ?? `#${itemIndex + 1}`);
  return new Error(`Nem feloldható public kártyalink: page=${sourcePage.title} route=${sourcePage.route} type=${sourcePage.type} block=${blockLabel} item=${title} detailType=${detailType}. ${reason}`);
}

export function resolveListingCards({ items, detailType, index, sourcePage, blockLabel, mode, source }: { items: LinkableItem[]; detailType: 'solution_detail' | 'audience_detail'; index: PublicRouteIndex; sourcePage: SitePage; blockLabel: string; mode: PublicContentMode; source: ListingCardSource }) {
  const normalizedCards: LinkableItem[] = normalizeCardsItems(items)[0]?.cards ?? [];
  return normalizedCards.map((item: LinkableItem, itemIndex: number) => {
    const targetType = String(item.target_type ?? '').trim();
    if (targetType === 'page') {
      const targetPageId = String(item.target_page_id ?? '').trim();
      const target = targetPageId ? index.byId.get(targetPageId) : undefined;
      if (!target) throw cardError({ item, itemIndex, sourcePage, blockLabel, detailType, reason: `A page target nem published oldal: target_page_id=${targetPageId || 'hiányzik'}.` });
      if (target.type !== detailType) throw cardError({ item, itemIndex, sourcePage, blockLabel, detailType, reason: `A page target típusa ${target.type}, elvárt: ${detailType}.` });
      return { ...item, slug: target.slug, href: target.route, url: target.route };
    }
    const explicitUrl = String(item.target_url ?? item.url ?? item.href ?? '').trim();
    const explicitSlug = String(item.slug ?? '').trim();
    if (explicitUrl.startsWith('/')) {
      const target = index.byRoute.get(normalizePublicRoute(explicitUrl));
      if (target?.type === detailType) return { ...item, href: target.route, url: target.route };
      if (source === 'db-block') throw cardError({ item, itemIndex, sourcePage, blockLabel, detailType, reason: `A DB block explicit URL nem published ${detailType} route: ${explicitUrl}` });
    }
    if (explicitSlug) {
      const target = detailPageForSlug(index, detailType, explicitSlug);
      if (target) return { ...item, slug: explicitSlug, href: target.route, url: target.route };
      if (source === 'db-block') throw cardError({ item, itemIndex, sourcePage, blockLabel, detailType, reason: `A DB block explicit slug nem található: ${explicitSlug}` });
    }
    if (source !== 'db-block') {
      const slug = legacyUrlSlug(item);
      const target = detailPageForSlug(index, detailType, slug);
      if (target) return { ...item, slug, href: target.route, url: target.route };
    }
    if (mode === 'db-authoritative') throw cardError({ item, itemIndex, sourcePage, blockLabel, detailType, reason: `Nincs stabil published detail route a(z) ${source} kártyához.` });
    return { ...item, slug: explicitSlug || legacyUrlSlug(item) };
  });
}

export function relatedPages(index: PublicRouteIndex, current: SitePage, type: 'solution_detail' | 'audience_detail', limit?: number) {
  const siblings = (index.byType.get(type) ?? []).filter((page) => page.route !== current.route).map((page) => ({ title: page.title, href: page.route }));
  return typeof limit === 'number' ? siblings.slice(0, limit) : siblings;
}

export function staticFallbackCards(type: 'solution_detail' | 'audience_detail') {
  return type === 'solution_detail' ? publishedSolutions : publishedAudiences;
}
