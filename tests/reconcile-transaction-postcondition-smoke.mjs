import assert from 'node:assert/strict';
import { reconcileHomeMiddleCanonicalTransaction, RECONCILE_HOME_MIDDLE_KEYS } from '../scripts/reconcile-home-middle-canonical.mjs';
const clone = (v) => JSON.parse(JSON.stringify(v));
const page = { id: 1, route: '/', type: 'home', status: 'published' };
const stamp = (id) => ({ created_at: `2026-01-01 00:00:${String(id).padStart(2,'0')}`, updated_at: `2026-01-02 00:00:${String(id).padStart(2,'0')}` });
function baseBlocks() { return [
  { id: 1, page_id: 1, block_key: 'home:hero-meta', type: 'hero-meta', title: 'Hero', body: '', items: '[]', sort_order: 0, status: 'published', ...stamp(1) },
  ...RECONCILE_HOME_MIDDLE_KEYS.map((key, index) => ({ id: 10 + index, page_id: 1, block_key: key, type: 'cards', title: key, body: 'B', items: key === 'home:solutions' ? JSON.stringify([{ version: 2, cards: [{ title: 'Canonical card', target_type: 'legacy', href: '/canonical/' }], action: { enabled: true, label: 'Összes megoldás', target_type: 'page', target_page_id: 2 } }]) : '[]', sort_order: 10 + index, status: 'published', ...stamp(10 + index) })),
  { id: 30, page_id: 1, block_key: 'manual:solutions', type: 'cards', title: 'Megoldásaink', body: 'B', items: JSON.stringify([{ version: 2, cards: [{ title: 'A', target_type: 'legacy', href: '/a/' }] }]), sort_order: 100, status: 'published', ...stamp(30) },
  { id: 40, page_id: 1, block_key: '/:cta:4', type: 'cta', title: 'CTA', body: '', items: '[{"ctaMode":"global"}]', sort_order: 900, status: 'published', ...stamp(40) },
]; }
function touch(row) { row.updated_at = `2026-02-02 00:00:${row.id}`; }
function connWith({ executeFault, mutateFresh, touchUpdated = true } = {}) { const state = { blocks: baseBlocks(), commits: 0, rollbacks: 0, executes: 0, queryCount: 0 }; let snap = null; return { state, async beginTransaction(){ snap = clone(state.blocks); }, async commit(){ state.commits++; snap = null; }, async rollback(){ state.rollbacks++; if (snap) state.blocks = clone(snap); }, async query(sql){ state.queryCount++; if (sql.includes('site_pages')) return [[page]]; if (sql.includes('site_content_blocks')) { if (mutateFresh && state.queryCount > 2) mutateFresh(state.blocks); return [state.blocks]; } throw new Error(sql); }, async execute(sql, params){ state.executes++; if (executeFault?.(state.executes, sql, params)) return [{ affectedRows: 0 }]; if (sql.includes('SET items=')) { const row = state.blocks.find((b) => b.id === params[1]); row.items = params[0]; if (touchUpdated) touch(row); return [{ affectedRows: 1 }]; } if (sql.includes('SET status=')) { const row = state.blocks.find((b) => b.id === params[1] && b.block_key === params[3]); row.status = params[0]; if (touchUpdated) touch(row); return [{ affectedRows: 1 }]; } throw new Error(sql); } }; }
let c = connWith(); await reconcileHomeMiddleCanonicalTransaction(c, { apply: true });
assert.equal(c.state.commits, 1);
assert.equal(c.state.blocks.filter((b) => RECONCILE_HOME_MIDDLE_KEYS.includes(b.block_key)).every((b) => b.status === 'archived' && b.updated_at.startsWith('2026-02-02')), true);
const copiedV2Action = JSON.parse(c.state.blocks.find((b) => b.id === 30).items)[0].action;
assert.equal(copiedV2Action.label, 'Összes megoldás');
assert.equal(copiedV2Action.target_page_id, 2);
assert(c.state.blocks.find((b) => b.id === 30).updated_at.startsWith('2026-02-02'));
const second = connWith(); second.state.blocks = clone(c.state.blocks); assert.equal((await reconcileHomeMiddleCanonicalTransaction(second, { apply: true })).noOp, true);

function setSolutionsItems(conn, items) { conn.state.blocks.find((b) => b.block_key === 'home:solutions').items = JSON.stringify(items); }
function withoutManualAction(conn) { conn.state.blocks.find((b) => b.id === 30).items = JSON.stringify([{ version: 2, cards: [{ title: 'A', target_type: 'legacy', href: '/a/' }] }]); }

const legacy = connWith();
setSolutionsItems(legacy, [{ kind: 'section-action', target_type: 'page', target_page_id: 2, title_override: 'Összes megoldás' }]);
await reconcileHomeMiddleCanonicalTransaction(legacy, { apply: true });
assert.equal(JSON.parse(legacy.state.blocks.find((b) => b.id === 30).items)[0].action.target_page_id, 2);

for (const { name, items, message } of [
  { name: 'disabled V2', items: [{ version: 2, cards: [], action: { enabled: false, label: 'Összes megoldás', target_type: 'page', target_page_id: 2 } }], message: /cards V2 action hiányzik vagy tiltott/ },
  { name: 'multiple flat actions', items: [{ kind: 'section-action', target_type: 'page', target_page_id: 2, title_override: 'Első' }, { kind: 'section-action', target_type: 'page', target_page_id: 3, title_override: 'Második' }], message: /Több legacy flat section-action/ },
  { name: 'V2 flat conflict', items: [{ version: 2, cards: [], action: { label: 'Összes megoldás', target_type: 'page', target_page_id: 2 } }, { kind: 'section-action', target_type: 'page', target_page_id: 3, title_override: 'Más' }], message: /konfliktusos/ },
]) {
  const bad = connWith();
  setSolutionsItems(bad, items);
  withoutManualAction(bad);
  const before = clone(bad.state.blocks);
  await assert.rejects(() => reconcileHomeMiddleCanonicalTransaction(bad, { apply: true }), message, name);
  assert.equal(bad.state.rollbacks, 1, name);
  assert.deepEqual(bad.state.blocks, before, name);
}

const sameBoth = connWith();
setSolutionsItems(sameBoth, [{ version: 2, cards: [], action: { label: 'Összes megoldás', target_type: 'page', target_page_id: 2 } }, { kind: 'section-action', target_type: 'page', target_page_id: 2, title_override: 'Összes megoldás' }]);
const samePlan = await reconcileHomeMiddleCanonicalTransaction(sameBoth, { apply: true });
assert.equal(samePlan.sourceAction.format, 'cards-v2');
assert.equal(JSON.parse(sameBoth.state.blocks.find((b) => b.id === 30).items)[0].action.target_page_id, 2);

for (const options of [
  { executeFault: (n, sql) => sql.includes('SET status=') && n === 3, message: /affectedRows/ },
  { executeFault: (n, sql) => sql.includes('SET items='), message: /affectedRows/ },
  { mutateFresh: (rows) => { rows.find((b) => b.block_key === 'manual:other').updated_at = '2027-01-01'; }, addOther: true, message: /nem target rekord/ },
  { mutateFresh: (rows) => { rows.find((b) => b.block_key === 'home:hero-meta').updated_at = '2027-01-01'; }, message: /nem target rekord/ },
  { mutateFresh: (rows) => { rows.find((b) => b.block_key === '/:cta:4').updated_at = '2027-01-01'; }, message: /nem target rekord/ },
  { mutateFresh: (rows) => { rows.find((b) => b.block_key === 'home:intro').created_at = '2027-01-01'; }, message: /target rekordnál nem csak status\/updated_at/ },
  { mutateFresh: (rows) => { rows.find((b) => b.block_key === 'home:intro').title = 'Changed'; }, message: /target rekordnál nem csak status\/updated_at/ },
  { mutateFresh: (rows) => { rows.find((b) => b.id === 30).status = 'draft'; }, message: /manual Megoldásaink/ },
  { mutateFresh: (rows) => { rows.find((b) => b.id === 30).title = 'Más'; }, message: /manual Megoldásaink/ },
  { mutateFresh: (rows) => rows.push({ id: 999, page_id: 1, block_key: 'manual:new', type: 'text', status: 'published' }), message: /rekordszám/ },
]) { const bad = connWith(options); if (options.addOther) bad.state.blocks.push({ id: 50, page_id: 1, block_key: 'manual:other', type: 'text', title: 'Other', body: '', items: '[]', sort_order: 120, status: 'published', ...stamp(50) }); const before = clone(bad.state.blocks); await assert.rejects(() => reconcileHomeMiddleCanonicalTransaction(bad, { apply: true }), options.message); assert.equal(bad.state.rollbacks, 1); assert.deepEqual(bad.state.blocks, before); }
console.log('reconcile transaction postcondition smoke ok');
