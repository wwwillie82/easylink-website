import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createAdminServer } from '../src/lib/admin/server.mjs';
import { tokenHash } from '../src/lib/admin/auth.mjs';

const sessionToken = 'home-session-token';
const csrfToken = 'home-csrf-token';
const user = { id: 1, email: 'a@example.test', display_name: 'A', status: 'active' };
const session = { id: 11, admin_user_id: 1, expires_at: new Date(Date.now() + 60_000), revoked_at: null };
const permissionRows = [
  { scope_code: 'pages', can_save: 1, can_archive: 1, can_delete: 1, can_republish: 0, can_restore: 0 },
];

let publishCalls = 0;
let snapshots = 0;
const repo = {
  async resolveAdminSessionByTokenHash(hash) {
    return hash === tokenHash(sessionToken) ? { session, user } : null;
  },
  async loadAdminUserScopes() { return permissionRows; },
  async touchAdminSession() {},
  async getAdminSessionCsrfHash() { return tokenHash(csrfToken); },
  async page(id) {
    return {
      page: { id: Number(id), route: '/', type: 'home', title: 'Régi cím', status: 'published', presentation: { heroVariant: 'listing' } },
      blocks: [],
      homeEditor: { editor_revision: 'r', pages: [] },
      defaultCta: {},
    };
  },
  async updateHomePageAtomic(id, payload) {
    if (payload.editor_revision === 'bad') {
      const error = new Error('A főoldal tartalma hibás.');
      error.code = 'INVALID_HOME';
      error.status = 400;
      error.details = { fieldErrors: { 'page.route': 'locked' } };
      throw error;
    }
    return { page: { id: Number(id) }, blocks: [], editor_revision: 'r2', warnings: [] };
  },
  async updatePage() { throw Object.assign(new Error('bypass'), { code: 'HOME_CANONICAL_USE_HOME_EDITOR' }); },
  async block() { return null; },
  async upsertBlock() { throw Object.assign(new Error('canonical'), { code: 'HOME_CANONICAL_USE_HOME_EDITOR' }); },
  async deleteBlock() { throw Object.assign(new Error('canonical'), { code: 'HOME_CANONICAL_USE_HOME_EDITOR' }); },
  async exportContentSnapshot() { snapshots += 1; return { pages: [], blocks: [] }; },
};

const server = createAdminServer({
  repo,
  publishService: { async publish() { publishCalls += 1; return { ok: true }; } },
  env: { NODE_ENV: 'test' },
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const port = server.address().port;
const authHeaders = {
  cookie: `easylink_site_admin=${encodeURIComponent(sessionToken)}`,
  'x-csrf-token': csrfToken,
  'content-type': 'application/json',
};

let response = await fetch(`http://127.0.0.1:${port}/api/admin/pages/1/home`, {
  method: 'PUT',
  headers: authHeaders,
  body: JSON.stringify({
    editor_revision: 'r',
    page: { route: '/', type: 'home', title: 'Új cím' },
    blocks: [],
  }),
});
let json = await response.json();
assert.equal(response.status, 200);
assert.equal(json.ok, true);
assert.equal(json.data.editor_revision, 'r2');
assert.equal(publishCalls, 0);
assert.equal(snapshots, 0);

response = await fetch(`http://127.0.0.1:${port}/api/admin/pages/1/home`, {
  method: 'PUT',
  headers: authHeaders,
  body: JSON.stringify({
    editor_revision: 'bad',
    page: { route: '/bad', title: 'Más cím' },
    blocks: [],
  }),
});
json = await response.json();
assert.equal(response.status, 400);
assert.equal(json.error.code, 'INVALID_HOME');
assert.equal(json.error.details.fieldErrors['page.route'], 'locked');

response = await fetch(`http://127.0.0.1:${port}/api/admin/pages/1`, {
  method: 'PUT',
  headers: authHeaders,
  body: JSON.stringify({ title: 'Tiltott home mentés' }),
});
json = await response.json();
assert.equal(response.status, 409);
assert.equal(json.error.code, 'HOME_CANONICAL_USE_HOME_EDITOR');

response = await fetch(`http://127.0.0.1:${port}/api/admin/blocks`, {
  method: 'POST',
  headers: authHeaders,
  body: JSON.stringify({ page_id: 1, type: 'text', title: '', body: '', items: '[]', sort_order: 1, status: 'published' }),
});
json = await response.json();
assert.equal(response.status, 409);
assert.equal(json.error.code, 'HOME_CANONICAL_USE_HOME_EDITOR');

response = await fetch(`http://127.0.0.1:${port}/api/admin/blocks/1`, {
  method: 'DELETE',
  headers: {
    cookie: authHeaders.cookie,
    'x-csrf-token': csrfToken,
  },
});
json = await response.json();
assert.equal(response.status, 409);
assert.equal(json.error.code, 'HOME_CANONICAL_USE_HOME_EDITOR');

server.close();
console.log('Admin home API smoke passed');
