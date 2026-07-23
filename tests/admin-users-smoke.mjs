import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import {
  adminNavItems,
  adminRouteRules,
  defaultNewUserPermissionMatrix,
  fullAdminPermissionMatrix,
} from '../src/lib/admin/permissions.mjs';
import {
  classifyUserMutation,
  defaultNewUserPermissions,
  isFullAdminMatrix,
  normalizePermissionMatrix,
  publicUser,
  validateUserPayload,
} from '../src/lib/admin/users.mjs';
import {
  baseAdminUrl,
  GENERIC_RESET_MESSAGE,
  issuePasswordReset,
  requestPasswordReset,
  RESET_EXPIRES_MINUTES,
  tokenHash as resetTokenHash,
} from '../src/lib/admin/password-reset.mjs';
import { tokenHash as authTokenHash } from '../src/lib/admin/auth.mjs';
import { usersHtml, forgotPasswordHtml, resetPasswordHtml } from '../src/lib/admin/render/users.mjs';
import { loginHtml } from '../src/lib/admin/render.mjs';
import { createAdminServer } from '../src/lib/admin/server-users-hardening.mjs';

assert.equal(adminNavItems.find((item) => item.scope === 'users')?.u1, true);
assert.equal(adminNavItems.find((item) => item.scope === 'audit')?.u1, false);
assert(adminRouteRules.some((rule) => rule.pattern.test('/admin/users') && rule.scope === 'users'));
assert(adminRouteRules.some((rule) => rule.pattern.test('/api/admin/password-reset/request') && rule.public));

const created = validateUserPayload({ display_name: ' Teszt ', email: 'USER@EXAMPLE.COM' }, { create: true });
assert.equal(created.email, 'user@example.com');
assert.equal(created.status, 'active');
assert.deepEqual(created.permissions, defaultNewUserPermissions);
assert.throws(
  () => validateUserPayload({ display_name: 'Teszt', email: 'user@example.com', role: 'admin' }, { create: true }),
  (error) => error.code === 'IMMUTABLE_USER_FIELD',
);

const current = {
  id: 2,
  display_name: 'Második Admin',
  email: 'second@example.com',
  status: 'active',
  permissions: fullAdminPermissionMatrix,
};
const partial = classifyUserMutation(current, { status: 'disabled' });
assert.equal(partial.needsArchive, true);
assert.equal(partial.needsSave, false);
assert.equal(partial.next.email, current.email);
assert.equal(partial.next.permissions.users.canSave, true);
assert.equal(classifyUserMutation(current, {}).noOp, true);
assert.equal(normalizePermissionMatrix({ media: { canDelete: true } }).media.canDelete, false);
assert.equal(isFullAdminMatrix(fullAdminPermissionMatrix), true);
assert.equal(isFullAdminMatrix(defaultNewUserPermissionMatrix), false);

const normalizedPublic = publicUser(
  { id: 9, email: 'u@example.com', display_name: 'U', status: 'active' },
  [{ scope_code: 'users', can_save: 1, can_archive: 0, can_delete: 0, can_republish: 0, can_restore: 0 }],
);
assert.equal(normalizedPublic.permissions.users.canSave, true);
assert.equal(Array.isArray(normalizedPublic.permissions), false);

assert.equal(RESET_EXPIRES_MINUTES, 60);
assert.match(resetTokenHash('secret'), /^[a-f0-9]{64}$/);
assert.equal(baseAdminUrl({ SITE_ADMIN_BASE_URL: 'https://site-dev.easylink.hu/' }), 'https://site-dev.easylink.hu');
assert.throws(() => baseAdminUrl({}), (error) => error.code === 'BASE_URL_NOT_CONFIGURED');

const resetEvents = [];
const resetRepo = {
  async reserveAdminPasswordResetToken(_id, hash) { resetEvents.push(['reserve', hash]); },
  async activateAdminPasswordResetToken(_id, hash) { resetEvents.push(['activate', hash]); },
  async cancelAdminPasswordResetToken(_id, hash) { resetEvents.push(['cancel', hash]); },
};
let sentResetUrl = '';
const issued = await issuePasswordReset(
  resetRepo,
  { id: 4, email: 'reset@example.com', display_name: 'Reset', status: 'active' },
  {
    env: { SITE_ADMIN_BASE_URL: 'https://site-dev.easylink.hu' },
    mailer: { async sendPasswordReset({ resetUrl }) { sentResetUrl = resetUrl; resetEvents.push(['send']); } },
  },
);
assert.deepEqual(issued, { ok: true, publicRequest: false });
assert.match(sentResetUrl, /^https:\/\/site-dev\.easylink\.hu\/admin\/reset-password\?token=/);
assert.deepEqual(resetEvents.map(([name]) => name), ['reserve', 'send', 'activate']);
assert.equal('token' in issued, false);

const failedEvents = [];
await assert.rejects(
  issuePasswordReset(
    {
      async reserveAdminPasswordResetToken() { failedEvents.push('reserve'); },
      async activateAdminPasswordResetToken() { failedEvents.push('activate'); },
      async cancelAdminPasswordResetToken() { failedEvents.push('cancel'); },
    },
    { id: 5, email: 'fail@example.com', display_name: 'Fail', status: 'active' },
    {
      env: { SITE_ADMIN_BASE_URL: 'https://site-dev.easylink.hu' },
      mailer: { async sendPasswordReset() { failedEvents.push('send'); throw new Error('smtp down'); } },
    },
  ),
  (error) => error.code === 'SEND_FAILED',
);
assert.deepEqual(failedEvents, ['reserve', 'send', 'cancel']);

let unknownLookup = 0;
const generic = await requestPasswordReset(
  { async findAdminUserByEmail() { unknownLookup += 1; return null; } },
  'missing@example.com',
);
assert.equal(unknownLookup, 1);
assert.equal(generic.message, GENERIC_RESET_MESSAGE);

const userHtml = usersHtml({ permissions: { users: { canSave: true, canArchive: true } } });
assert.match(userHtml, /defaultPermissions/);
assert.match(userHtml, /Jelszóbeállító link/);
assert.match(userHtml, /A felhasználó létrejött, de/);
assert.doesNotMatch(userHtml, /password_hash|token_hash/);
assert.doesNotMatch(usersHtml({ permissions: { users: {} } }), /<button id="newUser">/);
assert.match(forgotPasswordHtml(), /Vissza a belépéshez/);
assert.match(resetPasswordHtml('abc'), /minlength="12"/);
assert.match(loginHtml(), /\/admin\/forgot-password/);

const schema = await readFile(new URL('../src/lib/db/schema.sql', import.meta.url), 'utf8');
assert.match(schema, /CREATE TABLE IF NOT EXISTS site_admin_password_reset_tokens/);
assert.match(schema, /token_hash CHAR\(64\) NOT NULL UNIQUE/);

const sessionToken = 'session-token';
const csrfToken = 'csrf-token';
let permissionRows = [
  { scope_code: 'users', can_save: 1, can_archive: 1, can_delete: 0, can_republish: 0, can_restore: 0 },
];
const users = new Map([
  [1, { id: 1, email: 'admin@example.com', display_name: 'Admin', status: 'active', permissions: normalizePermissionMatrix(fullAdminPermissionMatrix) }],
  [2, { id: 2, email: 'second@example.com', display_name: 'Second', status: 'active', permissions: normalizePermissionMatrix(defaultNewUserPermissionMatrix) }],
]);
let lastUpdate = null;
const repo = {
  async resolveAdminSessionByTokenHash(hash) {
    if (hash !== authTokenHash(sessionToken)) return null;
    return {
      session: { id: 10, admin_user_id: 1, expires_at: new Date(Date.now() + 60_000), revoked_at: null },
      user: { id: 1, email: 'admin@example.com', display_name: 'Admin', status: 'active' },
    };
  },
  async touchAdminSession() {},
  async loadAdminUserScopes() { return permissionRows; },
  async getAdminSessionCsrfHash() { return authTokenHash(csrfToken); },
  async listAdminUsers() {
    return [...users.values()].map(({ permissions, ...row }) => row);
  },
  async getAdminUserWithPermissions(id) { return users.get(Number(id)) || null; },
  async updateAdminUserWithPermissions(id, payload) {
    lastUpdate = payload;
    const next = { ...users.get(Number(id)), ...payload };
    users.set(Number(id), next);
    return next;
  },
  async createAdminUserWithPermissions(payload) {
    const next = { id: 3, ...validateUserPayload(payload, { create: true }) };
    users.set(3, next);
    return next;
  },
  async revokeAdminUserSessions() { return { revokedCount: 2 }; },
};

const server = createAdminServer({
  repo,
  pool: null,
  env: { NODE_ENV: 'test', SITE_ADMIN_BASE_URL: 'https://site-dev.easylink.hu' },
  publishService: { async publish() { return { ok: true }; } },
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
const origin = `http://127.0.0.1:${address.port}`;

async function adminRequest(path, { method = 'GET', body, csrf = true } = {}) {
  const headers = { cookie: `easylink_site_admin=${sessionToken}; easylink_site_admin_csrf=${csrfToken}` };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (csrf && method !== 'GET') headers['x-csrf-token'] = csrfToken;
  const response = await fetch(origin + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json();
  return { response, payload };
}

try {
  const listed = await adminRequest('/api/admin/users');
  assert.equal(listed.response.status, 200);
  assert.equal(listed.payload.data.find((row) => row.id === 1).is_self, true);

  const missingCsrf = await adminRequest('/api/admin/users/2', {
    method: 'PATCH',
    body: { status: 'disabled' },
    csrf: false,
  });
  assert.equal(missingCsrf.response.status, 403);

  permissionRows = [
    { scope_code: 'users', can_save: 0, can_archive: 1, can_delete: 0, can_republish: 0, can_restore: 0 },
  ];
  const archived = await adminRequest('/api/admin/users/2', {
    method: 'PATCH',
    body: { status: 'disabled' },
  });
  assert.equal(archived.response.status, 200);
  assert.equal(lastUpdate.email, 'second@example.com');
  assert.equal(lastUpdate.permissions.pages.canSave, true);

  const forbiddenSave = await adminRequest('/api/admin/users/2', {
    method: 'PATCH',
    body: { email: 'changed@example.com' },
  });
  assert.equal(forbiddenSave.response.status, 403);
} finally {
  server.close();
  await once(server, 'close');
}

console.log('admin-users U2 smoke ok');
