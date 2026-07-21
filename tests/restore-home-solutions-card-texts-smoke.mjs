import assert from 'node:assert/strict';
import { RESTORE_TEXTS, parseArgs, planRestore, runRestore } from '../scripts/restore-home-solutions-card-texts.mjs';

const titles = Object.keys(RESTORE_TEXTS);
const rootHome = { id: 1, route: '/', type: 'home' };
function makeItems() { return [{ version: 2, variant: 'default', cards: titles.map((title, index) => ({ title, text_override: index === 0 ? '' : RESTORE_TEXTS[title], target_type: index === 1 ? 'page' : 'legacy', target_page_id: index === 1 ? 31 : undefined, href: index === 1 ? undefined : `/x-${index}/`, linkLabel: 'Részletek', badge: String(index + 1) })), action: { label: 'Összes megoldás', target_type: 'page', target_page_id: 30 } }]; }
function makeBlock(overrides = {}) { return { id: 140, page_id: 1, block_key: 'home:solutions', type: 'cards', items: JSON.stringify(makeItems()), ...overrides }; }
const targetSnapshot = (items) => items[0].cards.map((card) => ({ target_type: card.target_type, target_page_id: card.target_page_id, href: card.href, linkLabel: card.linkLabel, badge: card.badge, action: items[0].action }));
class FakeDb {
  constructor({ page = rootHome, block = makeBlock(), affectedRows = 1 } = {}) { this.page = structuredClone(page); this.block = structuredClone(block); this.affectedRows = affectedRows; this.commits = 0; this.rollbacks = 0; this.updates = 0; this.pageQueries = 0; this.blockQueries = 0; }
  async beginTransaction() { this.begun = true; }
  async commit() { this.commits += 1; }
  async rollback() { this.rollbacks += 1; }
  async query(sql, params = []) {
    if (sql.includes('FROM site_pages')) { this.pageQueries += 1; return [[structuredClone(this.page)].filter(Boolean)]; }
    if (sql.includes('FROM site_content_blocks')) { this.blockQueries += 1; const [id, pageId, blockKey, type] = params; const matches = this.block && Number(this.block.id) === Number(id) && Number(this.block.page_id) === Number(pageId) && this.block.block_key === blockKey && this.block.type === type; return [matches ? [structuredClone(this.block)] : []]; }
    throw new Error(`Unexpected query: ${sql}`);
  }
  async execute(sql, params) { this.updates += 1; if (this.affectedRows === 1) this.block.items = params[0]; return [{ affectedRows: this.affectedRows }]; }
}
assert.deepEqual(parseArgs(['--status']), { mode: 'status', apply: false });
assert.deepEqual(parseArgs(['--dry-run']), { mode: 'dry-run', apply: false });
assert.deepEqual(parseArgs(['--apply', '--yes']), { mode: 'apply', apply: true });
const plan = planRestore(makeBlock(), rootHome);
assert.equal(plan.changes, 1);
assert.equal(plan.nextItems[0].cards[0].text_override, RESTORE_TEXTS[titles[0]]);
assert.deepEqual(targetSnapshot(plan.nextItems), targetSnapshot(makeItems()));
const canonicalTextItems = makeItems();
canonicalTextItems[0].cards[0] = { ...canonicalTextItems[0].cards[0], text_override: '', text: 'Már meglévő canonical szöveg' };
const canonicalTextPlan = planRestore(makeBlock({ items: JSON.stringify(canonicalTextItems) }), rootHome);
assert.equal(canonicalTextPlan.changes, 0);
assert.equal(canonicalTextPlan.noOp, true);
const statusDb = new FakeDb();
assert.deepEqual(await runRestore(statusDb, { apply: false, mode: 'status' }), { ok: true, mode: 'status', changes: 1, noOp: false, blockId: 140, pageId: 1, titles });
assert.equal(statusDb.updates, 0);
assert.equal(statusDb.rollbacks, 1);
const dryDb = new FakeDb();
assert.deepEqual(await runRestore(dryDb, { apply: false, mode: 'dry-run' }), { ok: true, mode: 'dry-run', changes: 1, noOp: false, blockId: 140, pageId: 1, titles });
assert.equal(dryDb.updates, 0);
assert.equal(dryDb.rollbacks, 1);
const applyDb = new FakeDb();
assert.deepEqual(await runRestore(applyDb, { apply: true, mode: 'apply' }), { ok: true, mode: 'apply', changes: 1, noOp: false, blockId: 140, pageId: 1, titles });
assert.equal(applyDb.updates, 1);
assert.equal(applyDb.commits, 1);
assert.deepEqual(targetSnapshot(JSON.parse(applyDb.block.items)), targetSnapshot(makeItems()));
assert.deepEqual(await runRestore(applyDb, { apply: true, mode: 'apply' }), { ok: true, mode: 'apply', changes: 0, noOp: true, blockId: 140, pageId: 1, titles });
assert.equal(applyDb.updates, 1);
assert.throws(() => planRestore(makeBlock({ id: 141 }), rootHome), /outside block id=140/);
assert.throws(() => planRestore(makeBlock({ block_key: 'other' }), rootHome), /outside block id=140/);
await assert.rejects(() => runRestore(new FakeDb({ page: { id: 1, route: '/not-root/', type: 'home' } }), { apply: false, mode: 'status' }), /root home page/);
const affectedDb = new FakeDb({ affectedRows: 0 });
await assert.rejects(() => runRestore(affectedDb, { apply: true, mode: 'apply' }), /affectedRows=1/);
assert.equal(affectedDb.rollbacks, 1);
assert.throws(() => planRestore({ ...makeBlock(), items: JSON.stringify([{ version: 2, cards: [{ title: titles[0] }, { title: titles[0] }, { title: titles[2] }] }]) }, rootHome), /Expected exactly three|Duplicate/);
console.log('Restore home solutions card texts smoke passed.');
