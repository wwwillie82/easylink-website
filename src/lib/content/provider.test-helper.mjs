export function shouldTryDbContentForEnv(env = {}, isBuild = false) {
  const source = env.SITE_CONTENT_SOURCE || 'auto';
  return source === 'db' || (source === 'auto' && !isBuild && Boolean(env.DATABASE_URL || env.DB_HOST));
}
export async function pageWithFallback(route, dbReader, fallbackPages) {
  try {
    const page = await dbReader?.getPageByRoute(route);
    if (page?.status === 'published') return page;
  } catch {}
  return fallbackPages.find((page) => page.route === route && page.status === 'published');
}
