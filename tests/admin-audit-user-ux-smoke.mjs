import assert from 'node:assert/strict';
import { createAdminRepository } from '../src/lib/admin/repository-audit-filter-hardening.mjs';
import { auditPanel } from '../src/lib/admin/render/audit.mjs';
import { usersHtml } from '../src/lib/admin/render/users.mjs';
import { layout } from '../src/lib/admin/render/layout.mjs';

const queries = [];
const pool = {
  async query(sql, params = []) {
    queries.push({ sql: String(sql), params: [...params] });
    if (String(sql).includes('COUNT(*)')) return [[{ total: 0 }]];
    return [[]];
  },
};
const repo = createAdminRepository(pool);
const result = await repo.listAuditEvents({ target_id: '47', request_id: 'abc123', limit: 50 });
assert.equal(result.pagination.limit, 50);
assert.match(queries[0].sql, /INSTR\(target_id, \?\) > 0/);
assert.match(queries[0].sql, /INSTR\(request_id, \?\) > 0/);
assert.deepEqual(queries[0].params, ['47', 'abc123']);
assert.deepEqual(queries[1].params, ['47', 'abc123', 50, 0]);

const auditHtml = auditPanel();
assert.match(auditHtml, /<select name="target_type">/);
assert.match(auditHtml, /Admin felhasználó/);
assert.match(auditHtml, /Menüpont/);
assert.match(auditHtml, /Tartalmi blokknál a Cél ID a blokk azonosítója/);
assert.match(auditHtml, /a külön Oldal oszlop mutatja a szülőoldalt/);
assert.match(auditHtml, /<th>Cél típusa<\/th><th>Cél ID<\/th><th>Cél neve<\/th><th>Oldal<\/th>/);
assert.match(auditHtml, /pageContextHtml\(a\)/);
assert.match(auditHtml, /m\.pageId/);
assert.match(auditHtml, /m\.pageTitle/);
assert.match(auditHtml, /m\.pageRoute/);
assert.match(auditHtml, /<td><code>'\+escHtml\(a\.target_id\|\|'—'\)/);
assert.match(auditHtml, /colspan="12"/);

const users = usersHtml({ permissions: { users: { canSave: true, canArchive: true } } });
assert.match(users, /Felhasználó szerkesztése \('/);
assert.match(users, /scrollIntoView\(\{behavior:'smooth',block:'start'\}\)/);
assert.match(users, /window\.scrollTo\(\{top:0,behavior:'smooth'\}\)/);
assert.match(users, /edit\(id,\{scroll:false\}\)/);

const shell = layout('<p>Tartalom</p>', {
  current: '/admin/pages',
  adminContext: {
    user: { id: 2, displayName: 'Wilfing András', email: 'wilfinga@gmail.com' },
    permissions: { pages: {} },
  },
});
assert.match(shell, /Bejelentkezve:/);
assert.match(shell, /Wilfing András/);
assert.match(shell, /admin-nav__account/);
assert.ok(shell.indexOf('Wilfing András') < shell.indexOf('Kilépés'));

console.log('Admin audit and users UX smoke passed.');
