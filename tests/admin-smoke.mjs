import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { once } from 'node:events';
import { hashPassword, verifyPassword } from '../src/lib/db/client.mjs';
import { readCookie, verifySessionToken } from '../src/lib/admin/auth.mjs';
import { shouldTryDbContentForEnv, pageWithFallback } from '../src/lib/content/provider.test-helper.mjs';
import { staticPagesData } from '../src/lib/content/static-seed-data.mjs';
import { createAdminServer } from '../src/lib/admin/server.mjs';
import { staleSeedKeys } from '../scripts/db-seed.mjs';

const sessionSecret = 'test-session-secret-long-enough';
const state = {
  user: { id: 1, email: 'admin@example.com', password_hash: hashPassword('correct-password'), display_name: 'Admin', role: 'admin', status: 'active' },
  pages: [
    { id: 1, route: '/arak/', slug: 'arak', type: 'pricing', title: 'Árak', status: 'published', sort_order: 1, seo_title: 'Árak', seo_description: 'Desc', hero_eyebrow: 'Árak', hero_title: 'Hero', hero_description: 'Hero desc', hero_asset: '/asset.webp' },
    { id: 10, route: '/', slug: 'home', type: 'home', title: 'Kezdőlap', status: 'published', sort_order: 0, seo_title: 'Home SEO', seo_description: 'Home desc', hero_eyebrow: 'Home', hero_title: 'Home hero', hero_description: 'Home hero desc', hero_asset: '/home.webp' },
    { id: 20, route: '/megoldasaink/', slug: 'megoldasaink', type: 'solutions_index', title: 'Megoldásaink', status: 'published', sort_order: 10, seo_title: 'Megoldásaink', seo_description: 'Desc', hero_eyebrow: 'Megoldásaink', hero_title: 'Hero', hero_description: 'Hero desc', hero_asset: '/asset.webp' },
    { id: 22, route: '/megoldasaink-fallback/', slug: 'megoldasaink-fallback', type: 'solutions_index', title: 'Megoldásaink fallback', status: 'published', sort_order: 11, seo_title: 'Megoldásaink fallback', seo_description: 'Desc', hero_eyebrow: 'Megoldásaink', hero_title: 'Hero', hero_description: 'Hero desc', hero_asset: '/asset.webp' },
    { id: 23, route: '/integraciok-fallback/', slug: 'integraciok-fallback', type: 'integrations', title: 'Integrációk fallback', status: 'published', sort_order: 12, seo_title: 'Integrációk fallback', seo_description: 'Desc', hero_eyebrow: 'Integrációk', hero_title: 'Hero', hero_description: 'Hero desc', hero_asset: '/asset.webp' },
  ],
  blocks: [{ id: 1, page_id: 1, block_key: 'seed:/arak/:text:0', type: 'text', title: 'Block', body: 'Body', items: '[]', status: 'published', sort_order: 1 },
    { id: 20, page_id: 20, block_key: 'seed:/megoldasaink/:cards:0', type: 'cards', title: 'Megoldás lista', body: 'Body', items: '[{"title":"Pénzügy","text":"Szöveg","url":"/megoldasaink/penzugy-szamlazas/","linkLabel":"Részletek →","order":1}]', status: 'published', sort_order: 1 },
    { id: 21, page_id: 20, block_key: 'seed:/megoldasaink/:text:1', type: 'text', title: 'Nem renderelt', body: 'Body', items: '[]', status: 'published', sort_order: 2 },
    { id: 22, page_id: 22, block_key: 'seed:/megoldasaink-fallback/:feature-list:0', type: 'feature-list', title: 'Régi nem renderelt feature', body: 'Body', items: '["Régi"]', status: 'published', sort_order: 1 },
    { id: 23, page_id: 23, block_key: 'seed:/integraciok-fallback/:text:0', type: 'text', title: 'Régi nem renderelt integráció szöveg', body: 'Body', items: '[]', status: 'published', sort_order: 1 }],

  snapshots: [],
  imported: null,
  publishCalls: 0,
  nav: [
    { id: 1, title: 'Árak', href: '/arak/', sort_order: 1, status: 'published' },
    { id: 2, title: 'Kapcsolat', href: '/kapcsolat/', sort_order: 2, status: 'published' },
    { id: 3, title: 'Archív', href: '/archiv/', sort_order: 3, status: 'draft' },
  ],
};
const normalizeRoute = (route) => { const withStart = String(route || '').startsWith('/') ? String(route || '') : `/${route}`; return withStart.endsWith('/') ? withStart : `${withStart}/`; };
const validationError = (message) => Object.assign(new Error(message), { status: 400, code: 'VALIDATION_ERROR' });
const repo = {
  async findAdminUserByEmail(email) { return email === state.user.email ? state.user : null; },
  async markAdminLogin() {},
  async pages() { return state.pages; },
  async createPage(payload) { const route = normalizeRoute(payload.route); if (route === '/') throw validationError('Adj meg érvényes URL-t.'); if (state.pages.find((p) => p.route === route)) throw validationError('Ez az URL már létezik.'); const page = { id: Math.max(...state.pages.map((p) => p.id)) + 1, route, slug: route.replace(/^\//, '').replace(/\/$/, ''), type: payload.type || 'content_page', title: payload.title, status: payload.status || 'draft', sort_order: state.pages.length + 1, seo_title: payload.title, seo_description: '', hero_eyebrow: '', hero_title: payload.title, hero_description: '', hero_asset: '' }; state.pages.push(page); return { id: page.id, route: page.route, slug: page.slug }; },
  async page(id) { const page = state.pages.find((p) => String(p.id) === String(id)); return page ? { page, blocks: state.blocks.filter((b) => String(b.page_id) === String(id)) } : null; },
  async updatePage(id, payload) { const page = state.pages.find((p) => String(p.id) === String(id)); const route = payload.route ? normalizeRoute(payload.route) : page.route; const isExistingHome = page.route === '/' || page.type === 'home'; if (route === '/' && !isExistingHome) throw validationError('Adj meg érvényes URL-t.'); if (state.pages.find((p) => p.route === route && String(p.id) !== String(id))) throw validationError('Ez az URL már létezik.'); Object.assign(page, payload, { route, slug: route === '/' ? 'home' : (payload.slug || page.slug) }); },
  async upsertBlock(payload) { JSON.parse(payload.items || 'null'); if (payload.id) { Object.assign(state.blocks.find((b) => String(b.id) === String(payload.id)), payload); return { id: payload.id }; } const block = { ...payload, id: state.blocks.length + 1, block_key: `manual:test-${state.blocks.length + 1}` }; state.blocks.push(block); return { id: block.id, block_key: block.block_key }; },
  async deleteBlock(id) { state.blocks.find((b) => String(b.id) === String(id)).status = 'archived'; },
  async nav() { return state.nav; },
  async updateNav(items) { for (const item of items) { if (item.id) { const nav = state.nav.find((n) => String(n.id) === String(item.id)); if (!nav) throw new Error(`Navigation item not found: ${item.id}`); Object.assign(nav, { title: item.title, href: item.href, sort_order: Number(item.sort_order), status: item.status }); } else { state.nav.push({ id: Math.max(...state.nav.map((n) => n.id)) + 1, title: item.title, href: item.href, sort_order: Number(item.sort_order), status: item.status }); } } state.nav.sort((a,b)=>a.sort_order-b.sort_order||a.id-b.id); },

  async exportContentSnapshot() { return { pages: structuredClone(state.pages), blocks: structuredClone(state.blocks), navigation: structuredClone(state.nav), settings: [], media: [] }; },
  async importContentSnapshot(content) { state.imported = content; state.pages = structuredClone(content.pages || []); state.blocks = structuredClone(content.blocks || []); state.nav = structuredClone(content.navigation || []); },
  async publishSnapshots(limit = 20) { return state.snapshots.filter((s) => s.status === 'success').slice(0, limit); },
  async publishStatus() { return { lastSuccess: state.snapshots.find((s) => s.status === 'success') || null, lastError: state.snapshots.find((s) => s.status === 'failed') || null }; },
  async publishSnapshot(id) { return state.snapshots.find((s) => String(s.id) === String(id) && s.status === 'success') || null; },
};

const publishService = { isRunning: () => false, async publish() { state.publishCalls += 1; return { ok: true, status: 'success', contentSaved: true, published: true }; } };
const server = createAdminServer({ repo, publishService, env: { SITE_ADMIN_SESSION_SECRET: sessionSecret, NODE_ENV: 'test' } });
server.listen(0);
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
try {
  let response = await fetch(`${base}/admin/login`);
  assert.equal(response.status, 200);
  const loginPageHtml = await response.text();
  assert.match(loginPageHtml, /Belépés/);
  assert.doesNotMatch(loginPageHtml, /Dashboard/);
  assert.doesNotMatch(loginPageHtml, /Oldalak/);
  assert.doesNotMatch(loginPageHtml, /Kilépés/);

  response = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'text/html' }, body: new URLSearchParams({ email: 'admin@example.com', password: 'correct-password' }), redirect: 'manual' });
  assert.equal(response.status, 303);
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.equal(response.headers.get('location'), '/admin/pages');


  response = await fetch(`${base}/admin/pages`, { headers: { cookie } });
  assert.equal(response.status, 200);
  const pagesHtml = await response.text();
  assert.match(pagesHtml, /admin-nav/);
  assert.match(pagesHtml, /Oldalak/);
  assert.match(pagesHtml, /Oldal neve/);
  assert.match(pagesHtml, /Típus/);
  assert.match(pagesHtml, /Új oldal létrehozása/);
  assert.match(pagesHtml, /Általános tartalmi oldal/);
  assert.match(pagesHtml, /Kilépés/);
  assert.doesNotMatch(pagesHtml, />Dashboard</);
  assert.match(pagesHtml, /button,\.btn\{[^}]*cursor:pointer/);
  assert.match(pagesHtml, /button:hover,\.btn:hover/);
  assert.match(pagesHtml, /button:focus-visible,\.btn:focus-visible/);
  assert.match(pagesHtml, /button:disabled/);
  assert.match(pagesHtml, /button:active,\.btn:active,\.admin-nav a:active/);
  assert.match(pagesHtml, /transform:translateY\(1px\) scale\(\.99\)/);
  assert.match(pagesHtml, /\.admin-header\{position:sticky;top:0;z-index:30/);
  assert.match(pagesHtml, /#msg\{position:sticky;top:118px;z-index:25/);

  response = await fetch(`${base}/admin/dashboard`, { headers: { cookie }, redirect: 'manual' });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/admin/pages');

  response = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bad', password: 'short' }) });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).ok, false);

  response = await fetch(`${base}/api/admin/pages`);
  assert.equal(response.status, 401);
  response = await fetch(`${base}/api/admin/pages`, { headers: { cookie: 'easylink_site_admin=bad.cookie' } });
  assert.equal(response.status, 401);

  response = await fetch(`${base}/api/admin/pages`, { headers: { cookie } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data[0].route, '/arak/');

  response = await fetch(`${base}/api/admin/pages`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Rólunk', route: '/rolunk/', type: 'content_page', status: 'draft' }) });
  assert.equal(response.status, 200);
  let saved = await response.json();
  assert.equal(saved.data.id, 24);
  assert.equal(state.pages.find((p) => p.id === 24).type, 'content_page');

  response = await fetch(`${base}/api/admin/pages`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Dupla', route: '/arak/', type: 'content_page', status: 'draft' }) });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error.message, /Ez az URL már létezik/);

  response = await fetch(`${base}/api/admin/pages/24`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ route: '/arak/' }) });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error.message, /Ez az URL már létezik/);

  response = await fetch(`${base}/api/admin/pages`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Root', route: '/', type: 'content_page', status: 'draft' }) });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error.message, /Adj meg érvényes URL-t/);

  response = await fetch(`${base}/api/admin/pages/1`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ route: '/' }) });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error.message, /Adj meg érvényes URL-t/);

  response = await fetch(`${base}/api/admin/pages/10`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ route: '/', title: 'Kezdőlap módosítva', seo_title: 'Home SEO módosítva', hero_title: 'Home hero módosítva', status: 'draft' }) });
  assert.equal(response.status, 200);
  saved = await response.json();
  assert.equal(saved.publish.ok, true);
  const homePage = state.pages.find((p) => p.id === 10);
  assert.equal(homePage.route, '/');
  assert.equal(homePage.slug, 'home');
  assert.equal(homePage.title, 'Kezdőlap módosítva');
  assert.equal(homePage.seo_title, 'Home SEO módosítva');
  assert.equal(homePage.hero_title, 'Home hero módosítva');
  assert.equal(homePage.status, 'draft');

  response = await fetch(`${base}/api/admin/pages/1`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ ...state.pages[0], title: 'Árak módosítva' }) });
  assert.equal(response.status, 200);
  saved = await response.json();
  assert.equal(saved.publish.ok, true);
  assert.equal(state.pages[0].title, 'Árak módosítva');

  const beforeBlocks = state.blocks.length;
  response = await fetch(`${base}/api/admin/blocks`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ page_id: 1, type: 'text', title: 'New', body: 'Body', items: '["ok"]', status: 'published', sort_order: 2 }) });
  assert.equal(response.status, 200);
  assert.equal(state.blocks.length, beforeBlocks + 1);
  assert.match(state.blocks.at(-1).block_key, /^manual:/);

  response = await fetch(`${base}/api/admin/blocks`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ page_id: 1, type: 'text', title: 'Bad', items: '{bad', status: 'published' }) });
  assert.equal(response.status, 400);
  assert.equal(state.blocks.length, beforeBlocks + 1);

  response = await fetch(`${base}/api/admin/blocks/1`, { method: 'DELETE', headers: { cookie } });
  assert.equal(response.status, 200);
  assert.equal(state.blocks[0].status, 'archived');

  response = await fetch(`${base}/admin/menu`, { headers: { cookie } });
  assert.equal(response.status, 200);
  const menuHtml = await response.text();
  assert.match(menuHtml, /data-nav-item/);
  assert.match(menuHtml, /data-field=\"title\"/);
  assert.match(menuHtml, /Menüpont neve/);
  assert.match(menuHtml, /Link/);
  assert.match(menuHtml, /Sorrend/);
  assert.match(menuHtml, /Látható/);
  assert.match(menuHtml, /Rejtett piszkozat/);
  assert.match(menuHtml, /Menüpont hozzáadása/);
  assert.match(menuHtml, /navSerializer/);
  assert.match(menuHtml, /setupDirtyForm\(form,navSerializer\)/);
  assert.match(menuHtml, /renumber\(\)/);
  assert.doesNotMatch(menuHtml, /<th>title<\/th>/);
  assert.doesNotMatch(menuHtml, /text-decoration:line-through/);

  response = await fetch(`${base}/api/admin/navigation`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ items: [] }) });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).ok, false);
  assert.equal(state.nav[0].title, 'Árak');

  response = await fetch(`${base}/api/admin/navigation`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ items: [
    { id: 1, title: 'Díjszabás', href: '/arak/', sort_order: 1, status: 'published' },
    { id: 2, title: 'Kapcsolat', href: '/kapcsolat/', sort_order: 2, status: 'published' },
    { id: 3, title: 'Archív', href: '/archiv/', sort_order: 3, status: 'draft' },
  ] }) });
  assert.equal(response.status, 200);
  saved = await response.json();
  assert.equal(saved.publish.ok, true);
  assert.equal(state.nav[0].title, 'Díjszabás');
  assert.equal(state.nav[0].href, '/arak/');
  assert.equal(state.nav[0].sort_order, 1);
  assert.equal(state.nav[1].title, 'Kapcsolat');
  assert.equal(state.nav[2].status, 'draft');

  response = await fetch(`${base}/api/admin/navigation`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ items: [
    { id: '', title: 'Blog', href: '/blog/', sort_order: 4, status: 'draft' },
  ] }) });
  assert.equal(response.status, 200);
  assert.equal(state.nav.at(-1).title, 'Blog');

  response = await fetch(`${base}/api/admin/navigation`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ items: [
    { id: 999, title: 'Hiányzó', href: '/hianyzo/', sort_order: 9, status: 'draft' },
  ] }) });
  assert.equal(response.status, 500);
  assert.equal(state.nav.find((n) => n.id === 999), undefined);

  state.snapshots = [{ id: 7, created_at: '2026-07-08', created_by_admin_id: 1, content_hash: 'abcdef123456', status: 'success', is_current: 1, content_json: { pages: [{ ...state.pages[0], title: 'Rollback' }], blocks: state.blocks, navigation: state.nav, settings: [], media: [] } }];
  response = await fetch(`${base}/admin/publish`, { headers: { cookie } });
  assert.equal(response.status, 200);
  const publishHtml = await response.text();
  assert.match(publishHtml, /Korábbi élesítések \/ Visszaállítás/);
  assert.match(publishHtml, /Visszaállítás erre az állapotra/);
  assert.doesNotMatch(publishHtml, /Utolsó hiba/);
  assert.doesNotMatch(publishHtml, /Újraélesítés/);
  assert.doesNotMatch(publishHtml, /Aktuális publish státusz/);
  response = await fetch(`${base}/api/admin/publish/rollback/7`, { method: 'POST', headers: { cookie } });
  assert.equal(response.status, 200);
  assert.equal(state.pages[0].title, 'Rollback');
  assert.ok(state.publishCalls >= 3);

  response = await fetch(`${base}/admin/pages/1`, { headers: { cookie } });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Oldal szerkesztése/);
  const fixedPageEditorHtml = await (await fetch(`${base}/admin/pages/1`, { headers: { cookie } })).text();
  assert.match(fixedPageEditorHtml, /nem ebből a blokklistából szerkeszthető/);
  assert.doesNotMatch(fixedPageEditorHtml, /Blokk típusa/);
  if (!state.pages.find((p) => p.id === 20)) state.pages.push({ id: 20, route: '/megoldasaink/', slug: 'megoldasaink', type: 'solutions_index', title: 'Megoldásaink', status: 'published', sort_order: 10, seo_title: 'Megoldásaink', seo_description: 'Desc', hero_eyebrow: 'Megoldásaink', hero_title: 'Hero', hero_description: 'Hero desc', hero_asset: '/asset.webp' });
  if (!state.blocks.find((b) => b.id === 20)) state.blocks.push({ id: 20, page_id: 20, block_key: 'seed:/megoldasaink/:cards:0', type: 'cards', title: 'Megoldás lista', body: 'Body', items: '[{"title":"Pénzügy","text":"Szöveg","url":"/megoldasaink/penzugy-szamlazas/","linkLabel":"Részletek →","order":1}]', status: 'published', sort_order: 1 });
  const goldenPageEditorHtml = await (await fetch(`${base}/admin/pages/20`, { headers: { cookie } })).text();
  assert.match(goldenPageEditorHtml, /csak a publicban ténylegesen renderelt Kártyasor komponens szerkeszthető/);
  assert.match(goldenPageEditorHtml, /Kártyasor/);
  assert.doesNotMatch(goldenPageEditorHtml, /Nem renderelt/);
  assert.doesNotMatch(goldenPageEditorHtml, /Szövegblokk<\/option>/);
  if (!state.pages.find((p) => p.id === 22)) state.pages.push({ id: 22, route: '/megoldasaink-fallback/', slug: 'megoldasaink-fallback', type: 'solutions_index', title: 'Megoldásaink fallback', status: 'published', sort_order: 11, seo_title: 'Megoldásaink fallback', seo_description: 'Desc', hero_eyebrow: 'Megoldásaink', hero_title: 'Hero', hero_description: 'Hero desc', hero_asset: '/asset.webp' });
  if (!state.blocks.find((b) => b.id === 22)) state.blocks.push({ id: 22, page_id: 22, block_key: 'seed:/megoldasaink-fallback/:feature-list:0', type: 'feature-list', title: 'Régi nem renderelt feature', body: 'Body', items: '["Régi"]', status: 'published', sort_order: 1 });
  if (!state.pages.find((p) => p.id === 23)) state.pages.push({ id: 23, route: '/integraciok-fallback/', slug: 'integraciok-fallback', type: 'integrations', title: 'Integrációk fallback', status: 'published', sort_order: 12, seo_title: 'Integrációk fallback', seo_description: 'Desc', hero_eyebrow: 'Integrációk', hero_title: 'Hero', hero_description: 'Hero desc', hero_asset: '/asset.webp' });
  if (!state.blocks.find((b) => b.id === 23)) state.blocks.push({ id: 23, page_id: 23, block_key: 'seed:/integraciok-fallback/:text:0', type: 'text', title: 'Régi nem renderelt integráció szöveg', body: 'Body', items: '[]', status: 'published', sort_order: 1 });
  const fallbackSolutionsHtml = await (await fetch(`${base}/admin/pages/22`, { headers: { cookie } })).text();
  assert.match(fallbackSolutionsHtml, /Megoldás lista/);
  assert.match(fallbackSolutionsHtml, /Pénzügy és számlázás/);
  assert.match(fallbackSolutionsHtml, /CRM és ügyfélkezelés/);
  assert.match(fallbackSolutionsHtml, /value=""/);
  assert.doesNotMatch(fallbackSolutionsHtml, /Régi nem renderelt feature/);
  assert.doesNotMatch(fallbackSolutionsHtml, /Új sor<\/button><\/div><input type="hidden" name="items" value="\[\]"/);
  const fallbackIntegrationsHtml = await (await fetch(`${base}/admin/pages/23`, { headers: { cookie } })).text();
  assert.match(fallbackIntegrationsHtml, /Integrációs irányok/);
  assert.match(fallbackIntegrationsHtml, /NAV Online Számla/);
  assert.match(fallbackIntegrationsHtml, /Billingo/);
  assert.match(fallbackIntegrationsHtml, /value=""/);
  assert.doesNotMatch(fallbackIntegrationsHtml, /Régi nem renderelt integráció szöveg/);

  response = await fetch(`${base}/api/admin/pages`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Teszt szerkeszthető', route: '/teszt-szerkesztheto/', type: 'content_page', status: 'draft' }) });
  assert.equal(response.status, 200);
  const editablePageId = (await response.json()).data.id;
  response = await fetch(`${base}/api/admin/blocks`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ page_id: editablePageId, type: 'feature-list', title: 'Feature init', body: 'Body', items: '[{\"title\":\"Lista\",\"url\":\"/stale/\",\"linkLabel\":\"Régi\",\"order\":1}]', status: 'published', sort_order: 1 }) });
  assert.equal(response.status, 200);
  const pageEditorHtml = await (await fetch(`${base}/admin/pages/${editablePageId}`, { headers: { cookie } })).text();
  assert.match(pageEditorHtml, /setupDirtyForm/);
  assert.match(pageEditorHtml, /baseline/);
  assert.match(pageEditorHtml, /addEventListener\('input',sync\)/);
  assert.match(pageEditorHtml, /Nem mentett módosítások/);
  assert.match(pageEditorHtml, /if\(dirty&&status\)status.innerHTML/);
  assert.doesNotMatch(pageEditorHtml, /querySelector\('\.err'\)/);
  assert.match(pageEditorHtml, /Oldal neve/);
  assert.match(pageEditorHtml, /Főcím/);
  assert.match(pageEditorHtml, /Bevezető szöveg/);
  assert.match(pageEditorHtml, /Haladó beállítások/);
  assert.match(pageEditorHtml, /SEO cím/);
  assert.doesNotMatch(pageEditorHtml, /items JSON/);
  assert.doesNotMatch(pageEditorHtml, /Kis címke \/ szekció címe/);
  assert.match(pageEditorHtml, /Blokk típusa/);
  assert.match(pageEditorHtml, /Szövegblokk/);
  assert.match(pageEditorHtml, /Felsorolás \/ lista/);
  assert.match(pageEditorHtml, /Kártyasor/);
  assert.match(pageEditorHtml, /CTA blokk/);
  assert.match(pageEditorHtml, /Kép \+ szöveg blokk/);
  assert.match(pageEditorHtml, /FAQ blokk/);
  assert.match(pageEditorHtml, /Gomb felirat/);
  assert.match(pageEditorHtml, /Gomb link/);
  assert.match(pageEditorHtml, /Kép URL/);
  assert.match(pageEditorHtml, /Kép pozíció/);
  assert.match(pageEditorHtml, /Kártya címe/);
  assert.match(pageEditorHtml, /Kártya szövege/);
  assert.match(pageEditorHtml, /Kérdés/);
  assert.match(pageEditorHtml, /Válasz/);
  assert.doesNotMatch(pageEditorHtml, /Gomb felirat \/ kép URL/);
  assert.match(pageEditorHtml, /blockSerializer/);
  assert.match(pageEditorHtml, /setupDirtyForm\(f,blockSerializer\)/);
  assert.match(pageEditorHtml, /if\(j.ok&&j.publish\?\.ok\)ps.markSaved\(\)/);
  assert.match(pageEditorHtml, /data-item-url/);
  assert.match(pageEditorHtml, /data-cta-label/);
  assert.match(pageEditorHtml, /data-cta-url/);
  assert.match(pageEditorHtml, /data-image-url/);
  assert.match(pageEditorHtml, /data-image-position/);
  assert.match(pageEditorHtml, /f.addEventListener\('input'/);
  assert.match(pageEditorHtml, /data-add-item/);
  assert.match(pageEditorHtml, /function syncBlockType/);
  assert.match(pageEditorHtml, /data-panel=\"items\"/);
  assert.match(pageEditorHtml, /data-panel=\"cta\"/);
  assert.match(pageEditorHtml, /data-panel=\"image-text\"/);
  assert.match(pageEditorHtml, /data-panel=\"items\" data-list-editor hidden inert/);
  assert.match(pageEditorHtml, /data-panel=\"cta\" hidden inert/);
  assert.match(pageEditorHtml, /data-cta-label[^>]* disabled/);
  assert.match(pageEditorHtml, /data-panel=\"image-text\" hidden inert/);
  assert.match(pageEditorHtml, /data-image-url[^>]* disabled/);
  assert.match(pageEditorHtml, /if\(show\)p\.removeAttribute\('inert'\);else p\.setAttribute\('inert',''\)/);
  assert.match(pageEditorHtml, /const panels=\{items:\['feature-list','cards','faq'\]\.includes\(type\),cta:type==='cta','image-text':type==='image-text'\}/);
  assert.match(pageEditorHtml, /data-field=\"item-url\" hidden>Cél URL \/ slug<input data-item-url[^>]* disabled/);
  assert.match(pageEditorHtml, /data-field=\"item-label\" hidden>Link felirat<input data-item-label[^>]* disabled/);
  assert.match(pageEditorHtml, /data-field=\"item-badge\" hidden>Sorrend \/ badge<input data-item-badge[^>]* disabled/);
  assert.match(pageEditorHtml, /let items=\[\]/);
  assert.match(pageEditorHtml, /f\.querySelector\('input\[name=\"items\"\]'\)\.value=JSON\.stringify\(items\)/);
  assert.match(pageEditorHtml, /data-field=\"item-label\"/);
  assert.match(pageEditorHtml, /data-field=\"item-badge\"/);
  assert.match(pageEditorHtml, /el.disabled=!show/);
  assert.match(pageEditorHtml, /type==='feature-list'\)items=rows.map\(i=>i.title\)/);
  assert.match(pageEditorHtml, /type==='cards'\)items=rows.map\(i=>\(\{title:i.title,text:i.text,url:i.url,linkLabel/);
  assert.match(pageEditorHtml, /type==='cta'\)items=\[\{label:f.querySelector/);
  assert.match(pageEditorHtml, /type==='image-text'\)items=\[\{image:f.querySelector/);
  assert.match(pageEditorHtml, /type==='faq'\)items=rows.map\(i=>\(\{question:i.title,answer:i.text\}/);
  assert.match(pageEditorHtml, /const idInput=f.querySelector\('input\[name=\"id\"\]'\)/);
  assert.match(pageEditorHtml, /idInput\.value=String\(j.data.id\)/);
  assert.match(pageEditorHtml, /st.markSaved\(\)/);
  const menuEditorHtml = await (await fetch(`${base}/admin/menu`, { headers: { cookie } })).text();
  assert.match(menuEditorHtml, /Mentés és élesítés/);
  assert.match(menuEditorHtml, /setupDirtyForm/);
  assert.match(menuEditorHtml, /baseline/);
  assert.match(menuEditorHtml, /state.markSaved\(\)/);
  assert.match(menuEditorHtml, /is-archived-ui/);
  assert.match(menuEditorHtml, /state.markSaving\(\)/);
  assert.match(menuEditorHtml, /if\(j.ok\)state.markSaved\(\)/);
  assert.doesNotMatch(menuEditorHtml, /location\.reload\(\)/);
} finally {
  server.close();
}

assert.equal(verifyPassword('x', 'scrypt:salt:abcd'), false);
assert.equal(verifyPassword('x', 'bad'), false);
assert.equal(readCookie('easylink_site_admin=%E0%A4%A'), undefined);
assert.equal(verifySessionToken('bad.cookie'), null);
assert.equal(shouldTryDbContentForEnv({ SITE_CONTENT_SOURCE: 'static', DB_HOST: 'localhost' }), false);
assert.equal(shouldTryDbContentForEnv({ SITE_CONTENT_SOURCE: 'auto', DB_HOST: 'localhost', DB_NAME: 'site', DB_USER: 'site' }), true);
assert.equal(await pageWithFallback('/arak/', { getPageByRouteAny: async () => ({ ...staticPagesData.find((page) => page.route === '/arak/'), status: 'draft' }) }, staticPagesData), undefined);
assert.equal((await pageWithFallback('/arak/', { getPageByRouteAny: async () => null, getPageByRoute: async () => null }, staticPagesData)).route, '/arak/');
assert.equal((await pageWithFallback('/arak/', { getPageByRoute: async () => { throw new Error('db down'); } }, staticPagesData)).route, '/arak/');
const requiredRoutes = ['/', '/megoldasaink/', '/megoldasaink/penzugy-szamlazas/', '/megoldasaink/hr-munkaugy/', '/megoldasaink/crm-ugyfelkezeles/', '/megoldasaink/dokumentumkezeles-adminisztracio/', '/megoldasaink/kontrolling/', '/megoldasaink/ai-asszisztens/', '/kinek-szol/', '/kinek-szol/hotelek-szallashelyek/', '/kinek-szol/vendeglatohelyek/', '/kinek-szol/szolgaltato-vallalkozasok/', '/integraciok/', '/arak/', '/kapcsolat/'];
for (const route of requiredRoutes) assert.ok(staticPagesData.find((page) => page.route === route), `missing fallback route ${route}`);
assert.equal(new Set(staticPagesData.map((page) => page.route)).size, staticPagesData.length);
assert.equal(new Set(staticPagesData.flatMap((page) => page.blocks.map((block, index) => `${page.route}:${block.type}:${index}`))).size, staticPagesData.reduce((sum, page) => sum + page.blocks.length, 0));
const seededText = JSON.stringify(staticPagesData);
for (const phrase of ['Mitől függhet az ár?', 'Demó alapján pontosítunk', 'Miben tudunk segíteni?', 'Nem még egy táblázat', 'Nem késznek állított ígéretek', 'Megoldás lista', 'Célcsoportok']) assert.ok(seededText.includes(phrase), `missing seeded phrase: ${phrase}`);
const seededTypes = new Set(staticPagesData.flatMap((page) => page.blocks.map((block) => block.type)));
for (const type of ['text', 'feature-list', 'cards', 'cta']) assert.ok(seededTypes.has(type), `missing seeded block type ${type}`);
for (const file of ['src/pages/index.astro','src/pages/arak/index.astro','src/pages/kapcsolat/index.astro','src/pages/integraciok/index.astro','src/pages/megoldasaink/index.astro','src/pages/kinek-szol/index.astro']) {
  const source = readFileSync(file, 'utf8');
  assert.match(source, /getPublicPageState/);
  assert.match(source, /hiddenByDb/);
  assert.match(source, /Astro.response.status = 404/);
  assert.doesNotMatch(source, /<ContentBlocks\b/);
}
const staleKeys = staleSeedKeys([
  { block_key: '/arak/:text:0' },
  { block_key: '/arak/:feature-list:0' },
  { block_key: 'manual:test' },
  { block_key: '/kapcsolat/:text:0' },
], ['/arak/:feature-list:0', '/arak/:cta:1'], '/arak/');
assert.deepEqual(staleKeys, ['/arak/:text:0']);
const dryRunOutput = execFileSync('node', ['scripts/db-seed.mjs', '--dry-run'], { encoding: 'utf8' });
assert.match(dryRunOutput, /15 pages, 31 blocks, 5 navigation items/);
assert.match(dryRunOutput, /Stale seed block cleanup: archive route-prefixed seed blocks/);
assert.match(dryRunOutput, /manual:\* blocks are preserved/);
console.log('Admin HTTP smoke passed: login, auth, malformed cookie, pages, blocks, navigation, fallback and seed checks.');
