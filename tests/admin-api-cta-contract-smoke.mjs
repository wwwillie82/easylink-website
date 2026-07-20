import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createAdminServer } from '../src/lib/admin/server.mjs';
import { sessionCookie, signSession } from '../src/lib/admin/auth.mjs';

const secret = 'x'.repeat(32);
const user = { id: 7, email: 'admin@example.com' };
let publishCalls = 0;
let upsertCalls = 0;
const validationError = new Error('Invalid CTA');
validationError.code = 'VALIDATION_ERROR';
validationError.status = 400;
const repo = {
  async upsertBlock() { upsertCalls += 1; throw validationError; },
};
const publishService = { async publish() { publishCalls += 1; return { ok: true }; } };
const server = createAdminServer({ repo, publishService, env: { SITE_ADMIN_SESSION_SECRET: secret, NODE_ENV: 'test' } });
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const { port } = server.address();
const cookie = sessionCookie(signSession(user, { SITE_ADMIN_SESSION_SECRET: secret }));
const response = await fetch(`http://127.0.0.1:${port}/api/admin/blocks`, {
  method: 'POST',
  headers: { cookie, 'content-type': 'application/json' },
  body: JSON.stringify({ id: 1, page_id: 1, type: 'cta', title: 'Bad', body: '', items: '[]', sort_order: 900, status: 'published' }),
});
const json = await response.json();
server.close();
assert.equal(response.status, 400);
assert.equal(json.ok, false);
assert.equal(json.error.code, 'INVALID_BLOCK');
assert.equal(upsertCalls, 1);
assert.equal(publishCalls, 0, 'publishAfterSave must not run after invalid CTA save');
console.log('Admin API CTA contract smoke passed');
