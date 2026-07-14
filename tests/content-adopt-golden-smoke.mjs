import assert from 'node:assert/strict';
import { buildGoldenManifest, diffManifest, applyManifest, parseArgs } from '../scripts/content-adopt-golden.mjs';

const manifest = await buildGoldenManifest();
const routes = manifest.map((e) => e.route);
assert.equal(manifest.filter((e) => e.group === 'solutions').length, 7);
assert.equal(manifest.filter((e) => e.group === 'audiences').length, 4);
assert.ok(routes.includes('/megoldasaink/'));
assert.ok(routes.includes('/megoldasaink/penzugy-szamlazas/'));
assert.ok(routes.includes('/kinek-szol/'));
assert.ok(routes.includes('/kinek-szol/hotelek-szallashelyek/'));
assert.ok(routes.includes('/integraciok/'));
assert.ok(routes.includes('/arak/'));
assert.ok(routes.includes('/kapcsolat/'));
assert.ok(routes.includes('/'));

const forbiddenPublicCopy = /src\/content|golden forrás|admin-kompatibilis/i;
for (const entry of manifest) {
  for (const block of entry.blocks) {
    assert.doesNotMatch(`${block.title ?? ''} ${block.body ?? ''}`, forbiddenPublicCopy, `${entry.route} block copy must be public-facing`);
  }
  assert.doesNotMatch(`${entry.page.heroTitle ?? ''} ${entry.page.heroDescription ?? ''}`, forbiddenPublicCopy, `${entry.route} hero copy must be public-facing`);
}

const penzugy = manifest.find((e) => e.route === '/megoldasaink/penzugy-szamlazas/');
assert.equal(penzugy.blocks.length, 4);
assert.equal(penzugy.blocks[0].title, 'Mire jó?');
assert.match(penzugy.blocks[0].body, /ne külön táblázatokból/);
assert.equal(penzugy.blocks[1].type, 'feature-list');
assert.deepEqual(penzugy.blocks.map((b) => b.sort_order), [10, 20, 30, 40]);
assert.doesNotMatch(JSON.stringify(penzugy), /TELEX KÁRTYA|placeholder/i);

const solutionsIndex = manifest.find((e) => e.route === '/megoldasaink/');
assert.equal(solutionsIndex.applyAllowed, true);
assert.equal(solutionsIndex.blocks[0].type, 'cards');
assert.equal(solutionsIndex.blocks[0].items.length, 6);
assert.deepEqual(solutionsIndex.blocks[0].items.map((i) => i.url), manifest.filter((e) => e.group === 'solutions' && e.route !== '/megoldasaink/').map((e) => e.route));
assert.match(JSON.stringify(solutionsIndex.blocks[0]), /Pénzügy és számlázás/);
assert.match(solutionsIndex.page.heroDescription, /Válaszd ki, melyik működési területet/);
assert.match(solutionsIndex.blocks[0].body, /Válaszd ki, melyik működési területet/);

const audiencesIndex = manifest.find((e) => e.route === '/kinek-szol/');
assert.equal(audiencesIndex.applyAllowed, true);
assert.equal(audiencesIndex.blocks[0].type, 'cards');
assert.equal(audiencesIndex.blocks[0].items.length, 3);
assert.deepEqual(audiencesIndex.blocks[0].items.map((i) => i.url), manifest.filter((e) => e.group === 'audiences' && e.route !== '/kinek-szol/').map((e) => e.route));
assert.match(JSON.stringify(audiencesIndex.blocks[0]), /Hoteleknek és szálláshelyeknek/);
assert.match(audiencesIndex.page.heroTitle, /Ügyvitel a vállalkozásod működéséhez/);
assert.match(audiencesIndex.blocks[0].body, /különböző működési modellekhez igazítható/);

const integrationsIndex = manifest.find((e) => e.route === '/integraciok/');
assert.equal(integrationsIndex.applyAllowed, true);
assert.match(JSON.stringify(integrationsIndex), /integrációs irány|Előkészített kapcsolódási irányok|nem kész runtime integrációs állítások/i);
const pricingIndex = manifest.find((e) => e.route === '/arak/');
assert.equal(pricingIndex.applyAllowed, true);
assert.match(JSON.stringify(pricingIndex), /Mitől függhet az ár\?|Demó alapján pontosítunk|Demót kérek/);
assert.doesNotMatch(JSON.stringify(pricingIndex), /\b\d+[ .]?Ft\b|csomagár|kalkulátor/i);
const contactIndex = manifest.find((e) => e.route === '/kapcsolat/');
assert.equal(contactIndex.applyAllowed, true);
assert.match(JSON.stringify(contactIndex), /Kapcsolat|hello@easylink\.hu|Miben tudunk segíteni\?/);
assert.doesNotMatch(JSON.stringify(contactIndex), /deploy|site admin|placeholder/i);
const home = manifest.find((e) => e.route === '/');
assert.equal(home.applyAllowed, false);
assert.match(home.note, /komponált Astro layout, kézi döntést igényel/i);


function clone(value) { return JSON.parse(JSON.stringify(value)); }
function createFixtureDb() {
  const state = {
    snapshots: [],
    pages: [
      { id: 2, route: '/megoldasaink/', type: 'solutions_index', title: 'Megoldásaink', status: 'published' },
      { id: 3, route: '/megoldasaink/penzugy-szamlazas/', type: 'solution_detail', title: 'Pénzügy és számlázás', status: 'published' },
      { id: 12, route: '/kinek-szol/', type: 'audiences_index', title: 'Kinek szól?', status: 'published' },
      { id: 30, route: '/integraciok/', type: 'integrations', title: 'Integrációk', status: 'published' },
      { id: 40, route: '/arak/', type: 'pricing', title: 'Árak', status: 'published' },
      { id: 50, route: '/kapcsolat/', type: 'contact', title: 'Kapcsolat', status: 'published' },
      { id: 1, route: '/', type: 'home', title: 'Easylink', status: 'published' },
    ],
    blocks: [
      { id: 4, page_id: 3, type: 'text', title: 'TELEX KÁRTYA', body: 'placeholder pénzügy szöveg', items: null, sort_order: 10, status: 'published' },
      { id: 5, page_id: 3, type: 'feature-list', title: 'Konkrét fókuszok', body: '', items: JSON.stringify(['placeholder fókusz']), sort_order: 20, status: 'published' },
      { id: 43, page_id: 3, type: 'text', title: 'Mire jó?', body: 'draft old golden shape must stay draft', items: null, sort_order: 8, status: 'draft' },
      { id: 44, page_id: 3, type: 'text', title: 'Mire jó?', body: 'archived old golden shape must stay archived', items: null, sort_order: 9, status: 'archived' },
      { id: 99, page_id: 3, type: 'text', title: 'Régi teszt blokk', body: 'dummy test content', items: null, sort_order: 99, status: 'published' },
      { id: 101, page_id: 30, type: 'text', title: 'TELEX KÁRTYA', body: 'placeholder integration', items: null, sort_order: 10, status: 'published' },
    ],
    nextBlockId: 200,
  };
  const adapter = {
    state,
    async getPageByRoute(route) { return state.pages.find((p) => p.route === route) || null; },
    async listBlocks(pageId) { return state.blocks.filter((b) => String(b.page_id) === String(pageId)).sort((a,b)=>a.sort_order-b.sort_order||a.id-b.id).map(clone); },
    async updatePageFields(id, page) { Object.assign(state.pages.find((p) => p.id === id), { title: page.title, seo_title: page.seoTitle, seo_description: page.seoDescription, hero_title: page.heroTitle }); },
    async updateBlock(id, block) { Object.assign(state.blocks.find((b) => b.id === id), { type: block.type, title: block.title, body: block.body ?? null, items: block.items === undefined ? null : JSON.stringify(block.items), sort_order: block.sort_order, status: block.status }); },
    async insertBlock(pageId, block) { state.blocks.push({ id: state.nextBlockId++, page_id: pageId, type: block.type, title: block.title, body: block.body ?? null, items: block.items === undefined ? null : JSON.stringify(block.items), sort_order: block.sort_order, status: block.status }); },
    async archiveBlock(id) { state.blocks.find((b) => b.id === id).status = 'archived'; },
    async createAuditSnapshot(label) { state.snapshots.push({ label, status: 'success', is_current: 0, content_json: { pages: clone(state.pages), blocks: clone(state.blocks), navigation: [], settings: [], media: [] } }); },
    async transaction(fn) { return fn(adapter); },
  };
  return adapter;
}

const dryDb = createFixtureDb();
const beforeDry = clone(dryDb.state);
const dry = await diffManifest(manifest, dryDb, { route: '/megoldasaink/penzugy-szamlazas/' });
assert.equal(dry.length, 1);
assert.equal(dry[0].page.id, 3);
assert.ok(dry[0].risks.some((r) => /TELEX KÁRTYA|placeholder/i.test(`${r.title} ${r.preview}`)));
assert.ok(dry[0].risks.some((r) => r.blockId === 43 && r.status === 'draft' && /non-published block ignored/.test(r.reason)));
assert.ok(dry[0].risks.some((r) => r.blockId === 44 && r.status === 'archived' && /non-published block ignored/.test(r.reason)));
assert.ok(dry[0].actions.some((a) => a.action === 'insert' && a.target.title === 'Mire jó?' && /non-published matching block ignored/.test(a.reason)));
assert.ok(!dry[0].actions.some((a) => ['keep', 'update', 'archive'].includes(a.action) && [43, 44].includes(a.blockId)));
assert.ok(dry[0].actions.some((a) => a.action === 'archive' && a.blockId === 4));
assert.ok(dry[0].actions.some((a) => a.action === 'insert' && a.target.title === 'Vezetői haszon'));
assert.ok(dry[0].actions.some((a) => a.action === 'archive' && a.blockId === 99));
assert.deepEqual(dryDb.state, beforeDry, 'dry-run must not mutate fixture DB');

assert.throws(() => parseArgs(['--apply']), /--apply requires --yes/);
assert.throws(() => parseArgs(['--apply', '--yes', '--group', 'solutions']), /Apply requires an explicit --route/);
const allDry = await diffManifest(manifest, createFixtureDb(), { group: 'all' });
assert.ok(allDry.length >= 12, 'dry-run group all should remain available');
const applyDb = createFixtureDb();
await assert.rejects(() => applyManifest(manifest, applyDb, { group: 'solutions' }), /Apply requires an explicit --route/);
await assert.rejects(() => applyManifest(manifest, applyDb, { group: 'all' }), /explicit --route/);
await assert.rejects(() => applyManifest(manifest, applyDb, { route: '/' }), /disabled|manual approval/i);
await applyManifest(manifest, applyDb, { route: '/integraciok/' });
assert.equal(applyDb.state.snapshots.length, 1);
let integrationsBlocks = await applyDb.listBlocks(30);
assert.match(JSON.stringify(integrationsBlocks), /Előkészített kapcsolódási irányok|nem kész runtime integrációs állítások/i);
await applyManifest(manifest, applyDb, { route: '/arak/' });
assert.doesNotMatch(JSON.stringify(await applyDb.listBlocks(40)), /\b\d+[ .]?Ft\b|kalkulátor/i);
await applyManifest(manifest, applyDb, { route: '/kapcsolat/' });
assert.match(JSON.stringify(await applyDb.listBlocks(50)), /hello@easylink\.hu/);
await applyManifest(manifest, applyDb, { route: '/megoldasaink/' });
assert.match(JSON.stringify(await applyDb.listBlocks(2)), /Pénzügy és számlázás/);
await applyManifest(manifest, applyDb, { route: '/kinek-szol/' });
assert.match(JSON.stringify(await applyDb.listBlocks(12)), /Hoteleknek és szálláshelyeknek/);
await applyManifest(manifest, applyDb, { route: '/megoldasaink/penzugy-szamlazas/' });
assert.equal(applyDb.state.snapshots.length, 6);
assert.equal(applyDb.state.snapshots.at(-1).status, 'success');
assert.equal(applyDb.state.snapshots.at(-1).is_current, 0);
assert.match(applyDb.state.snapshots.at(-1).label, /^golden-adopt-before:\/megoldasaink\/penzugy-szamlazas\/$/);
for (const key of ['pages', 'blocks', 'navigation', 'settings', 'media']) assert.ok(Object.hasOwn(applyDb.state.snapshots.at(-1).content_json, key));
let pageBlocks = await applyDb.listBlocks(3);
assert.equal(pageBlocks.filter((b) => b.status === 'published').length, 4);
assert.equal(pageBlocks.find((b) => b.id === 99).status, 'archived');
assert.equal(pageBlocks.find((b) => b.id === 43).status, 'draft');
assert.equal(pageBlocks.find((b) => b.id === 44).status, 'archived');
assert.match(pageBlocks.find((b) => b.title === 'Mire jó?' && b.status === 'published').body, /ne külön táblázatokból/);
assert.equal(pageBlocks.filter((b) => b.title === 'Mire jó?' && b.status === 'published').length, 1);
const afterFirstApply = clone(applyDb.state.blocks);
await applyManifest(manifest, applyDb, { route: '/megoldasaink/penzugy-szamlazas/' });
pageBlocks = await applyDb.listBlocks(3);
assert.equal(pageBlocks.filter((b) => b.status === 'published').length, 4);
assert.equal(pageBlocks.find((b) => b.id === 43).status, 'draft');
assert.equal(pageBlocks.find((b) => b.id === 44).status, 'archived');
assert.equal(pageBlocks.filter((b) => b.title === 'Mire jó?' && b.status === 'published').length, 1);
assert.deepEqual(applyDb.state.blocks, afterFirstApply, 'apply must be idempotent after first normalization');

console.log('Content adopt golden smoke passed: manifest routes, rollback-compatible snapshot, non-published safety, golden pénzügy content, dry-run safety, guarded apply, idempotency, protected groups.');
