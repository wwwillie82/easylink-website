import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import {
  AUDIT_EVENTS,
  AUDIT_EVENT_LABELS,
  auditRequestContext,
  hasAuditEvent,
  sanitizeAuditMetadata,
  writeAuditEvent,
} from '../src/lib/admin/audit.mjs';
import { routeRequirement, adminNavItems } from '../src/lib/admin/permissions.mjs';
import { auditPanel } from '../src/lib/admin/render/audit.mjs';
import { auditEventsForCompletedRequest, createAdminServer } from '../src/lib/admin/server-audit-hardening.mjs';

assert.ok(AUDIT_EVENTS.includes('admin_login_succeeded'));
assert.ok(AUDIT_EVENTS.includes('admin_publish_rollback_failed'));
assert.equal(AUDIT_EVENT_LABELS.admin_page_deleted, 'Oldal véglegesen törölve');

const secret = sanitizeAuditMetadata({
  password: 'pw',
  nested: { resetToken: 'abc', csrfToken: 'def', sessionHash: 'ghi', smtpPassword: 'smtp' },
  ok: 'safe',
  arr: [{ authorization: 'Bearer x' }],
});
assert.equal(secret.password, '[REDACTED]');
assert.equal(secret.nested.resetToken, '[REDACTED]');
assert.equal(secret.nested.csrfToken, '[REDACTED]');
assert.equal(secret.nested.sessionHash, '[REDACTED]');
assert.equal(secret.nested.smtpPassword, '[REDACTED]');
assert.equal(secret.arr[0].authorization, '[REDACTED]');
assert.equal(secret.ok, 'safe');

const request = { headers: { 'user-agent': 'UA' }, socket: { remoteAddress: '127.0.0.1' } };
const ctx1 = auditRequestContext(request, { id: 7, displayName: 'Admin', email: 'admin@example.com' });
const ctx2 = auditRequestContext(request, { id: 8 });
assert.equal(ctx1.request_id, ctx2.request_id);
assert.equal(ctx1.actor_user_id, 7);
const inserted = [];
await writeAuditEvent({ insertAuditEvent: async (row) => inserted.push(row) }, request, {
  event_code: 'admin_login_succeeded',
  result: 'success',
  actor: { id: 1, email: 'a@b.c', displayName: 'A' },
  target_label: 'safe',
  metadata: { cookie: 'bad', changedFields: ['email'] },
});
assert.equal(inserted[0].metadata_json.cookie, '[REDACTED]');
assert.equal(hasAuditEvent(request, 'admin_login_succeeded', 'success'), true);

const blockRequest = { headers: {}, socket: {} };
await writeAuditEvent({ insertAuditEvent: async (row) => inserted.push(row) }, blockRequest, {
  event_code: 'admin_block_deleted',
  result: 'success',
  metadata: { nextStatus: 'archived' },
});
assert.equal(inserted.at(-1).event_code, 'admin_block_archived');

assert.equal(routeRequirement('GET', '/admin/audit').required[0].scope, 'audit');
assert.equal(routeRequirement('GET', '/api/admin/audit').required[0].scope, 'audit');
assert.equal(routeRequirement('POST', '/api/admin/audit').methodAllowed, false);
assert.ok(adminNavItems.find((item) => item.scope === 'audit')?.u1);

const html = auditPanel();
assert.match(html, /Sikeres belépés/);
assert.match(html, /audit-row--failure/);
assert.match(html, /catch\(error\)/);
assert.doesNotMatch(html, /data-delete|data-edit/i);

const actor = { id: 1, email: 'admin@example.com', display_name: 'Admin' };
const auditRows = [];
const users = new Map([[2, { id: 2, email: 'user@example.com', display_name: 'User', status: 'active', permissions: { pages: { canSave: true } } }]]);
const repo = {
  insertAuditEvent: async (row) => auditRows.push(row),
  getAdminUserWithPermissions: async (id) => users.get(Number(id)) || null,
  page: async (id) => ({ page: { id: Number(id), title: 'Főoldal', route: '/', status: 'published' } }),
  nav: async () => [{ id: 9, title: 'Kapcsolat' }],
  block: async (id) => ({ id: Number(id), title: 'Blokk', type: 'text', status: 'published' }),
  getMedia: async (id) => ({ id: Number(id), path: '/media/test.jpg', status: 'active', type: 'image/jpeg' }),
};

function fakeBaseServerFactory() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('content-type', 'application/json; charset=utf-8');
    if (url.pathname === '/api/admin/users' && req.method === 'POST') {
      res.statusCode = 200;
      return res.end(JSON.stringify({ ok: true, data: { id: 3, email: 'new@example.com', display_name: 'New', status: 'active', permissions: {} }, reset: { ok: false, code: 'SMTP_NOT_CONFIGURED' } }));
    }
    if (url.pathname === '/api/admin/users/2' && req.method === 'PATCH') {
      const updated = { ...users.get(2), status: 'disabled', permissions: { pages: { canSave: false } } };
      users.set(2, updated);
      res.statusCode = 200;
      return res.end(JSON.stringify({ ok: true, data: updated }));
    }
    if (url.pathname === '/api/admin/users/2/revoke-sessions') {
      res.statusCode = 200;
      return res.end(JSON.stringify({ ok: true, data: { revokedCount: 2, selfRevoked: false } }));
    }
    if (url.pathname === '/api/admin/pages/1/home') {
      res.statusCode = 200;
      return res.end(JSON.stringify({ ok: true, data: { id: 1 } }));
    }
    if (url.pathname === '/api/admin/pages/7' && req.method === 'DELETE') {
      res.statusCode = 200;
      return res.end(JSON.stringify({ ok: true, data: { id: 7, title: 'Törölt oldal', route: '/torolt/' }, publish: { ok: true, snapshotId: 44 } }));
    }
    if (url.pathname === '/api/admin/navigation/9' && req.method === 'DELETE') {
      res.statusCode = 200;
      return res.end(JSON.stringify({ ok: true, data: { id: 9, title: 'Kapcsolat' }, publish: { ok: true, snapshotId: 45 } }));
    }
    if (url.pathname === '/api/admin/media/4' && req.method === 'PATCH') {
      res.statusCode = 403;
      return res.end(JSON.stringify({ ok: false, error: { code: 'FORBIDDEN', message: 'Nincs jogosultság.' } }));
    }
    if (url.pathname === '/api/admin/publish') {
      res.statusCode = 500;
      return res.end(JSON.stringify({ ok: false, error: { code: 'PUBLISH_FAILED', message: 'Hiba' } }));
    }
    res.statusCode = 404;
    return res.end(JSON.stringify({ ok: false }));
  });
}

const server = createAdminServer({
  repo,
  baseServerFactory: fakeBaseServerFactory,
  resolveContext: async () => ({ user: actor }),
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const { port } = server.address();
const call = (path, method, body) => fetch(`http://127.0.0.1:${port}${path}`, {
  method,
  headers: { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

await call('/api/admin/users', 'POST', { display_name: 'New', email: 'new@example.com' });
await call('/api/admin/users/2', 'PATCH', { status: 'disabled', permissions: { pages: { canSave: false } } });
await call('/api/admin/users/2/revoke-sessions', 'POST', {});
await call('/api/admin/pages/1/home', 'PUT', { hero_title: 'Új cím' });
await call('/api/admin/pages/7', 'DELETE', {});
await call('/api/admin/navigation/9', 'DELETE', {});
await call('/api/admin/media/4', 'PATCH', { alt: 'Új alt' });
await call('/api/admin/publish', 'POST', {});
await new Promise((resolve) => server.close(resolve));

const codes = auditRows.map((row) => `${row.event_code}:${row.result}`);
assert.ok(codes.includes('admin_user_created:success'));
assert.ok(codes.includes('admin_user_reset_link_requested:failure'));
assert.ok(codes.includes('admin_user_disabled:success'));
assert.ok(codes.includes('admin_user_permissions_changed:success'));
assert.ok(codes.includes('admin_user_sessions_revoked:success'));
assert.ok(codes.includes('admin_session_revoked:success'));
assert.ok(codes.includes('admin_page_updated:success'));
assert.ok(codes.includes('admin_page_deleted:success'));
assert.ok(codes.includes('admin_navigation_item_deleted:success'));
assert.ok(codes.includes('admin_authorization_denied:denied'));
assert.ok(codes.includes('admin_publish_failed:failure'));

const runtimeEntry = await readFile(new URL('../scripts/admin-server.mjs', import.meta.url), 'utf8');
assert.match(runtimeEntry, /server-block-save-audit-hardening\.mjs/);
const blockAuditRuntime = await readFile(new URL('../src/lib/admin/server-block-save-audit-hardening.mjs', import.meta.url), 'utf8');
assert.match(blockAuditRuntime, /server-audit-hardening\.mjs/);

const failureEvents = auditEventsForCompletedRequest({
  method: 'POST',
  pathname: '/api/admin/publish/rollback/12',
  status: 409,
  response: { error: { code: 'CONTENT_REFERENCE_INVALID' } },
  actor,
});
assert.equal(failureEvents[0].event_code, 'admin_publish_rollback_failed');
assert.equal(failureEvents[0].result, 'failure');

console.log('Admin audit runtime smoke passed.');
