export function normalizeRootInvariantRoute(route) {
  const clean = String(route ?? '').trim().replace(/^\/+|\/+$/g, '');
  return clean ? `/${clean}/` : '/';
}

export function pageInvariantIdentity(page = {}) {
  return `id=${page.id ?? 'n/a'} title=${page.title ?? 'n/a'} type=${page.type ?? 'n/a'} route=${page.route ?? 'n/a'}`;
}

export function assertRootHomePage(page, context = 'root/home invariant') {
  if (!page) throw new Error(`${context}: hiányzó / route rekord.`);
  const route = normalizeRootInvariantRoute(page.route);
  if (route !== '/' || page.type !== 'home') throw new Error(`${context}: a / route kizárólag type=home lehet, és a home típus kizárólag route=/ lehet. ${pageInvariantIdentity(page)}`);
  return page;
}

export function validateRootHomeSnapshot(pages = []) {
  const allPages = Array.isArray(pages) ? pages : [];
  const rootPages = allPages.filter((page) => normalizeRootInvariantRoute(page?.route) === '/');
  const misplacedHome = allPages.find((page) => page?.type === 'home' && normalizeRootInvariantRoute(page.route) !== '/');
  if (misplacedHome) return { ok: false, error: `Home típus csak route=/ alatt lehet: ${pageInvariantIdentity(misplacedHome)}` };
  if (rootPages.length === 0) return { ok: false, error: 'Hiányzó / route rekord a content snapshotban.' };
  if (rootPages.length > 1) return { ok: false, error: `Több normalizált / route rekord a content snapshotban: ${rootPages.map(pageInvariantIdentity).join(' | ')}` };
  const rootPage = rootPages[0];
  if (rootPage.type !== 'home') return { ok: false, error: `A / route rekord csak type=home lehet: ${pageInvariantIdentity(rootPage)}` };
  return { ok: true };
}
