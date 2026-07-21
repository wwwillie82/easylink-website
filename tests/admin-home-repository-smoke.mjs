import assert from 'node:assert/strict';
import { createAdminRepository } from '../src/lib/admin/repository.mjs';
import { computeGenericHomeEditorRevision, homeEditableBlocks } from '../src/lib/admin/home-validation.mjs';
const clone = (o) => JSON.parse(JSON.stringify(o));

const revisionPage = { id: 1, route: '/', type: 'home', title: 'Home', updated_at: 'p1' };
const revisionBlocks = [
  { id: 1, page_id: 1, block_key: 'home:hero-meta', type: 'hero-meta', title: 'Meta', body: '', items: '[]', sort_order: 0, status: 'published', updated_at: 'm1' },
  { id: 2, page_id: 1, block_key: '/:cta:4', type: 'cta', title: 'Page CTA', body: '', items: '[{"ctaMode":"global"}]', sort_order: 900, status: 'published', updated_at: 'c1' },
  { id: 3, page_id: 1, block_key: 'manual:inline-cta', type: 'cta', title: 'Inline CTA', body: 'Inline body', items: '[{"label":"Start","url":"/start/"}]', sort_order: 40, status: 'published', updated_at: 'i1' },
];
assert.deepEqual(homeEditableBlocks(revisionBlocks).map((b)=>b.block_key), ['manual:inline-cta']);
const inlineBaseRevision = computeGenericHomeEditorRevision(revisionPage, revisionBlocks);
assert.notEqual(computeGenericHomeEditorRevision(revisionPage, revisionBlocks.map((b)=>b.id===3?{...b,title:'Inline CTA changed'}:b)), inlineBaseRevision);
assert.notEqual(computeGenericHomeEditorRevision(revisionPage, revisionBlocks.map((b)=>b.id===3?{...b,updated_at:'i2'}:b)), inlineBaseRevision);
assert.equal(computeGenericHomeEditorRevision(revisionPage, revisionBlocks.map((b)=>b.id===2?{...b,title:'Page CTA changed',updated_at:'c2'}:b)), inlineBaseRevision);

function makePool({ failBlock = false } = {}) {
  const state = { commit: 0, rollback: 0, pages: [{ id: 1, route: '/', slug: 'home', type: 'home', title: 'Home', status: 'published', sort_order: 0, hero_eyebrow: 'Ey', hero_title: 'Hero', hero_description: 'Desc', hero_asset: '/a.webp' }, { id: 2, route: '/target/', slug: 'target', type: 'content_page', title: 'Target', status: 'published', sort_order: 2 }], blocks: [
    { id: 1, page_id: 1, block_key: 'home:hero-meta', type: 'hero-meta', title: 'Meta', body: '', items: '[]', sort_order: 0, status: 'published' },
    { id: 2, page_id: 1, block_key: 'home:intro', type: 'split-text', title: 'Intro', body: 'Body', items: '[{"version":1,"heading":"Heading"}]', sort_order: 10, status: 'published' },
    { id: 3, page_id: 1, block_key: '/:cta:4', type: 'cta', title: 'CTA', body: '', items: '[{"ctaMode":"global"}]', sort_order: 900, status: 'published' },
    { id: 4, page_id: 1, block_key: 'manual:inline-cta', type: 'cta', title: 'Inline CTA', body: 'Inline body', items: '[{"label":"Start","url":"/start/"}]', sort_order: 30, status: 'published' },
    { id: 9, page_id: 99, block_key: 'foreign', type: 'text', title: 'Foreign', body: '', items: '[]', sort_order: 1, status: 'published' },
  ] };
  let snap = null;
  const api = { state, async query(sql, params = []) {
    if (sql.includes('site_settings')) return [[], null];
    if (sql.includes('FROM site_pages WHERE id=?')) return [[state.pages.find((p) => p.id === Number(params[0]))].filter(Boolean), null];
    if (sql.includes('FROM site_content_blocks WHERE page_id=?')) return [state.blocks.filter((b) => b.page_id === Number(params[0])), null];
    if (sql.includes('SELECT id, route, slug, type, title, status, sort_order FROM site_pages')) return [state.pages, null];
    if (sql.includes('FROM site_pages WHERE id IN')) return [state.pages.filter((p) => params.includes(p.id)), null];
    return [[], null];
  }, async execute(sql, params = []) {
    if (sql.startsWith('UPDATE site_pages')) { Object.assign(state.pages[0], { title: params[3], hero_title: params[7] }); return [{ affectedRows: 1 }, null]; }
    if (sql.startsWith('UPDATE site_content_blocks SET type=')) { if (failBlock) throw new Error('forced block'); const b = state.blocks.find((x) => x.id === Number(params[6]) && x.page_id === Number(params[7])); Object.assign(b, { type: params[0], title: params[1], body: params[2], items: params[3], sort_order: params[4], status: params[5] }); return [{ affectedRows: b ? 1 : 0 }, null]; }
    if (sql.startsWith('UPDATE site_content_blocks SET status=')) { const b = state.blocks.find((x) => x.id === Number(params[1]) && x.page_id === Number(params[2])); if (b) b.status = params[0]; return [{ affectedRows: b ? 1 : 0 }, null]; }
    if (sql.startsWith('INSERT INTO site_content_blocks')) { const row = { id: 10, page_id: params[0], block_key: params[1], type: params[2], title: params[3], body: params[4], items: params[5], sort_order: params[6], status: params[7] }; state.blocks.push(row); return [{ insertId: row.id, affectedRows: 1 }, null]; }
    return [{ affectedRows: 1 }, null];
  }, async getConnection() { return { ...api, async beginTransaction() { snap = clone({ pages: state.pages, blocks: state.blocks }); }, async commit() { state.commit += 1; snap = null; }, async rollback() { state.rollback += 1; if (snap) { state.pages = clone(snap.pages); state.blocks = clone(snap.blocks); } }, release() {} }; } };
  return api;
}
const pool = makePool();
const repo = createAdminRepository(pool);
const before = await repo.page(1);
const payload = { editor_revision: before.homeEditor.editor_revision, page: { title: 'Home 2', hero_title: 'Hero 2' }, hero_meta: {}, blocks: [
  { id: 2, type: 'split-text', title: 'Intro 2', body: 'Body 2', items: [{ version: 1, heading: 'Heading 2' }], sort_order: 10, status: 'published' },
  { client_key: 'new-1', type: 'text', title: 'New', body: 'Body', items: [], sort_order: 20, status: 'published' },
  { id: 4, type: 'cta', title: 'Inline CTA 2', body: 'Inline body 2', items: [{ eyebrow: 'Inline', label: 'Start', url: '/start/' }], sort_order: 30, status: 'published' },
], archived_block_ids: [] };
const saved = await repo.updateHomePageAtomic(1, payload);
assert.equal(pool.state.commit, 1);
assert.equal(saved.editor_revision.length, 64);
assert.equal(pool.state.blocks.find((b) => b.id === 2).title, 'Intro 2');
assert.ok(pool.state.blocks.find((b) => b.block_key.startsWith('manual:')));
assert.ok(saved.blocks.some((b) => b.block_key === 'manual:inline-cta' && b.type === 'cta'));
assert.equal(pool.state.blocks.find((b) => b.id === 4).title, 'Inline CTA 2');
await assert.rejects(() => repo.updateHomePageAtomic(1, { ...payload, editor_revision: 'stale' }), /időközben/);
const foreign = await repo.page(1);
await assert.rejects(() => repo.updateHomePageAtomic(1, { ...payload, editor_revision: foreign.homeEditor.editor_revision, blocks: [{ id: 9, type: 'text', title: 'Bad', body: '', items: [], sort_order: 30, status: 'published' }] }), (error) => Boolean(error.details?.fieldErrors?.['blocks.9.id']));
const failPool = makePool({ failBlock: true });
const failRepo = createAdminRepository(failPool);
const failBefore = await failRepo.page(1);
await assert.rejects(() => failRepo.updateHomePageAtomic(1, { ...payload, editor_revision: failBefore.homeEditor.editor_revision }), /forced block/);
assert.equal(failPool.state.rollback, 1);
console.log('Admin home repository smoke passed: generic aggregate transaction, create, update, stale revision and rollback.');
