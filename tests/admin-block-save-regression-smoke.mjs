import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import {
  blockPayloadForBaseRepository,
  createAdminRepository,
} from '../src/lib/admin/repository-audit-filter-hardening.mjs';
import {
  createAdminServer,
  enrichBlockAuditRow,
} from '../src/lib/admin/server-block-save-audit-hardening.mjs';

const normalized = blockPayloadForBaseRepository({ id: 3, items: ['penzugy-szamlazas', 'hr-munkaugy'] });
assert.equal(normalized.items, '["penzugy-szamlazas","hr-munkaugy"]');
assert.equal(blockPayloadForBaseRepository({ items: '["a"]' }).items, '["a"]');

const existingBlock = {
  id: 3,
  page_id: 2,
  block_key: 'manual:solutions-list',
  type: 'feature-list',
  title: 'Megoldás lista',
  body: '',
  items: '["penzugy-szamlazas","hr-munkaugy"]',
  presentation: null,
  sort_order: 20,
  status: 'published',
};
const updates = [];
const pool = {
  async query(sql) {
    if (sql.includes('SELECT * FROM site_content_blocks WHERE id=? LIMIT 1')) return [[existingBlock]];
    throw new Error(`Unexpected query: ${sql}`);
  },
  async execute(sql, params) {
    if (sql.startsWith('UPDATE site_content_blocks SET type=')) {
      updates.push({ sql, params });
      return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected execute: ${sql}`);
  },
};

const repository = createAdminRepository(pool);
const saved = await repository.upsertBlock({
  ...existingBlock,
  title: 'Listák',
  items: ['penzugy-szamlazas', 'hr-munkaugy'],
});
assert.deepEqual(saved, { id: 3 });
assert.equal(updates.length, 1);
assert.equal(updates[0].params[1], 'Listák');
assert.deepEqual(JSON.parse(updates[0].params[3]), ['penzugy-szamlazas', 'hr-munkaugy']);

await assert.rejects(
  () => repository.upsertBlock({ ...existingBlock, items: 'not-json' }),
  (error) => error?.code === 'INVALID_BLOCK_JSON',
);

const enriched = enrichBlockAuditRow({
  event_code: 'admin_block_updated',
  target_type: 'block',
  target_id: null,
  target_label: null,
  metadata_json: { method: 'POST', pathname: '/api/admin/blocks', errorCode: 'INVALID_BLOCK_JSON' },
}, {
  id: 3,
  page_id: 2,
  type: 'feature-list',
  title: 'Listák',
});
assert.equal(enriched.target_id, 3);
assert.equal(enriched.target_label, 'Listák');
assert.deepEqual(enriched.metadata_json, {
  method: 'POST',
  pathname: '/api/admin/blocks',
  errorCode: 'INVALID_BLOCK_JSON',
  blockId: 3,
  pageId: 2,
  blockType: 'feature-list',
});

const auditRows = [];
const capturedPayloads = [];
const runtimeRepo = {
  async upsertBlock(payload) {
    capturedPayloads.push(payload);
    throw Object.assign(new Error('Save failed'), { code: 'INVALID_BLOCK_JSON' });
  },
  async insertAuditEvent(row) {
    auditRows.push(row);
  },
};
function fakeBaseServerFactory({ repo }) {
  return http.createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const payload = JSON.parse(raw || '{}');
    try { await repo.upsertBlock(payload); } catch {}
    await repo.insertAuditEvent({
      event_code: 'admin_block_updated',
      target_type: 'block',
      target_id: null,
      target_label: null,
      result: 'failure',
      metadata_json: { method: 'POST', pathname: '/api/admin/blocks', errorCode: 'INVALID_BLOCK_JSON' },
    });
    res.statusCode = 500;
    res.end(JSON.stringify({ ok: false }));
  });
}

const server = createAdminServer({ repo: runtimeRepo, baseServerFactory: fakeBaseServerFactory });
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const { port } = server.address();
await fetch(`http://127.0.0.1:${port}/api/admin/blocks`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    id: 3,
    page_id: 2,
    type: 'feature-list',
    title: 'Listák',
    items: ['penzugy-szamlazas', 'hr-munkaugy'],
  }),
});
await new Promise((resolve) => server.close(resolve));

assert.equal(capturedPayloads.length, 1);
assert.equal(auditRows.length, 1);
assert.equal(auditRows[0].target_id, 3);
assert.equal(auditRows[0].target_label, 'Listák');
assert.equal(auditRows[0].metadata_json.pageId, 2);
assert.equal(auditRows[0].metadata_json.blockType, 'feature-list');
assert.equal('items' in auditRows[0].metadata_json, false);

const runtimeEntry = await readFile(new URL('../scripts/admin-server.mjs', import.meta.url), 'utf8');
assert.match(runtimeEntry, /server-block-save-audit-hardening\.mjs/);

console.log('Admin block save and audit context regression smoke passed.');
