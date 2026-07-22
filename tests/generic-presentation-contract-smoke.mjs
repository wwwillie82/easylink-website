import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { blockForm, serializeEditorItems } from '../src/lib/admin/render/blocks.mjs';
import { pageForm } from '../src/lib/admin/render/pages.mjs';
import { createAdminRepository } from '../src/lib/admin/repository.mjs';
import { blockContracts } from '../src/lib/content/block-registry.mjs';
import { normalizeBlockItemsByType } from '../src/lib/content/block-contracts.mjs';
import { inspect } from '../scripts/adopt-generic-public-presentation.mjs';

const schema = await readFile(new URL('../src/lib/db/schema.sql', import.meta.url), 'utf8');
assert.match(schema, /site_pages[\s\S]*presentation LONGTEXT NULL CHECK \(presentation IS NULL OR JSON_VALID\(presentation\)\)/);
assert.match(schema, /site_content_blocks[\s\S]*presentation LONGTEXT NULL CHECK \(presentation IS NULL OR JSON_VALID\(presentation\)\)/);
assert.ok(blockContracts.some((c) => c.type === 'related-links' && c.capabilities.cardTarget === true));

const pageHtml = pageForm({ page: { id: 2, route: '/x/', slug: 'x', type: 'content_page', title: 'X', status: 'draft', sort_order: 1, presentation: { heroVariant: 'detail' } }, blocks: [], defaultCta: {}, pageTargetPages: [], navigationUsages: [] });
assert.match(pageHtml, /name="presentation_hero_variant"/);
assert.match(pageHtml, /<option value="detail" selected>/);
const publicRepo = await readFile(new URL('../src/lib/db/repository.ts', import.meta.url), 'utf8');
assert.match(publicRepo, /presentation: parseJsonObject\(row\.presentation\) \?\? \{ heroVariant: 'listing' \}/);
assert.match(publicRepo, /presentation: parseJsonObject\(block\.presentation\)/);

const blockHtml = blockForm({ id: 1, page_id: 2, type: 'related-links', title: 'Kapcsolódó oldalak', body: '', items: [{ target_type: 'page', target_page_id: 3, title_override: 'A' }], status: 'draft', sort_order: 800 }, { pageTargetPages: [{ id: 3, title: 'P3', route: '/p3/', status: 'published' }, { id: 4, title: 'Draft', route: '/draft/', status: 'draft' }] });
assert.match(blockHtml, /data-related-links-editor/);
assert.match(blockHtml, /data-related-target-page/);
assert.doesNotMatch(blockHtml, /data-card-target-type|data-card-target-href|data-cards-action-editor/);
assert.doesNotMatch(blockHtml, /value="4"/);
const adminItems = serializeEditorItems({ type: 'related-links', rows: [{ target_page_id: '3', title_override: 'Override' }] });
assert.deepEqual(adminItems, [{ target_type: 'page', target_page_id: '3', title_override: 'Override' }]);

const runtimeJs = blockForm({ id: 2, page_id: 2, type: 'related-links', title: 'Kapcsolódó oldalak', body: '', items: [{ target_type: 'page', target_page_id: 3, title_override: 'A' }], status: 'draft', sort_order: 800 }, { pageTargetPages: [{ id: 3, title: 'P3', route: '/p3/', status: 'published' }] }) + '';
assert.match(blockHtml, /data-panel="related-links"/);
const clientJs = await readFile(new URL('../src/lib/admin/render/blocks.mjs', import.meta.url), 'utf8');
assert.match(clientJs, /key==='related-links'&&type==='related-links'/);
assert.doesNotMatch(clientJs, /if\(type==='cards'\|\|type==='related-links'\)\{rowData\.action=/);
assert.match(clientJs, /data-add-related-link/);
assert.match(clientJs, /data-remove-related-link/);
assert.match(clientJs, /data-move-related-link/);

assert.deepEqual(normalizeBlockItemsByType('related-links', [{ target_type: 'page', target_page_id: 3, title_override: 'Egyedi' }], { pages: [{ id: 3, status: 'published' }], requirePublishedTargets: true }), [{ target_type: 'page', target_page_id: 3, title_override: 'Egyedi' }]);
for (const bad of [[{ target_type: 'legacy', target_page_id: 3 }], [{ target_type: 'page' }], [{ target_type: 'page', target_page_id: 99 }], [{ target_type: 'page', target_page_id: 4 }]]) {
  assert.throws(() => normalizeBlockItemsByType('related-links', bad, { pages: [{ id: 4, status: 'draft' }], requirePublishedTargets: true }), /cél|publikus|található|Válassz/i);
}


const smokeSource = await readFile(new URL('../scripts/adopt-generic-public-presentation.mjs', import.meta.url), 'utf8');
for (const expected of ["[4, ['/megoldasaink/hr-munkaugy/", "[5, ['/megoldasaink/crm-ugyfelkezeles/", "[6, ['/megoldasaink/dokumentumkezeles-adminisztracio/", "[7, ['/megoldasaink/kontrolling/", "[11, ['/kinek-szol/vendeglatohelyek/", "[117,'golden:20:text:Demó alapján pontosítunk','text']"]) assert.ok(smokeSource.includes(expected), `Missing adopt DB contract literal: ${expected}`);
for (const forbidden of ['hr-'+'munkaido', 'crm-'+'ertekesites', 'kontrolling-'+'riportok', '/megoldasaink/'+'dokumentumkezeles/', '/kinek-szol/'+'vendeglatas/', '/arak/:'+ 'text:1']) assert.equal(smokeSource.includes(forbidden), false, `Forbidden stale DB contract literal remained: ${forbidden}`);

const pageRows = [[3, '/megoldasaink/penzugy-szamlazas/', 'solution_detail'], [4, '/megoldasaink/hr-munkaugy/', 'solution_detail'], [5, '/megoldasaink/crm-ugyfelkezeles/', 'solution_detail'], [6, '/megoldasaink/dokumentumkezeles-adminisztracio/', 'solution_detail'], [7, '/megoldasaink/kontrolling/', 'solution_detail'], [8, '/megoldasaink/ai-asszisztens/', 'solution_detail'], [10, '/kinek-szol/hotelek-szallashelyek/', 'audience_detail'], [11, '/kinek-szol/vendeglatohelyek/', 'audience_detail'], [12, '/kinek-szol/szolgaltato-vallalkozasok/', 'audience_detail'], [13, '/integraciok/', 'integrations'], [14, '/arak/', 'pricing'], [15, '/kapcsolat/', 'contact']].map(([id, route, type]) => ({ id, route, type, status: 'published', presentation: null }));
const blockRows = [{id:51,page_id:13,block_key:'/integraciok/:text:0',type:'text',status:'published',title:'t',body:'b',items:'[]',presentation:null},{id:52,page_id:13,block_key:'/integraciok/:cards:1',type:'cards',status:'published',title:'t',body:'b',items:'[]',presentation:null},{id:53,page_id:14,block_key:'/arak/:feature-list:0',type:'feature-list',status:'published',title:'t',body:'b',items:'[]',presentation:null},{id:117,page_id:14,block_key:'golden:20:text:Demó alapján pontosítunk',type:'text',status:'published',title:'t',body:'b',items:'[]',presentation:null},{id:55,page_id:15,block_key:'/kapcsolat/:cta:0',type:'cta',status:'published',title:'t',body:'b',items:'[]',presentation:null},{id:56,page_id:15,block_key:'/kapcsolat/:feature-list:1',type:'feature-list',status:'published',title:'t',body:'b',items:'[]',presentation:null}];
function fakeConn({ conflict = false } = {}) { return { async query(sql) { if (sql.includes('FROM site_pages')) return [pageRows, null]; if (sql.includes('WHERE id IN') && sql.includes('site_content_blocks')) return [blockRows, null]; if (sql.includes("LIKE 'generic-related-links:%'")) return [conflict ? [{ page_id:3, block_key:'generic-related-links:3', type:'related-links', status:'published', sort_order:800, items:'[]' }] : [], null]; return [[], null]; } }; }
const status = await inspect(fakeConn());
assert.equal(status.changes.filter((c)=>c.kind==='related').length, 9);
await assert.rejects(() => inspect(fakeConn({ conflict: true })), /Conflicting existing related-links/);

function fakePoolForPageUpdate() {
  const executed = [];
  const conn = {
    executed,
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async query(sql, params) {
      if (sql.includes('FROM site_pages WHERE id=?')) return [[{ id: 3, route: '/megoldasaink/penzugy-szamlazas/', slug: 'penzugy-szamlazas', type: 'solution_detail', title: 'Pénzügy', seo_title: 'SEO', seo_description: '', hero_eyebrow: '', hero_title: 'Pénzügy', hero_description: '', hero_asset: '', hero_video: null, hero_height: null, hero_image_fit: null, hero_image_position_x: null, hero_image_position_y: null, hero_image_position_mobile_x: null, hero_image_position_mobile_y: null, hero_overlay_strength: null, hero_image_scale: null, presentation: '{"heroVariant":"detail"}', status: 'published', sort_order: 1 }], null];
      if (sql.includes('SELECT id FROM site_pages WHERE route=? AND id<>?')) return [[], null];
      if (sql.includes('FROM site_navigation_items')) return [[], null];
      if (sql.includes('site_content_blocks WHERE items IS NOT NULL')) return [[], null];
      if (sql.includes('site_settings')) return [[], null];
      return [[], null];
    },
    async execute(sql, params) { executed.push([sql, params]); return [{ affectedRows: 1 }, null]; },
  };
  return { conn, async getConnection() { return conn; } };
}
const preservePool = fakePoolForPageUpdate();
await createAdminRepository(preservePool).updatePage(3, { status: 'draft' });
assert.equal(JSON.parse(preservePool.conn.executed.find(([sql]) => sql.startsWith('UPDATE site_pages SET'))[1][19]).heroVariant, 'detail');
const listingPool = fakePoolForPageUpdate();
await createAdminRepository(listingPool).updatePage(3, { presentation: { heroVariant: 'listing' } });
assert.equal(JSON.parse(listingPool.conn.executed.find(([sql]) => sql.startsWith('UPDATE site_pages SET'))[1][19]).heroVariant, 'listing');
const compatPool = fakePoolForPageUpdate();
await createAdminRepository(compatPool).updatePage(3, { presentation_hero_variant: 'detail' });
assert.equal(JSON.parse(compatPool.conn.executed.find(([sql]) => sql.startsWith('UPDATE site_pages SET'))[1][19]).heroVariant, 'detail');
await assert.rejects(() => createAdminRepository(fakePoolForPageUpdate()).updatePage(3, { presentation: { heroVariant: 'bad' } }), (error) => error?.status === 400 && /hero variant/.test(error.message));

console.log('generic presentation contract smoke ok');
