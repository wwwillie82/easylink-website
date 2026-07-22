import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { blockForm, serializeEditorItems } from '../src/lib/admin/render/blocks.mjs';
import { pageForm } from '../src/lib/admin/render/pages.mjs';
import { createAdminRepository } from '../src/lib/admin/repository.mjs';
import { blockContracts } from '../src/lib/content/block-registry.mjs';
import { normalizeBlockItemsByType } from '../src/lib/content/block-contracts.mjs';
import { applyChanges, inspect } from '../scripts/adopt-generic-public-presentation.mjs';

const schema = await readFile(new URL('../src/lib/db/schema.sql', import.meta.url), 'utf8');
assert.match(schema, /site_pages[\s\S]*presentation LONGTEXT NULL CHECK \(presentation IS NULL OR JSON_VALID\(presentation\)\)/);
assert.match(schema, /site_content_blocks[\s\S]*presentation LONGTEXT NULL CHECK \(presentation IS NULL OR JSON_VALID\(presentation\)\)/);
assert.match(schema, /ALTER TABLE site_pages ADD COLUMN IF NOT EXISTS presentation LONGTEXT NULL CHECK \(presentation IS NULL OR JSON_VALID\(presentation\)\)/);
assert.match(schema, /ALTER TABLE site_content_blocks ADD COLUMN IF NOT EXISTS presentation LONGTEXT NULL CHECK \(presentation IS NULL OR JSON_VALID\(presentation\)\)/);
assert.ok(blockContracts.some((c) => c.type === 'related-links' && c.capabilities.cardTarget === true));

const deployWorkflow = await readFile(new URL('../.github/workflows/deploy-site-dev.yml', import.meta.url), 'utf8');
const envLoadIndex = deployWorkflow.indexOf('. "$SITE_DEV_ENV_FILE"');
const migrateIndex = deployWorkflow.indexOf('npm run db:migrate');
const dryRunBeforeIndex = deployWorkflow.indexOf('node scripts/adopt-generic-public-presentation.mjs --dry-run');
const applyIndex = deployWorkflow.indexOf('node scripts/adopt-generic-public-presentation.mjs --apply --yes');
const dryRunAfterIndex = deployWorkflow.indexOf('post_adopt_output="$(node scripts/adopt-generic-public-presentation.mjs --dry-run)"');
const pendingGuardIndex = deployWorkflow.indexOf('data.pending!==0');
const publishIndex = deployWorkflow.indexOf('npm run admin:publish');
assert.ok(envLoadIndex > -1 && envLoadIndex < migrateIndex, 'site-admin.env must load before DB migration');
assert.ok(migrateIndex < dryRunBeforeIndex && dryRunBeforeIndex < applyIndex && applyIndex < dryRunAfterIndex && dryRunAfterIndex < pendingGuardIndex && pendingGuardIndex < publishIndex, 'site-dev rollout must migrate, dry-run, apply, verify pending=0, then publish');
const guardLine = deployWorkflow.split('\n').map((line) => line.trim()).find((line) => line.startsWith('node -e ') && line.includes('data.pending!==0'));
assert.ok(guardLine, 'post-adopt pending guard command must exist');
assert.doesNotMatch(guardLine, /'/, 'post-adopt guard must not contain raw single quotes inside the outer bash -lc single-quoted script');
function runPostAdoptGuard(input) {
  const remoteScript = `post_adopt_output=${JSON.stringify(input)}
${guardLine}`;
  return spawnSync('bash', ['-lc', `bash -lc '${remoteScript}'`], { encoding: 'utf8' });
}
assert.equal(runPostAdoptGuard('{"pending":0}').status, 0);
assert.equal(runPostAdoptGuard('{"pending":1}').status, 1);
assert.equal(runPostAdoptGuard('not json').status, 1);


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
assert.match(blockHtml, /name="presentation_grid_columns" type="number" min="1" max="4"/);
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
for (const expected of ["[4, ['/megoldasaink/hr-munkaugy/", "[5, ['/megoldasaink/crm-ugyfelkezeles/", "[6, ['/megoldasaink/dokumentumkezeles-adminisztracio/", "[7, ['/megoldasaink/kontrolling/", "[11, ['/kinek-szol/vendeglatohelyek/", "[117,'golden:20:text:Demó alapján pontosítunk','text']", "{ id: 114, pageId: 2, key: 'golden:10:cards:Megoldásaink'", "{ id: 120, pageId: 2, key: 'manual:598fbc42-261f-4b8e-ba62-33a1553c3b81'", "{ id: 115, pageId: 9, key: 'golden:10:cards:Kinek szól?'"]) assert.ok(smokeSource.includes(expected), `Missing adopt DB contract literal: ${expected}`);
for (const forbidden of ['hr-'+'munkaido', 'crm-'+'ertekesites', 'kontrolling-'+'riportok', '/megoldasaink/'+'dokumentumkezeles/', '/kinek-szol/'+'vendeglatas/', '/arak/:'+ 'text:1']) assert.equal(smokeSource.includes(forbidden), false, `Forbidden stale DB contract literal remained: ${forbidden}`);

const basePageRows = [[2, '/megoldasaink/', 'solutions_index'], [3, '/megoldasaink/penzugy-szamlazas/', 'solution_detail'], [4, '/megoldasaink/hr-munkaugy/', 'solution_detail'], [5, '/megoldasaink/crm-ugyfelkezeles/', 'solution_detail'], [6, '/megoldasaink/dokumentumkezeles-adminisztracio/', 'solution_detail'], [7, '/megoldasaink/kontrolling/', 'solution_detail'], [8, '/megoldasaink/ai-asszisztens/', 'solution_detail'], [10, '/kinek-szol/hotelek-szallashelyek/', 'audience_detail'], [11, '/kinek-szol/vendeglatohelyek/', 'audience_detail'], [12, '/kinek-szol/szolgaltato-vallalkozasok/', 'audience_detail'], [9, '/kinek-szol/', 'audiences_index'], [13, '/integraciok/', 'integrations'], [14, '/arak/', 'pricing'], [15, '/kapcsolat/', 'contact']].map(([id, route, type]) => ({ id, route, type, status: 'published', presentation: null }));
const baseBlockRows = [{id:51,page_id:13,block_key:'/integraciok/:text:0',type:'text',status:'published',title:'t',body:'b',items:'[]',presentation:null},{id:52,page_id:13,block_key:'/integraciok/:cards:1',type:'cards',status:'published',title:'t',body:'b',items:'[]',presentation:null},{id:53,page_id:14,block_key:'/arak/:feature-list:0',type:'feature-list',status:'published',title:'t',body:'b',items:'[]',presentation:null},{id:117,page_id:14,block_key:'golden:20:text:Demó alapján pontosítunk',type:'text',status:'published',title:'t',body:'b',items:'[]',presentation:null},{id:55,page_id:15,block_key:'/kapcsolat/:cta:0',type:'cta',status:'published',title:'t',body:'b',items:'[]',presentation:null},{id:56,page_id:15,block_key:'/kapcsolat/:feature-list:1',type:'feature-list',status:'published',title:'t',body:'b',items:'[]',presentation:null}];
const baseListingRows = [{id:114,page_id:2,block_key:'golden:10:cards:Megoldásaink',type:'cards',status:'published',sort_order:2,presentation:null,title:'Cards',body:'Body',items:'[]'},{id:3,page_id:2,block_key:'/megoldasaink/:feature-list:0',type:'feature-list',status:'published',sort_order:1,presentation:null,title:'Feature',body:'Body',items:'[]'},{id:120,page_id:2,block_key:'manual:598fbc42-261f-4b8e-ba62-33a1553c3b81',type:'video',status:'published',sort_order:3,presentation:null,title:'Video',body:'Body',items:'[]'},{id:121,page_id:2,block_key:'manual:14e66a0a-ebf9-4f85-9ba3-c182bed2a9c7',type:'ai-preview',status:'published',sort_order:4,presentation:null,title:'AI',body:'Body',items:'[]'},{id:122,page_id:2,block_key:'manual:68e691be-8397-4f16-8c36-fe9587cd7566',type:'network-visual',status:'published',sort_order:5,presentation:null,title:'Network',body:'Body',items:'[]'},{id:115,page_id:9,block_key:'golden:10:cards:Kinek szól?',type:'cards',status:'published',sort_order:10,presentation:null,title:'Cards',body:'Body',items:'[]'}];
const relatedTargets = new Map([[3,[4,5,6]],[4,[3,5,6]],[5,[3,4,6]],[6,[3,4,5]],[7,[3,4,5]],[8,[3,4,5]],[10,[11,12]],[11,[10,12]],[12,[10,11]]]);
const makeRelatedRows = (status = 'draft') => [...relatedTargets.entries()].map(([page_id, targets], index) => ({ id: 800 + index, page_id, block_key: `generic-related-links:${page_id}`, type: 'related-links', title: 'Kapcsolódó oldalak', body: '', status, sort_order: 800, items: JSON.stringify(targets.map((target_page_id) => ({ target_type: 'page', target_page_id, title_override: '' }))) }));

function fakeConn({ conflict = false, relatedState = 'draft' } = {}) {
  const pageRows = structuredClone(basePageRows);
  const blockRows = structuredClone(baseBlockRows);
  const listingRows = structuredClone(baseListingRows);
  const relatedRows = conflict ? [{ id: 999, page_id:3, block_key:'generic-related-links:3', type:'related-links', title:'Kapcsolódó oldalak', body:'', status:'published', sort_order:800, items:'[]' }] : (relatedState === 'missing' ? [] : makeRelatedRows(relatedState));
  let nextId = 900;
  const findBlock = (id) => blockRows.find((row) => Number(row.id) === Number(id)) ?? listingRows.find((row) => Number(row.id) === Number(id));
  return {
    async query(sql, params = []) {
      if (sql.includes('SELECT title,body,items FROM site_content_blocks WHERE id=?')) return [[findBlock(params[0])], null];
      if (sql.includes('FROM site_pages')) return [pageRows, null];
      if (sql.includes('WHERE id IN') && sql.includes('site_content_blocks') && params.length === 6 && !sql.includes('sort_order,presentation')) return [blockRows, null];
      if (sql.includes('WHERE id IN') && sql.includes('site_content_blocks') && params.length === 6 && sql.includes('sort_order,presentation')) return [listingRows, null];
      if (sql.includes("LIKE 'generic-related-links:%'")) return [relatedRows, null];
      return [[], null];
    },
    async execute(sql, params) {
      if (sql.startsWith('UPDATE site_pages SET presentation=')) pageRows.find((row) => Number(row.id) === Number(params[1])).presentation = params[0];
      else if (sql.startsWith('UPDATE site_content_blocks SET presentation=')) findBlock(params[1]).presentation = params[0];
      else if (sql.startsWith("UPDATE site_content_blocks SET status='published'")) relatedRows.find((row) => Number(row.id) === Number(params[0])).status = 'published';
      else if (sql.startsWith('INSERT INTO site_content_blocks')) relatedRows.push({ id: nextId++, page_id: params[0], block_key: params[1], type: params[2], title: params[3], body: params[4], items: params[5], sort_order: params[6], status: params[7] });
      else throw new Error(`Unexpected SQL in fakeConn: ${sql}`);
      return [{ affectedRows: 1 }, null];
    },
  };
}
const missingConn = fakeConn({ relatedState: 'missing' });
const missingStatus = await inspect(missingConn);
assert.equal(missingStatus.changes.filter((c)=>c.kind==='related-create').length, 9);
assert.ok(missingStatus.changes.filter((c)=>c.kind==='related-create').every((c) => c.want.type === 'related-links' && c.want.title === 'Kapcsolódó oldalak' && c.want.body === '' && c.want.sort_order === 800 && c.want.status === 'published'));
await applyChanges(missingConn, missingStatus.changes);
assert.equal((await inspect(missingConn)).changes.length, 0);
const draftStatus = await inspect(fakeConn());
assert.equal(draftStatus.changes.filter((c)=>c.kind==='related-publish').length, 9);
const publishedConn = fakeConn({ relatedState: 'published' });
await applyChanges(publishedConn, (await inspect(publishedConn)).changes);
assert.equal((await inspect(publishedConn)).changes.length, 0);
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
