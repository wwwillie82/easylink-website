export function shouldTryDbContentForEnv(env = {}) {
  const source = env.SITE_CONTENT_SOURCE || 'auto';
  const hasDbConfig = Boolean(env.DATABASE_URL || (env.DB_HOST && env.DB_NAME && env.DB_USER));
  return source === 'db' || (source === 'auto' && hasDbConfig);
}
export async function pageWithFallback(route, dbReader, fallbackPages) {
  try {
    const page = await dbReader?.getPageByRoute(route);
    if (page?.status === 'published') return page;
  } catch {}
  return fallbackPages.find((page) => page.route === route && page.status === 'published');
}
