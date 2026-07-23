import assert from 'node:assert/strict';
import { once } from 'node:events';
import {
  buildNavigationPayloadItem,
  isValidHttpExternalUrlForMenu,
  navHtml,
  prefillTargetModeFields,
} from '../src/lib/admin/render/menu.mjs';
import { validateNavPayload } from '../src/lib/admin/server.mjs';
import { createAdminServer } from '../src/lib/admin/server.mjs';
import { tokenHash } from '../src/lib/admin/auth.mjs';
import { isValidHttpExternalUrl } from '../src/lib/content/internal-links.mjs';

const pages = [
  { id: 1, title: 'Árak', route: '/arak/', status: 'published' },
  { id: 2, title: 'Draft oldal', route: '/draft/', status: 'draft' },
  { id: 3, title: 'Archivált oldal', route: '/archivalt/', status: 'archived' },
];
const items = [
  { id: 10, title: 'Árak', href: '/arak/', sort_order: 1, status: 'published', target_type: 'page', target_page_id: 1, title_override: null, parent_id: null },
  { id: 11, title: 'Docs', href: 'https://example.com/docs', sort_order: 2, status: 'draft', target_type: 'external', target_page_id: null, title_override: null, parent_id: null },
  { id: 12, title: 'Régi', href: '/kezi?x=1', sort_order: 3, status: 'archived', target_type: 'legacy', target_page_id: null, title_override: null, parent_id: null },
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
assert.match(html, /nav-list-actions/);
assert.match(html, /target-page-meta/);
assert.match(html, /data-role="page-status-badge"/);
assert.match(html, /Menüpont láthatósága/);

assert.deepEqual(
  prefillTargetModeFields({
    target_type: 'page',
    target_page_id: '1',
    title_mode: 'inherit',
    title_override: '',
    external_title: '',
    external_href: '',
    legacy_title: '',
    legacy_href: '',
  }, pages),
  { title: 'Árak', href: '/arak/' },
);
assert.deepEqual(
  prefillTargetModeFields({
    target_type: 'legacy',
    legacy_title: 'Régi cím',
    legacy_href: '/regi?x=1',
  }, pages),
  { title: 'Régi cím', href: '/regi?x=1' },
);

const inherited = buildNavigationPayloadItem({
  is_new: '0',
  id: '10',
  target_type: 'page',
  target_page_id: '1',
  title_mode: 'inherit',
  title_override: '',
  sort_order: '4',
  status: 'published',
}, pages);
assert.deepEqual(inherited, {
  id: '10',
  sort_order: '4',
  status: 'published',
  target_type: 'page',
  target_page_id: 1,
  title_override: null,
  title: 'Árak',
  href: '/arak/',
});
assert.throws(
  () => buildNavigationPayloadItem({
    is_new: '1',
    target_type: 'external',
    external_title: 'Bad sort',
    external_href: 'https://example.com/client-bad-sort',
    sort_order: '1.5',
    status: 'draft',
  }, pages),
  /sorrend/,
);

for (const value of ['https://example.com', 'http://example.com/path']) {
  assert.equal(isValidHttpExternalUrlForMenu(value), true);
  assert.equal(isValidHttpExternalUrl(value), true);
}
for (const value of ['https://', 'http://', 'mailto:x@example.com', '/belso/', 'https://exa mple.com']) {
  assert.equal(isValidHttpExternalUrlForMenu(value), false);
  assert.equal(isValidHttpExternalUrl(value), false);
}
assert.equal(validateNavPayload({
  items: [{ title: 'Árak', href: '/arak/', sort_order: 1, status: 'published', target_type: 'page', target_page_id: 1, title_override: null }],
}, pages).ok, true);
assert.equal(validateNavPayload({
  items: [{ title: 'A', href: '/dupe/', sort_order: 1, status: 'draft' }, { title: 'B', href: '/dupe/', sort_order: 2, status: 'draft' }],
}, pages).error.code, 'DUPLICATE_NAVIGATION_HREF');

const sessionToken = 'menu-session-token';
const csrfToken = 'menu-csrf-token';
const session = { id: 21, admin_user_id: 1, expires_at: new Date(Date.now() + 60_000), revoked_at: null };
const user = { id: 1, email: 'a@b.test', display_name: 'A', status: 'active' };
let publishCalls = 0;
const httpRepo = {
  async resolveAdminSessionByTokenHash(hash) {
    return hash === tokenHash(sessionToken) ? { session, user } : null;
  },
  async loadAdminUserScopes() {
    return [{ scope_code: 'menu', can_save: 1, can_archive: 1, can_delete: 1, can_republish: 0, can_restore: 0 }];
  },
  async touchAdminSession() {},
  async getAdminSessionCsrfHash() { return tokenHash(csrfToken); },
  async pages() { return pages; },
  async nav() { return []; },
  async updateNav(nextItems) {
    if (nextItems[0]?.title === 'Repo invalid') {
      const error = new Error('Repository validation failed');
      error.code = 'VALIDATION_ERROR';
      error.status = 400;
      throw error;
    }
    if (nextItems[0]?.title === 'DB duplicate') {
      const error = new Error('Duplicate entry');
      error.code = 'ER_DUP_ENTRY';
      throw error;
    }
    return [101];
  },
};

const server = createAdminServer({
  repo: httpRepo,
  env: { NODE_ENV: 'test' },
  publishService: { publish: async () => { publishCalls += 1; return { ok: true }; } },
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
const headers = {
  cookie: `easylink_site_admin=${encodeURIComponent(sessionToken)}`,
  'x-csrf-token': csrfToken,
  'content-type': 'application/json',
};

try {
  let response = await fetch(`${base}/api/admin/navigation`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      items: [{ title: 'Repo invalid', href: 'https://example.com/repo-invalid', sort_order: 1, status: 'draft', target_type: 'external', target_page_id: null, title_override: null }],
    }),
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'INVALID_NAVIGATION_ITEM');

  response = await fetch(`${base}/api/admin/navigation`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      items: [{ title: 'DB duplicate', href: 'https://example.com/db-dupe', sort_order: 1, status: 'draft', target_type: 'external', target_page_id: null, title_override: null }],
    }),
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'DUPLICATE_NAVIGATION_HREF');

  response = await fetch(`${base}/api/admin/navigation`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      items: [{ title: 'Bad sort', href: 'https://example.com/bad-sort', sort_order: 0, status: 'draft', target_type: 'external', target_page_id: null, title_override: null }],
    }),
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'INVALID_NAVIGATION_SORT_ORDER');
  assert.equal(publishCalls, 0);
} finally {
  server.close();
}

console.log('PR-A2b menu admin smoke passed.');
