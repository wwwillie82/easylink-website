import assert from 'node:assert/strict';
import { migrate, ensureAdminAuthFoundation, adminAuthBackfillMarker } from '../scripts/db-migrate.mjs';
import { fullAdminPermissionMatrix, permissionRowsForInsert } from '../src/lib/admin/permissions.mjs';
const sql = await migrate({ dryRun: true });
assert.match(sql, /CREATE TABLE IF NOT EXISTS site_admin_user_scopes/);
assert.match(sql, /CREATE TABLE IF NOT EXISTS site_admin_sessions/);
assert.match(sql, /CREATE TABLE IF NOT EXISTS site_admin_migration_markers/);
assert.doesNotMatch(sql, /WHERE role/i);
const inserted = [], markers = new Set();
function conn() { return { async beginTransaction(){}, async commit(){}, async rollback(){}, release(){}, async query(sql, params){ const text=String(sql); if(text.startsWith('SELECT marker_code')) return [[...markers].filter((m)=>m===params[0]).map((m)=>({marker_code:m})), null]; if(text.startsWith('SELECT id FROM site_admin_users')) return [[{id:1},{id:2}], null]; throw new Error(text); }, async execute(sql, params){ const text=String(sql); if(text.startsWith('INSERT IGNORE INTO site_admin_user_scopes')) { inserted.push(params); return [{affectedRows:1}, null]; } if(text.startsWith('INSERT INTO site_admin_migration_markers')) { markers.add(params[0]); return [{affectedRows:1}, null]; } throw new Error(text); } }; }
const pool = { async query(sql, params){ return conn().query(sql, params); }, async getConnection(){ return conn(); } };
await ensureAdminAuthFoundation(pool);
assert.equal(markers.has(adminAuthBackfillMarker), true);
assert.equal(inserted.length, permissionRowsForInsert(fullAdminPermissionMatrix).length * 2);
inserted.length = 0;
await ensureAdminAuthFoundation(pool);
assert.equal(inserted.length, 0, 'marker prevents restoring deleted scopes on rerun');
console.log('Admin permission migration smoke passed.');
