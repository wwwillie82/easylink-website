import assert from 'node:assert/strict';
import { parseCli, runRestore, RESTORE_IDS, ARCHIVE_IDS, PROTECTED_CTA_ID, HERO_META_KEY } from '../scripts/restore-home-good-blocks.mjs';

assert.equal(parseCli(['--status']).action, 'status');
assert.equal(parseCli(['--dry-run']).action, 'dry-run');
assert.equal(parseCli(['--apply', '--yes']).action, 'apply');
assert.throws(() => parseCli(['--apply']), /requires --yes/);
assert.throws(() => parseCli(['--status', '--dry-run']), /Exactly one/);
assert.throws(() => parseCli(['--status', '--bogus']), /Unknown/);

const page = { id: 10, route: '/', type: 'home', title: 'Home' };
function makeRows() {
  return [
    ...ARCHIVE_IDS.map((id) => ({ id, page_id: 10, block_key: `old:${id}`, type: 'text', title: `Old ${id}`, body: '', items: '[]', sort_order: id, status: 'published', updated_at: 'pre' })),
    { id: PROTECTED_CTA_ID, page_id: 10, block_key: '/:cta:4', type: 'cta', title: 'CTA', body: 'CTA', items: '[{}]', sort_order: 900, status: 'published', updated_at: 'pre' },
    { id: 100, page_id: 10, block_key: HERO_META_KEY, type: 'hero-meta', title: 'Hero', body: '', items: '[]', sort_order: 0, status: 'published', updated_at: 'pre' },
    { id: 88, page_id: 10, block_key: 'manual:other', type: 'text', title: 'Other', body: '', items: '[]', sort_order: 88, status: 'archived', updated_at: 'pre' },
    { id: 139, page_id: 10, block_key: 'home:intro', type: 'split-text', title: 'Intro', body: '', items: '[]', sort_order: 100, status: 'archived', updated_at: 'pre' },
    { id: 140, page_id: 10, block_key: 'home:solutions', type: 'cards', title: 'Megoldásaink', body: '', items: '[]', sort_order: 110, status: 'archived', updated_at: 'pre' },
    { id: 141, page_id: 10, block_key: 'home:ai-assistant', type: 'ai-assistant-preview', title: 'AI', body: '', items: '[]', sort_order: 120, status: 'archived', updated_at: 'pre' },
    { id: 142, page_id: 10, block_key: 'home:integrations', type: 'integrations-strip', title: 'Integrációs adatáramlás', body: '', items: '[]', sort_order: 130, status: 'archived', updated_at: 'pre' },
    { id: 143, page_id: 10, block_key: 'home:audiences', type: 'cards', title: 'Kinek szól?', body: '', items: '[]', sort_order: 140, status: 'archived', updated_at: 'pre' },
  ].sort((a, b) => a.id - b.id);
}
function fakeConn({ affectedRows = 1, mutateAfterSelect = null } = {}) {
  const rows = makeRows();
  const tx = { begin: 0, commit: 0, rollback: 0, updates: 0 };
  return { rows, tx,
    async beginTransaction() { tx.begin++; }, async commit() { tx.commit++; }, async rollback() { tx.rollback++; },
    async query(sql) { if (sql.includes('site_pages')) return [[page]]; if (mutateAfterSelect && tx.updates) mutateAfterSelect(rows); return [rows.map((r) => ({ ...r }))]; },
    async execute(_sql, params) { tx.updates++; const [status, id] = params; const row = rows.find((r) => r.id === Number(id)); if (row) { row.status = status; row.updated_at = 'post'; } return [{ affectedRows }]; },
  };
}

let conn = fakeConn();
await runRestore(conn, 'apply');
assert.equal(conn.tx.commit, 1);
for (const id of RESTORE_IDS) assert.equal(conn.rows.find((r) => r.id === id).status, 'published');
for (const id of ARCHIVE_IDS) assert.equal(conn.rows.find((r) => r.id === id).status, 'archived');
assert.equal(conn.rows.find((r) => r.id === PROTECTED_CTA_ID).updated_at, 'pre');
assert.equal(conn.rows.find((r) => r.block_key === HERO_META_KEY).updated_at, 'pre');
assert.equal(conn.rows.find((r) => r.id === 88).updated_at, 'pre');

conn = fakeConn();
await runRestore(conn, 'dry-run');
assert.equal(conn.tx.rollback, 1);
assert.equal(conn.tx.updates, 0);
assert.equal(conn.rows.find((r) => r.id === 139).status, 'archived');

conn = fakeConn();
for (const row of conn.rows) if (RESTORE_IDS.includes(row.id)) row.status = 'published';
for (const row of conn.rows) if (ARCHIVE_IDS.includes(row.id)) row.status = 'archived';
await runRestore(conn, 'apply');
assert.equal(conn.tx.updates, 0);

await assert.rejects(() => runRestore(fakeConn({ affectedRows: 0 }), 'apply'), /affectedRows/);
conn = fakeConn({ mutateAfterSelect(rows) { rows.find((r) => r.id === 88).title = 'Changed'; } });
await assert.rejects(() => runRestore(conn, 'apply'), /unexpected change/);
assert.equal(conn.tx.rollback, 1);
console.log('Restore home good blocks smoke passed.');

conn = fakeConn();
conn.rows.find((r) => r.id === 88).status = 'published';
const originalConsoleError = console.error;
console.error = () => {};
try { await assert.rejects(() => runRestore(conn, 'apply'), /published middle IDs/); }
finally { console.error = originalConsoleError; }
assert.equal(conn.tx.updates, 0);
