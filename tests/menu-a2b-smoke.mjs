import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildNavigationPayloadItem, isValidHttpExternalUrlForMenu, navHtml, prefillTargetModeFields } from '../src/lib/admin/render/menu.mjs';
import { validateNavPayload } from '../src/lib/admin/server.mjs';
import { createAdminRepository } from '../src/lib/admin/repository.mjs';
import { createAdminServer } from '../src/lib/admin/server.mjs';
import { signSession } from '../src/lib/admin/auth.mjs';
import { isValidHttpExternalUrl } from '../src/lib/content/internal-links.mjs';

const pages = [
  { id: 1, title: 'Árak', route: '/arak/', status: 'published' },
  { id: 2, title: 'Draft oldal', route: '/draft/', status: 'draft' },
  { id: 3, title: 'Archivált oldal', route: '/archivalt/', status: 'archived' },
];
const items = [
  { id: 10, title: 'Árak', href: '/arak/', sort_order: 1, status: 'published', target_type: 'page', target_page_id: 1, title_override: null },
  { id: 11, title: 'Docs', href: 'https://example.com/docs', sort_order: 2, status: 'draft', target_type: 'external', target_page_id: null, title_override: null },
  { id: 12, title: 'Régi', href: '/kezi?x=1', sort_order: 3, status: 'archived', target_type: 'legacy', target_page_id: null, title_override: null },
];
const html = navHtml(items, pages);

assert.match(html, /data-nav-item/);
assert.match(html, /Árak — \/arak\/ — Publikus/);
assert.match(html, /Draft oldal — \/draft\/ — Piszkozat/);
assert.doesNotMatch(html, /Archivált oldal — \/archivalt\/ — Archivált/);
assert.match(html, /Régi kézi URL/);
assert.match(html, /data-mode="page"/);
assert.match(html, /data-mode="external"/);
assert.match(html, /data-mode="legacy"/);
assert.match(html, /Válassz célt/);
assert.match(html, /admin-save-bar/);
assert.match(html, /admin-grid--compact/);
assert.match(html, /<option value="legacy" >Régi kézi URL<\/option>/);
assert.match(html, /data-new=\\"1\\"/);
assert.doesNotMatch(html.match(/const newCardHtml="([\s\S]*?)";/)[1], /value=\\"legacy\\"/);
assert.match(html, /function menuMsg[\s\S]*textContent/);
assert.match(html, /!e\.target\.matches\('\[data-role=\"target-type\"\]'\)/);
assert.match(html, /previousState=\{\.\.\.rawRowState\(row\),target_type:row\.dataset\.targetMode\}/);


assert.deepEqual(prefillTargetModeFields({ target_type: 'page', target_page_id: '1', title_mode: 'inherit', title_override: '', external_title: '', external_href: '', legacy_title: '', legacy_href: '' }, pages), { title: 'Árak', href: '/arak/' });
assert.deepEqual(prefillTargetModeFields({ target_type: 'page', target_page_id: '1', title_mode: 'custom', title_override: 'Egyedi page cím', external_title: '', external_href: '', legacy_title: '', legacy_href: '' }, pages), { title: 'Egyedi page cím', href: '/arak/' });
assert.deepEqual(prefillTargetModeFields({ target_type: 'legacy', legacy_title: 'Régi cím', legacy_href: '/regi?x=1' }, pages), { title: 'Régi cím', href: '/regi?x=1' });

const inherited = buildNavigationPayloadItem({ is_new: '0', id: '10', target_type: 'page', target_page_id: '1', title_mode: 'inherit', title_override: '', sort_order: '4', status: 'published' }, pages);
assert.deepEqual(inherited, { id: '10', sort_order: '4', status: 'published', target_type: 'page', target_page_id: 1, title_override: null, title: 'Árak', href: '/arak/' });
const custom = buildNavigationPayloadItem({ is_new: '0', id: '10', target_type: 'page', target_page_id: '1', title_mode: 'custom', title_override: 'Egyedi', sort_order: '1', status: 'draft' }, pages);
assert.equal(custom.title_override, 'Egyedi');
assert.equal(custom.title, 'Egyedi');
const pageToLegacy = buildNavigationPayloadItem({ is_new: '0', id: '10', target_type: 'legacy', legacy_title: 'Árak', legacy_href: '/arak/', sort_order: '1', status: 'published' }, pages);
assert.equal(pageToLegacy.target_page_id, null);
assert.equal(pageToLegacy.title_override, null);
assert.throws(() => buildNavigationPayloadItem({ is_new: '1', target_type: 'legacy', legacy_title: 'X', legacy_href: '/x/', sort_order: '1', status: 'draft' }, pages), /Új menüpont/);
assert.throws(() => buildNavigationPayloadItem({ is_new: '1', target_type: '', sort_order: '1', status: 'draft' }, pages), /Válassz célt/);
assert.throws(() => buildNavigationPayloadItem({ is_new: '0', target_type: 'external', external_title: 'X', external_href: 'https://', sort_order: '1', status: 'draft' }, pages), /URL/);
assert.equal(buildNavigationPayloadItem({ is_new: '1', target_type: 'external', external_title: 'X', external_href: 'https://example.com', sort_order: '7', status: 'draft' }, pages).sort_order, '7');
assert.equal(buildNavigationPayloadItem({ is_new: '1', target_type: 'external', external_title: 'Max', external_href: 'https://example.com/max', sort_order: String(Number.MAX_SAFE_INTEGER), status: 'draft' }, pages).sort_order, String(Number.MAX_SAFE_INTEGER));
assert.throws(() => buildNavigationPayloadItem({ is_new: '0', target_type: 'page', target_page_id: '999', title_mode: 'inherit', sort_order: '1', status: 'draft' }, pages), /belső oldalt/);
for (const sort_order of [0, -1, 1.5, 'abc', '', Number.MAX_SAFE_INTEGER + 1]) {
  assert.throws(() => buildNavigationPayloadItem({ is_new: '1', target_type: 'external', external_title: 'Bad sort', external_href: 'https://example.com/client-bad-sort', sort_order, status: 'draft' }, pages), /sorrend/);
}

for (const value of ['https://example.com', 'http://example.com/path']) {
  assert.equal(isValidHttpExternalUrlForMenu(value), true);
  assert.equal(isValidHttpExternalUrl(value), true);
  assert.equal(validateNavPayload({ items: [{ title: 'X', href: value, sort_order: 1, status: 'draft', target_type: 'external', target_page_id: null, title_override: null }] }, pages).ok, true);
}
for (const value of ['https://', 'http://', 'mailto:x@example.com', '/belso/', 'https://exa mple.com']) {
  assert.equal(isValidHttpExternalUrlForMenu(value), false);
  assert.equal(isValidHttpExternalUrl(value), false);
  assert.equal(validateNavPayload({ items: [{ title: 'X', href: value, sort_order: 1, status: 'draft', target_type: 'external', target_page_id: null, title_override: null }] }, pages).ok, false);
}

assert.equal(validateNavPayload({ items: [{ title: 'Árak', href: '/arak/', sort_order: 1, status: 'published', target_type: 'page', target_page_id: 1, title_override: null }] }, pages).ok, true);
assert.equal(validateNavPayload({ items: [{ title: 'Egyedi', href: '/arak/', sort_order: 1, status: 'published', target_type: 'page', target_page_id: 1, title_override: 'Egyedi' }] }, pages).ok, true);
assert.equal(validateNavPayload({ items: [{ title: 'Árak', href: '/rossz/', sort_order: 1, status: 'published', target_type: 'page', target_page_id: 1, title_override: null }] }, pages).ok, false);
assert.equal(validateNavPayload({ items: [{ title: 'Régi', href: '/kezi?x=1', sort_order: 3, status: 'archived' }] }, pages).ok, true);
assert.equal(validateNavPayload({ items: [{ title: 'A', href: '/dupe/', sort_order: 1, status: 'draft' }, { title: 'B', href: '/dupe/', sort_order: 2, status: 'draft' }] }, pages).error.code, 'DUPLICATE_NAVIGATION_HREF');
for (const sort_order of [0, -1, 1.5, 'abc', '', Number.MAX_SAFE_INTEGER + 1]) {
  assert.equal(validateNavPayload({ items: [{ title: 'Bad sort', href: `https://example.com/sort-${String(sort_order).replace(/\W/g, '-')}`, sort_order, status: 'draft', target_type: 'external', target_page_id: null, title_override: null }] }, pages).error.code, 'INVALID_NAVIGATION_SORT_ORDER');
}

let nextId = 20;
const state = { nav: [] };
const pool = {
  commits: 0,
  rollbacks: 0,
  async beginTransaction() { this.snapshot = structuredClone(state.nav); },
  async commit() { this.commits += 1; this.snapshot = null; },
  async rollback() { this.rollbacks += 1; if (this.snapshot) state.nav = structuredClone(this.snapshot); this.snapshot = null; },
  release() {},
  async getConnection() { return this; },
  async query(sql, params) {
    if (sql.includes('site_navigation_items WHERE id=')) return [[state.nav.find((n) => Number(n.id) === Number(params[0]))].filter(Boolean)];
    if (sql.includes('site_pages WHERE id=')) return [[pages.find((p) => Number(p.id) === Number(params[0]))].filter(Boolean)];
    if (sql.includes('site_navigation_items WHERE href=? AND id<>?')) return [[state.nav.find((n) => n.href.toLowerCase() === String(params[0]).toLowerCase() && Number(n.id) !== Number(params[1]))].filter(Boolean)];
    if (sql.includes('site_navigation_items WHERE href=?')) return [[state.nav.find((n) => n.href.toLowerCase() === String(params[0]).toLowerCase())].filter(Boolean)];
    return [[]];
  },
  async execute(sql, params) {
    if (sql.startsWith('INSERT INTO site_navigation_items')) {
      if (state.nav.some((n) => n.href.toLowerCase() === String(params[1]).toLowerCase())) { const error = new Error('Duplicate entry'); error.code = 'ER_DUP_ENTRY'; throw error; }
      const id = nextId++;
      state.nav.push({ id, title: params[0], href: params[1], target_type: params[2], target_page_id: params[3], title_override: params[4], sort_order: params[5], status: params[6] });
      return [{ insertId: id, affectedRows: 1 }];
    }
    if (sql.startsWith('UPDATE site_navigation_items')) {
      const id = params.at(-1);
      const row = state.nav.find((n) => Number(n.id) === Number(id));
      Object.assign(row, { title: params[0], href: params[1], sort_order: params[2], status: params[3], target_type: params[4], target_page_id: params[5], title_override: params[6] });
      return [{ affectedRows: 1 }];
    }
    return [{ affectedRows: 0 }];
  },
};
const repo = createAdminRepository(pool);
let ids = await repo.updateNav([{ id: '', title: 'Új', href: 'https://example.com/new', sort_order: 1, status: 'draft', target_type: 'external', target_page_id: null, title_override: null }]);
assert.deepEqual(ids, [20]);
assert.equal(state.nav.length, 1);
ids = await repo.updateNav([{ id: '20', title: 'Új 2', href: 'https://example.com/new-2', sort_order: 2, status: 'published', target_type: 'external', target_page_id: null, title_override: null }]);
assert.deepEqual(ids, [20]);
assert.equal(state.nav.length, 1);
assert.equal(state.nav[0].title, 'Új 2');
await assert.rejects(() => repo.updateNav([{ title: 'A', href: 'https://example.com/a', sort_order: 1, status: 'draft', target_type: 'external' }, { title: 'B', href: 'https://example.com/a', sort_order: 2, status: 'draft', target_type: 'external' }]), /Duplikált/);
await assert.rejects(() => repo.updateNav([{ title: 'Más', href: 'https://example.com/new-2', sort_order: 3, status: 'draft', target_type: 'external' }]), /Duplikált/);
await assert.rejects(() => repo.updateNav([{ title: 'Bad sort', href: 'https://example.com/repo-bad-sort', sort_order: '1.5', status: 'draft', target_type: 'external' }]), /sorrend/);

const beforeRollbackTitle = state.nav[0].title;
await assert.rejects(() => repo.updateNav([
  { id: '20', title: 'Rollback candidate', href: 'https://example.com/new-2', sort_order: 2, status: 'published', target_type: 'external', target_page_id: null, title_override: null },
  { id: '999', title: 'Missing', href: 'https://example.com/missing', sort_order: 3, status: 'draft', target_type: 'external', target_page_id: null, title_override: null },
]), /Navigation item not found/);
assert.equal(state.nav[0].title, beforeRollbackTitle);
const beforeCaseInsertCount = state.nav.length;
await assert.rejects(() => repo.updateNav([
  { title: 'Case A', href: 'https://example.com/CaseOnly', sort_order: 4, status: 'draft', target_type: 'external', target_page_id: null, title_override: null },
  { title: 'Case B', href: 'https://example.com/caseonly', sort_order: 5, status: 'draft', target_type: 'external', target_page_id: null, title_override: null },
]), /Duplicate entry/);
assert.equal(state.nav.length, beforeCaseInsertCount);
assert.equal(pool.commits, 2);


let publishCalls = 0;
const httpRepo = {
  async pages() { return pages; },
  async nav() { return []; },
  async updateNav(items) {
    if (items[0]?.title === 'Repo invalid') {
      const error = new Error('Repository validation failed');
      error.code = 'VALIDATION_ERROR';
      error.status = 400;
      throw error;
    }
    if (items[0]?.title === 'DB duplicate') {
      const error = new Error('Duplicate entry');
      error.code = 'ER_DUP_ENTRY';
      throw error;
    }
    return [101];
  },
};
const env = { SITE_ADMIN_SESSION_SECRET: 'menu-a2b-secret' };
const server = createAdminServer({ repo: httpRepo, env, publishService: { publish: async () => { publishCalls += 1; return { ok: true }; } } });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const cookie = `easylink_site_admin=${encodeURIComponent(signSession({ id: 1, email: 'a@b.test', role: 'admin' }, env))}`;
try {
  let response = await fetch(`${base}/api/admin/navigation`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ items: [{ title: 'Repo invalid', href: 'https://example.com/repo-invalid', sort_order: 1, status: 'draft', target_type: 'external', target_page_id: null, title_override: null }] }) });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'INVALID_NAVIGATION_ITEM');
  response = await fetch(`${base}/api/admin/navigation`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ items: [{ title: 'DB duplicate', href: 'https://example.com/db-dupe', sort_order: 1, status: 'draft', target_type: 'external', target_page_id: null, title_override: null }] }) });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'DUPLICATE_NAVIGATION_HREF');
  response = await fetch(`${base}/api/admin/navigation`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ items: [{ title: 'Bad sort', href: 'https://example.com/bad-sort', sort_order: 0, status: 'draft', target_type: 'external', target_page_id: null, title_override: null }] }) });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'INVALID_NAVIGATION_SORT_ORDER');
  assert.equal(publishCalls, 0);
} finally {
  server.close();
}

const header = await readFile('src/components/Header.astro', 'utf8');
assert.match(header, /listNavigation/);
console.log('PR-A2b menu admin smoke passed.');
