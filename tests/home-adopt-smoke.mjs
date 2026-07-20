import assert from 'node:assert/strict';
import { HOME_HERO_META_KEY, HOME_LEGACY_CTA_KEY } from '../src/lib/content/home-blocks.mjs';
import { buildHomeCanonicalBlocks, diffHomeAdopt, runHomeAdopt } from '../scripts/home-content-adopt.mjs';

const clone = (v) => structuredClone(v);
const pages = [
  { id: 1, route: '/', type: 'home', slug: 'home', title: 'Home', status: 'published' },
  { id: 2, route: '/megoldasaink/', type: 'solutions_index', slug: 'megoldasaink', title: 'Megoldásaink', status: 'published' },
  { id: 3, route: '/megoldasaink/penzugy-szamlazas/', type: 'solution_detail', slug: 'penzugy-szamlazas', title: 'Pénzügy és számlázás', status: 'published' },
  { id: 4, route: '/megoldasaink/hr-munkaugy/', type: 'solution_detail', slug: 'hr-munkaugy', title: 'HR és Munkaügy', status: 'published' },
  { id: 5, route: '/megoldasaink/crm-ugyfelkezeles/', type: 'solution_detail', slug: 'crm-ugyfelkezeles', title: 'CRM és ügyfélkezelés', status: 'published' },
  { id: 21, route: '/kinek-szol/hotelek-szallashelyek/', type: 'audience_detail', slug: 'hotelek-szallashelyek', title: 'Hoteleknek és szálláshelyeknek', status: 'published' },
  { id: 22, route: '/kinek-szol/vendeglatohelyek/', type: 'audience_detail', slug: 'vendeglatohelyek', title: 'Vendéglátóhelyeknek', status: 'published' },
  { id: 23, route: '/kinek-szol/szolgaltato-vallalkozasok/', type: 'audience_detail', slug: 'szolgaltato-vallalkozasok', title: 'Szolgáltató vállalkozásoknak', status: 'published' },
];
function dbFixture({ failInsert = false } = {}) {
  const state = { pages: clone(pages), blocks: [{ id: 100, page_id: 1, block_key: HOME_LEGACY_CTA_KEY, type: 'cta', title: 'CTA', body: '', items: JSON.stringify([{ ctaMode: 'global' }]), sort_order: 900, status: 'published' }], snapshots: [], txRollbacks: 0, txCount: 0, writeCount: 0 };
  const adapter = {
    state,
    async listPages() { return state.pages; },
    async listBlocks(pageId) { return state.blocks.filter((b) => b.page_id === pageId); },
    async insertBlock(pageId, block) { state.writeCount += 1; if (failInsert) throw new Error('forced insert failure'); state.blocks.push({ id: state.blocks.length + 1, page_id: pageId, ...clone(block), items: JSON.stringify(block.items) }); },
    async createAuditSnapshot() { state.snapshots.push({ label: 'home-adopt-before:/' }); },
    async transaction(fn) { state.txCount += 1; const before = clone(state); try { return await fn(adapter); } catch (error) { Object.assign(state, before); state.txRollbacks += 1; throw error; } },
  };
  return adapter;
}

const generatedBlocks = await buildHomeCanonicalBlocks(pages);
for (const block of generatedBlocks.filter((b) => ['home:solutions','home:audiences'].includes(b.block_key))) {
  for (const item of block.items.filter((entry) => (entry.kind || 'card') === 'card')) {
    assert.equal(item.target_type, 'page');
    assert.ok(Number(item.target_page_id) > 0);
    assert.ok(String(item.text_override || '').trim().length > 0);
  }
}
assert.equal(generatedBlocks.find((b) => b.block_key === 'home:solutions').items.find((i) => i.kind === 'section-action').target_page_id, 2);
const dynamicSolutionsIndexPages = pages.map((p) => p.id === 2 ? { ...p, route: '/draft-megoldasaink/', status: 'draft' } : p).concat({ id: 20, route: '/uj-megoldasok/', type: 'solutions_index', slug: 'uj-megoldasok', title: 'Új megoldások', status: 'published' });
assert.equal((await buildHomeCanonicalBlocks(dynamicSolutionsIndexPages)).find((b) => b.block_key === 'home:solutions').items.find((i) => i.kind === 'section-action').target_page_id, 20);
await assert.rejects(() => buildHomeCanonicalBlocks(pages.map((p) => p.type === 'solutions_index' ? { ...p, status: 'draft' } : p)), /published solutions_index/);
await assert.rejects(() => buildHomeCanonicalBlocks(pages.filter((p) => p.type !== 'solutions_index')), /published solutions_index/);
await assert.rejects(() => buildHomeCanonicalBlocks([...pages, { id: 20, route: '/masik/', type: 'solutions_index', slug: 'masik', title: 'Másik', status: 'published' }]), /Ambiguous published solutions_index/);

let db = dbFixture();
let result = await runHomeAdopt(db, { apply: false });
assert.equal(result.dryRun, true);
assert.equal(db.state.blocks.length, 1);
assert.ok(result.actions.some((a) => a.action === 'protected-cta'));
assert.ok(result.actions.some((a) => a.action === 'insert' && a.target.block_key === HOME_HERO_META_KEY));
result = await runHomeAdopt(db, { apply: true });
assert.equal(result.ok, true);
assert.equal(db.state.snapshots.length, 1);
assert.equal(db.state.txCount, 1);
assert.equal(db.state.writeCount, 6);
assert.equal(db.state.blocks.filter((b) => b.block_key.startsWith('home:')).length, 6);
const blockCountAfterFirstApply = db.state.blocks.length;
result = await runHomeAdopt(db, { apply: true });
assert.equal(result.ok, true);
assert.equal(result.noOp, true);
assert.ok(result.actions.filter((a) => a.action === 'keep').length >= 6);
assert.equal(db.state.snapshots.length, 1);
assert.equal(db.state.blocks.length, blockCountAfterFirstApply);
assert.equal(db.state.txCount, 1);
assert.equal(db.state.writeCount, 6);
db = dbFixture();
db.state.blocks.push({ id: 200, page_id: 1, block_key: HOME_HERO_META_KEY, type: 'hero-meta', title: 'Edited', body: '', items: '[]', sort_order: 0, status: 'published' });
result = await runHomeAdopt(db, { apply: true });
assert.equal(result.ok, false);
assert.ok(result.actions.some((a) => a.action === 'conflict'));
db = dbFixture();
db.state.blocks.push({ id: 201, page_id: 1, block_key: HOME_HERO_META_KEY, type: 'hero-meta', title: 'Hidden', body: '', items: '[]', sort_order: 0, status: 'draft' });
result = await runHomeAdopt(db, { apply: true });
assert.equal(result.ok, false);
assert.ok(result.actions.some((a) => a.action === 'keep-hidden'));
db = dbFixture({ failInsert: true });
await assert.rejects(() => runHomeAdopt(db, { apply: true }), /forced insert failure/);
assert.equal(db.state.snapshots.length, 0);
assert.equal(db.state.txRollbacks, 1);
assert.equal(diffHomeAdopt({ homePage: pages[0], blocks: [{ id: 1, block_key: HOME_LEGACY_CTA_KEY, status: 'published' }], targets: [] })[0].action, 'protected-cta');
console.log('Home adopt smoke passed: dry-run/apply/idempotent/conflict/hidden/CTA/rollback/no publish.');
