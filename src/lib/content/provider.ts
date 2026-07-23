import { staticNavigationItems, staticPages, getStaticPageByRoute, type SitePage } from './static';
import { buildPublicRouteIndex, normalizePublicRoute, publishedNonHomePages, type PublishedPublicPagesResult, type PublicContentMode } from './public-pages';

type NavigationItem = { title: string; href?: string; sortOrder?: number; status?: string; target_type?: string; children?: NavigationItem[] };
type DbReader = {
  getPageByRoute(route: string): Promise<SitePage | null>;
  getPageByRouteAny?: (route: string) => Promise<SitePage | null>;
  listContentPages?: () => Promise<SitePage[]>;
  listPublishedPublicPages?: () => Promise<SitePage[]>;
  listNavigation(): Promise<NavigationItem[]>;
};

type SourceEnv = Record<string, string | undefined>;

const env = (import.meta as unknown as { env?: SourceEnv }).env ?? {};
export const contentSource = () => env.SITE_CONTENT_SOURCE ?? 'auto';
export const hasDbConfig = () => Boolean(env.DATABASE_URL || (env.DB_HOST && env.DB_NAME && env.DB_USER));
export const shouldTryDbContent = () => contentSource() === 'db' || (contentSource() === 'auto' && hasDbConfig());
export const shouldTryDbContentForEnv = (sourceEnv: SourceEnv) => {
  const source = sourceEnv.SITE_CONTENT_SOURCE ?? 'auto';
  const configured = Boolean(sourceEnv.DATABASE_URL || (sourceEnv.DB_HOST && sourceEnv.DB_NAME && sourceEnv.DB_USER));
  return source === 'db' || (source === 'auto' && configured);
};

function sourceModeForEnv(sourceEnv: SourceEnv): PublicContentMode {
  const source = sourceEnv.SITE_CONTENT_SOURCE ?? 'auto';
  const configured = Boolean(sourceEnv.DATABASE_URL || (sourceEnv.DB_HOST && sourceEnv.DB_NAME && sourceEnv.DB_USER));
  return source === 'static' || (source === 'auto' && !configured) ? 'static' : 'db-authoritative';
}

async function createDefaultDbReader(): Promise<DbReader | null> {
  if (!shouldTryDbContent()) return null;
  const mod = await import('@/lib/db/repository');
  return mod.createMariaDbContentRepository();
}

function staticPublishedPublicPages() {
  return publishedNonHomePages(staticPages);
}

export function createPublicContentProvider({ sourceEnv = env, dbReaderFactory = createDefaultDbReader, staticPageList = staticPages, staticNavigation = staticNavigationItems }: { sourceEnv?: SourceEnv; dbReaderFactory?: () => Promise<DbReader | null>; staticPageList?: SitePage[]; staticNavigation?: NavigationItem[] } = {}) {
  const mode = sourceModeForEnv(sourceEnv);
  async function requireDbReader() {
    const db = await dbReaderFactory();
    if (!db) throw new Error('DB content repository nem érhető el konfigurált DB content source mellett.');
    return db;
  }
  return {
    mode,
    async listPublishedPublicPages(): Promise<PublishedPublicPagesResult> {
      if (mode === 'static') return { mode, pages: publishedNonHomePages(staticPageList) };
      const db = await requireDbReader();
      if (!db.listPublishedPublicPages) throw new Error('A DB content repository nem támogatja a listPublishedPublicPages contractot.');
      const pages = await db.listPublishedPublicPages();
      return { mode, pages: publishedNonHomePages(pages) };
    },
    async getPublicPageState(route: string): Promise<{ page?: SitePage; hiddenByDb: boolean; mode: PublicContentMode }> {
      const normalized = normalizePublicRoute(route);
      if (mode === 'static') return { page: getStaticPageByRoute(normalized), hiddenByDb: false, mode };
      const db = await requireDbReader();
      const page = db.getPageByRouteAny ? await db.getPageByRouteAny(normalized) : await db.getPageByRoute(normalized);
      if (!page) return { page: undefined, hiddenByDb: false, mode };
      return { page: page.status === 'published' ? page : undefined, hiddenByDb: page.status !== 'published', mode };
    },
    async getPageByRoute(route: string): Promise<SitePage | undefined> {
      const normalized = normalizePublicRoute(route);
      if (mode === 'static') return getStaticPageByRoute(normalized);
      const db = await requireDbReader();
      const page = db.getPageByRouteAny ? await db.getPageByRouteAny(normalized) : await db.getPageByRoute(normalized);
      return page?.status === 'published' ? page : undefined;
    },
    async listNavigation(): Promise<NavigationItem[]> {
      if (mode === 'static') return staticNavigation;
      const db = await requireDbReader();
      return db.listNavigation();
    },
  };
}

const defaultProvider = () => createPublicContentProvider();

export async function listPublishedPublicPages(): Promise<PublishedPublicPagesResult> {
  return defaultProvider().listPublishedPublicPages();
}

export async function getPublishedPublicPageByRoute(route: string): Promise<SitePage | undefined> {
  const normalized = normalizePublicRoute(route);
  const result = await listPublishedPublicPages();
  return result.pages.find((page) => normalizePublicRoute(page.route) === normalized);
}

export async function getPublicRouteIndex() {
  const result = await listPublishedPublicPages();
  return { mode: result.mode, routeIndex: buildPublicRouteIndex(result.pages) };
}

export async function getPublicPageState(route: string): Promise<{ page?: SitePage; hiddenByDb: boolean; mode: PublicContentMode }> {
  return defaultProvider().getPublicPageState(route);
}

export async function getPageByRoute(route: string): Promise<SitePage | undefined> {
  return defaultProvider().getPageByRoute(route);
}

export async function listContentPages() {
  const result = await listPublishedPublicPages();
  return result.pages.filter((page) => page.type === 'content_page');
}

export async function listNavigation() {
  return defaultProvider().listNavigation();
}

export { staticPages };
