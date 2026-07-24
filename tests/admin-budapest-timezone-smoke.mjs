import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { ADMIN_TIME_ZONE, adminDateTimeClientSource, formatAdminDateTime } from '../src/lib/admin/date-time.mjs';
import { auditPanel } from '../src/lib/admin/render/audit.mjs';
import { usersHtml } from '../src/lib/admin/render/users.mjs';
import { publishPanel } from '../src/lib/admin/render/publish.mjs';

assert.equal(ADMIN_TIME_ZONE, 'Europe/Budapest');
assert.equal(
  formatAdminDateTime('2026-07-24T06:11:44.000Z'),
  '2026.07.24. 08:11:44 (Europe/Budapest)',
);
assert.equal(
  formatAdminDateTime('2026-01-24T06:11:44.000Z'),
  '2026.01.24. 07:11:44 (Europe/Budapest)',
);
assert.equal(formatAdminDateTime(null), '—');
assert.equal(formatAdminDateTime(null, '-'), '-');

const sandbox = {};
vm.runInNewContext(`${adminDateTimeClientSource()}\nresult=formatAdminDateTime('2026-07-24T06:11:44.000Z');`, sandbox);
assert.equal(sandbox.result, '2026.07.24. 08:11:44 (Europe/Budapest)');

const auditHtml = auditPanel();
assert.match(auditHtml, /formatAdminDateTime\(a\.created_at\)/);
assert.match(auditHtml, /Europe\/Budapest időzónában/);
assert.doesNotMatch(auditHtml, /escHtml\(a\.created_at\)/);

const users = usersHtml({ permissions: { users: { canSave: true, canArchive: true } } });
assert.match(users, /formatAdminDateTime\(user\.last_login_at,'-'\)/);
assert.doesNotMatch(users, /escapeHtml\(user\.last_login_at\|\|'-'\)/);

const publish = publishPanel({
  snapshots: [{ id: 1, created_at: '2026-07-24T06:11:44.000Z', content_hash: 'abcdef1234567890', is_current: 1 }],
  permissions: { publish: { canRepublish: true, canRestore: true } },
});
assert.match(publish, /2026\.07\.24\. 08:11:44 \(Europe\/Budapest\)/);
assert.doesNotMatch(publish, /2026-07-24T06:11:44\.000Z/);

const schema = await readFile(new URL('../src/lib/db/schema.sql', import.meta.url), 'utf8');
assert.match(schema, /site_admin_audit_log[\s\S]*created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP/);
assert.match(schema, /site_admin_users[\s\S]*last_login_at TIMESTAMP NULL/);
assert.match(schema, /site_publish_snapshots[\s\S]*created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP/);

console.log('Admin Europe/Budapest timezone smoke passed.');
