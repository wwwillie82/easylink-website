import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { hashPassword, verifyPassword } from '../src/lib/db/client.mjs';
import { readCookie, verifySessionToken } from '../src/lib/admin/auth.mjs';
import { shouldTryDbContentForEnv, pageWithFallback } from '../src/lib/content/provider.test-helper.mjs';
import { staticPagesData } from '../src/lib/content/static-seed-data.mjs';
import { createAdminServer } from '../src/lib/admin/server.mjs';

const sessionSecret = 'test-session-secret-long-enough';
const state = {
  user: { id: 1, email: 'admin@example.com', password_hash: hashPassword('correct-password'), display_name: 'Admin', role: 'admin', status: 'active' },
  pages: [{ id: 1, route: '/arak/', slug: 'arak', type: 'pricing', title: 'Árak', status: 'published', sort_order: 1, seo_title: 'Árak', seo_description: 'Desc', hero_eyebrow: 'Árak', hero_title: 'Hero', hero_description: 'Hero desc', hero_asset: '/asset.webp' }],
  blocks: [{ id: 1, page_id: 1, block_key: 'seed:/arak/:text:0', type: 'text', title: 'Block', body: 'Body', items: '[]', status: 'published', sort_order: 1 }],

  snapshots: [],
  imported: null,
  publishCalls: 0,
  nav: [
    { id: 1, title: 'Árak', href: '/arak/', sort_order: 1, status: 'published' },
    { id: 2, title: 'Kapcsolat', href: '/kapcsolat/', sort_order: 2, status: 'published' },
    { id: 3, title: 'Archív', href: '/archiv/', sort_order: 3, status: 'draft' },
  ],
};
const repo = {
  async findAdminUserByEmail(email) { return email === state.user.email ? state.user : null; },
  async markAdminLogin() {},
  async pages() { return state.pages; },
  async page(id) { const page = state.pages.find((p) => String(p.id) === String(id)); return page ? { page, blocks: state.blocks.filter((b) => String(b.page_id) === String(id)) } : null; },
  async updatePage(id, payload) { Object.assign(state.pages.find((p) => String(p.id) === String(id)), payload); },
  async upsertBlock(payload) { JSON.parse(payload.items || 'null'); if (payload.id) { Object.assign(state.blocks.find((b) => String(b.id) === String(payload.id)), payload); return { id: payload.id }; } const block = { ...payload, id: state.blocks.length + 1, block_key: `manual:test-${state.blocks.length + 1}` }; state.blocks.push(block); return { id: block.id, block_key: block.block_key }; },
  async deleteBlock(id) { state.blocks.find((b) => String(b.id) === String(id)).status = 'archived'; },
  async nav() { return state.nav; },
  async updateNav(items) { for (const item of items) { const nav = state.nav.find((n) => String(n.id) === String(item.id)); if (!nav) throw new Error(`Navigation item not found: ${item.id}`); Object.assign(nav, { title: item.title, href: item.href, sort_order: Number(item.sort_order), status: item.status }); } },

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
  assert.match(await response.text(), /Belépés/);

  response = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'text/html' }, body: new URLSearchParams({ email: 'admin@example.com', password: 'correct-password' }), redirect: 'manual' });
  assert.equal(response.status, 303);
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);

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

  response = await fetch(`${base}/api/admin/pages/1`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ ...state.pages[0], title: 'Árak módosítva' }) });
  assert.equal(response.status, 200);
  let saved = await response.json();
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
  assert.doesNotMatch(menuHtml, /k\.match\(\/items/);

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
    { id: 999, title: 'Hiányzó', href: '/hianyzo/', sort_order: 9, status: 'draft' },
  ] }) });
  assert.equal(response.status, 500);
  assert.equal(state.nav.find((n) => n.id === 999), undefined);

  state.snapshots = [{ id: 7, created_at: '2026-07-08', created_by_admin_id: 1, content_hash: 'abcdef123456', status: 'success', is_current: 1, content_json: { pages: [{ ...state.pages[0], title: 'Rollback' }], blocks: state.blocks, navigation: state.nav, settings: [], media: [] } }];
  response = await fetch(`${base}/admin/publish`, { headers: { cookie } });
  assert.equal(response.status, 200);
  const publishHtml = await response.text();
  assert.match(publishHtml, /Korábbi élesítések/);
  assert.match(publishHtml, /Újraélesítés/);
  response = await fetch(`${base}/api/admin/publish/rollback/7`, { method: 'POST', headers: { cookie } });
  assert.equal(response.status, 200);
  assert.equal(state.pages[0].title, 'Rollback');
  assert.ok(state.publishCalls >= 3);

  response = await fetch(`${base}/admin/pages/1`, { headers: { cookie } });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Oldal szerkesztése/);
  const pageEditorHtml = await (await fetch(`${base}/admin/pages/1`, { headers: { cookie } })).text();
  assert.match(pageEditorHtml, /j.ok&&j.publish\?\.ok/);
  const menuEditorHtml = await (await fetch(`${base}/admin/menu`, { headers: { cookie } })).text();
  assert.match(menuEditorHtml, /Mentés és élesítés/);
  assert.match(menuEditorHtml, /j.ok&&j.publish\?\.ok/);
} finally {
  server.close();
}

assert.equal(verifyPassword('x', 'scrypt:salt:abcd'), false);
assert.equal(verifyPassword('x', 'bad'), false);
assert.equal(readCookie('easylink_site_admin=%E0%A4%A'), undefined);
assert.equal(verifySessionToken('bad.cookie'), null);
assert.equal(shouldTryDbContentForEnv({ SITE_CONTENT_SOURCE: 'static', DB_HOST: 'localhost' }), false);
assert.equal(shouldTryDbContentForEnv({ SITE_CONTENT_SOURCE: 'auto', DB_HOST: 'localhost', DB_NAME: 'site', DB_USER: 'site' }), true);
assert.equal((await pageWithFallback('/arak/', { getPageByRoute: async () => { throw new Error('db down'); } }, staticPagesData)).route, '/arak/');
const requiredRoutes = ['/', '/megoldasaink/', '/megoldasaink/penzugy-szamlazas/', '/megoldasaink/hr-munkaugy/', '/megoldasaink/crm-ugyfelkezeles/', '/megoldasaink/dokumentumkezeles-adminisztracio/', '/megoldasaink/kontrolling/', '/megoldasaink/ai-asszisztens/', '/kinek-szol/', '/kinek-szol/hotelek-szallashelyek/', '/kinek-szol/vendeglatohelyek/', '/kinek-szol/szolgaltato-vallalkozasok/', '/integraciok/', '/arak/', '/kapcsolat/'];
for (const route of requiredRoutes) assert.ok(staticPagesData.find((page) => page.route === route), `missing fallback route ${route}`);
assert.equal(new Set(staticPagesData.map((page) => page.route)).size, staticPagesData.length);
assert.equal(new Set(staticPagesData.flatMap((page) => page.blocks.map((block, index) => `${page.route}:${block.type}:${index}`))).size, staticPagesData.reduce((sum, page) => sum + page.blocks.length, 0));
assert.match(execFileSync('node', ['scripts/db-seed.mjs', '--dry-run'], { encoding: 'utf8' }), /15 pages, 25 blocks, 5 navigation items/);
console.log('Admin HTTP smoke passed: login, auth, malformed cookie, pages, blocks, navigation, fallback and seed checks.');
