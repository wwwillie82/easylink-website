import { staticNavigationItems, staticPages, getStaticPageByRoute, getStaticPageBySlug, type SitePage } from './static';

type DbReader = { getPageByRoute(route: string): Promise<SitePage | null>; getPageByRouteAny?: (route: string) => Promise<SitePage | null>; listContentPages?: () => Promise<SitePage[]>; listNavigation(): Promise<Array<{ title: string; href: string; sortOrder: number; status: string }>> };

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
export const contentSource = () => env.SITE_CONTENT_SOURCE ?? 'auto';
export const hasDbConfig = () => Boolean(env.DATABASE_URL || (env.DB_HOST && env.DB_NAME && env.DB_USER));
export const shouldTryDbContent = () => contentSource() === 'db' || (contentSource() === 'auto' && hasDbConfig());

async function getDbReader(): Promise<DbReader | null> {
  if (!shouldTryDbContent()) return null;
  try {
    const mod = await import('@/lib/db/repository');
    return mod.createMariaDbContentRepository();
  } catch {
    return null;
  }
}


export async function getPublicPageState(route: string): Promise<{ page?: SitePage; hiddenByDb: boolean }> {
  const normalized = route.endsWith('/') ? route : `${route}/`;
  const db = await getDbReader();
  if (db?.getPageByRouteAny) {
    try {
      const page = await db.getPageByRouteAny(normalized);
      if (page) return { page: page.status === 'published' ? page : undefined, hiddenByDb: page.status !== 'published' };
    } catch {}
  } else if (db) {
    try {
      const page = await db.getPageByRoute(normalized);
      if (page) return { page: page.status === 'published' ? page : undefined, hiddenByDb: page.status !== 'published' };
    } catch {}
  }
  return { page: getStaticPageByRoute(normalized), hiddenByDb: false };
}

export async function getPageByRoute(route: string): Promise<SitePage | undefined> {
  const normalized = route.endsWith('/') ? route : `${route}/`;
  const db = await getDbReader();
  if (db) {
    try {
      const page = db.getPageByRouteAny ? await db.getPageByRouteAny(normalized) : await db.getPageByRoute(normalized);
      if (page) return page.status === 'published' ? page : undefined;
    } catch {}
  }
  return getStaticPageByRoute(normalized);
}

export async function getDetailPage(type: 'solution_detail' | 'audience_detail', slug: string): Promise<SitePage | undefined> {
  const route = type === 'solution_detail' ? `/megoldasaink/${slug}/` : `/kinek-szol/${slug}/`;
  return getPageByRoute(route) ?? getStaticPageBySlug(type, slug);
}

export async function listContentPages() {
  const db = await getDbReader();
  if (db?.listContentPages) {
    try { return await db.listContentPages(); } catch {}
  }
  return staticPages.filter((page) => page.type === 'content_page' && page.status === 'published');
}

export async function listNavigation() {
  const db = await getDbReader();
  if (db) {
    try {
      const nav = await db.listNavigation();
      if (nav.length > 0) return nav;
    } catch {}
  }
  return staticNavigationItems;
}

export { staticPages };
