import assert from 'node:assert/strict';
import http from 'node:http';
import vm from 'node:vm';
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
import { dirtyStateJs, publishMessageJs } from '../src/lib/admin/render/client-js.mjs';

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

const pageContext = { id: 2, title: 'Megoldásaink', route: '/megoldasaink/' };
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
}, pageContext);
assert.equal(enriched.target_id, 3);
assert.equal(enriched.target_label, 'Listák');
assert.deepEqual(enriched.metadata_json, {
  method: 'POST',
  pathname: '/api/admin/blocks',
  errorCode: 'INVALID_BLOCK_JSON',
  blockId: 3,
  pageId: 2,
  blockType: 'feature-list',
  pageTitle: 'Megoldásaink',
  pageRoute: '/megoldasaink/',
});

const auditRows = [];
const capturedPayloads = [];
const runtimeRepo = {
  async upsertBlock(payload) {
    capturedPayloads.push(payload);
    throw Object.assign(new Error('Save failed'), { code: 'INVALID_BLOCK_JSON' });
  },
  async page(id) {
    return { page: { id: Number(id), title: 'Megoldásaink', route: '/megoldasaink/' } };
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
assert.equal(auditRows[0].metadata_json.pageTitle, 'Megoldásaink');
assert.equal(auditRows[0].metadata_json.pageRoute, '/megoldasaink/');
assert.equal(auditRows[0].metadata_json.blockType, 'feature-list');
assert.equal('items' in auditRows[0].metadata_json, false);

function fakeNode(tag = 'div') {
  const node = {
    tagName: String(tag).toUpperCase(),
    children: [],
    attributes: {},
    dataset: {},
    style: {},
    className: '',
    parentNode: null,
    _text: '',
    setAttribute(name, value = '') {
      this.attributes[name] = String(value);
      if (name === 'data-dirty-message') this.dataset.dirtyMessage = '';
    },
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    querySelector(selector) {
      if (selector === 'p') return this.children.find((child) => child.tagName === 'P') || null;
      if (selector === '[data-dirty-message]') return this.children.find((child) => 'dirtyMessage' in child.dataset) || null;
      return null;
    },
    remove() {
      if (!this.parentNode) return;
      this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
      this.parentNode = null;
    },
  };
  Object.defineProperty(node, 'textContent', {
    get() { return this.children.length ? this.children.map((child) => child.textContent).join('') : this._text; },
    set(value) { this._text = String(value); this.children = []; },
  });
  return node;
}

let localStatus = null;
let serialized = 'title=Megoldás lista';
const listeners = {};
const saveButton = { disabled: false };
const heading = { insertAdjacentElement(_position, element) { localStatus = element; } };
const form = {
  matches(selector) { return selector === '[data-block-form]'; },
  querySelector(selector) {
    if (selector === 'button[type="submit"]') return saveButton;
    if (selector === '[data-form-save-status]') return localStatus;
    if (selector === 'h3') return heading;
    return null;
  },
  addEventListener(type, listener) { listeners[type] = listener; },
  prepend(element) { localStatus = element; },
};
const globalStatus = fakeNode('div');
const sandbox = {
  window: {},
  document: {
    getElementById(id) { return id === 'msg' ? globalStatus : null; },
    createElement(tag) { return fakeNode(tag); },
  },
  URLSearchParams,
  FormData: class {},
};
vm.runInNewContext(`${dirtyStateJs};${publishMessageJs};this.runSetup=setupDirtyForm;this.runMsg=msg;`, sandbox);
const dirty = sandbox.runSetup(form, () => serialized);
assert.equal(saveButton.disabled, true);
serialized = 'title=Listák';
listeners.input();
assert.equal(saveButton.disabled, false);
assert.equal(localStatus.querySelector('[data-dirty-message]').textContent, 'Nem mentett módosítások.');
assert.match(localStatus.querySelector('[data-dirty-message]').className, /err/);
dirty.markSaving();
assert.equal(localStatus.textContent, 'Mentés folyamatban…');
dirty.markSaved();
assert.equal(localStatus.textContent, 'Mentés sikeres.');
assert.match(localStatus.querySelector('p').className, /ok/);
sandbox.runMsg('Tartalom mentve, élesítés sikeres.', true);
assert.equal(localStatus.textContent, 'Tartalom mentve, élesítés sikeres.');
assert.match(localStatus.querySelector('p').className, /ok/);
assert.equal(globalStatus.textContent, '');

const runtimeEntry = await readFile(new URL('../scripts/admin-server.mjs', import.meta.url), 'utf8');
assert.match(runtimeEntry, /server-block-save-audit-hardening\.mjs/);

console.log('Admin block save, feedback and audit page context regression smoke passed.');
