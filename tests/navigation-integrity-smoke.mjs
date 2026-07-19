import assert from 'node:assert/strict';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createAdminRepository } from '../src/lib/admin/repository.mjs';
import { createPublishService } from '../src/lib/admin/publish.mjs';
import { pageForm } from '../src/lib/admin/render/pages.mjs';
import { createAdminServer, validateNavPayload } from '../src/lib/admin/server.mjs';
import { signSession } from '../src/lib/admin/auth.mjs';
import { activePageUsageBlockers, normalizeSnapshotForReferenceValidation, validateContentReferences } from '../src/lib/content/reference-validation.mjs';

const page = (id, status = 'published', route = `/p${id}/`, title = `P${id}`) => ({ id, status, route, title, slug: `p${id}`, type: 'content_page', seo_title: title, seo_description: '', hero_eyebrow: '', hero_title: title, hero_description: '', hero_asset: '', sort_order: id });
const nav = (over = {}) => ({ id: 10, title: 'P1', href: '/p1/', status: 'published', sort_order: 1, target_type: 'page', target_page_id: 1, title_override: null, ...over });
const snapshot = (navigation = [nav()], pages = [page(1)]) => ({ pages, blocks: [], navigation, settings: [], media: [] });

function makeUpdatePagePool({ currentStatus = 'published', usages = [], duplicateNavHref = false } = {}) {
  const calls = { begin: 0, commit: 0, rollback: 0, release: 0, pageUpdates: 0, navCompatibilityUpdates: [], queries: [] };
  const conn = {
    async beginTransaction() { calls.begin += 1; },
    async commit() { calls.commit += 1; },
    async rollback() { calls.rollback += 1; },
    release() { calls.release += 1; },
    async query(sql, params = []) {
      calls.queries.push({ sql, params });
      if (/SELECT \* FROM site_pages WHERE id=\?/i.test(sql)) return [[page(1, currentStatus, '/old/', 'Old title')], null];
      if (/SELECT id FROM site_pages WHERE route=\?/i.test(sql)) return [[], null];
      if (/FROM site_navigation_items/i.test(sql) && /FOR UPDATE/i.test(sql)) return [usages, null];
      return [[], null];
    },
    async execute(sql, params = []) {
      if (/UPDATE site_pages SET/i.test(sql)) { calls.pageUpdates += 1; return [{ affectedRows: 1 }, null]; }
      if (/UPDATE site_navigation_items SET href=\?/i.test(sql)) {
        calls.navCompatibilityUpdates.push({ sql, params });
        if (duplicateNavHref) { const e = new Error('Duplicate entry'); e.code = 'ER_DUP_ENTRY'; throw e; }
        return [{ affectedRows: usages.length }, null];
      }
      return [{ affectedRows: 1 }, null];
    },
  };
  return { calls, pool: { async getConnection() { return conn; } } };
}

async function expectBlockedUpdatePage(nextStatus, usageStatus) {
  const { pool, calls } = makeUpdatePagePool({ usages: [nav({ status: usageStatus })] });
  const repo = createAdminRepository(pool);
  await assert.rejects(() => repo.updatePage(1, { status: nextStatus }), /aktív menüpont/);
  assert.equal(calls.rollback, 1);
  assert.equal(calls.pageUpdates, 0);
  assert.equal(calls.commit, 0);
}

assert.equal(activePageUsageBlockers([nav({ status: 'published' })], 'archived').length, 1);
assert.equal(activePageUsageBlockers([nav({ status: 'draft' })], 'archived').length, 1);
assert.equal(activePageUsageBlockers([nav({ status: 'archived' })], 'archived').length, 0);
assert.equal(activePageUsageBlockers([nav({ status: 'published' })], 'draft').length, 1);
assert.equal(activePageUsageBlockers([nav({ status: 'draft' })], 'draft').length, 0);
assert.equal(activePageUsageBlockers([nav({ status: 'published' })], 'published').length, 0);

await expectBlockedUpdatePage('archived', 'published');
await expectBlockedUpdatePage('archived', 'draft');
await expectBlockedUpdatePage('draft', 'published');
{
  const { pool, calls } = makeUpdatePagePool({ usages: [nav({ status: 'draft', title: 'Draft' })] });
  await createAdminRepository(pool).updatePage(1, { status: 'draft' });
  assert.equal(calls.commit, 1);
  assert.equal(calls.pageUpdates, 1);
}
{
  const { pool, calls } = makeUpdatePagePool({ usages: [nav({ title_override: null }), nav({ id: 11, title: 'Custom', title_override: 'Custom' })] });
  await createAdminRepository(pool).updatePage(1, { route: '/new/', title: 'New title' });
  assert.equal(calls.navCompatibilityUpdates.length, 1);
  assert.deepEqual(calls.navCompatibilityUpdates[0].params, ['/new/', 'New title', 1]);
  assert.match(calls.navCompatibilityUpdates[0].sql, /title=COALESCE\(title_override, \?\)/);
}
{
  const { pool, calls } = makeUpdatePagePool({ duplicateNavHref: true });
  await assert.rejects(() => createAdminRepository(pool).updatePage(1, { route: '/new/' }), /ütközne/);
  assert.equal(calls.rollback, 1);
  assert.equal(calls.commit, 0);
}

function routeSyncPool({ currentRoute = '/megoldasaink/crm-ugyfelkezeles/', nextRoute = '/uzleti-megoldasok/crm-rendszer/', invalidItems = false } = {}) {
  const state = {
    page: page(1, 'published', currentRoute, 'CRM'),
    nav: [nav({ href: currentRoute, target_page_id: 1 })],
    blocks: [
      { id: 1, status: 'published', items: JSON.stringify([{ title: 'CRM', url: currentRoute }, { title: 'External', url: 'https://example.com' }, { title: 'Asset', url: '/assets/demo.png' }, { title: 'Text', label: `régi route ${currentRoute}` }, { title: 'Other', href: '/masik/' }]) },
      { id: 2, status: 'draft', items: JSON.stringify([{ label: 'Draft CTA', primaryUrl: currentRoute.replace(/\/$/, ''), secondaryUrl: currentRoute }]) },
      { id: 3, status: 'archived', items: JSON.stringify([{ title: 'Archived', url: currentRoute }]) },
    ],
    settings: [{ key: 'defaultCta', value: JSON.stringify({ primaryUrl: currentRoute, secondaryUrl: currentRoute.replace(/\/$/, ''), deployUrl: 'https://deploy.easylink.hu' }) }],
  };
  const calls = { commit: 0, rollback: 0, blockUpdates: [], settingUpdates: [], navCompatibilityUpdates: [] };
  const snapshot = () => structuredClone(state);
  const conn = {
    async beginTransaction() {},
    async commit() { calls.commit += 1; },
    async rollback() { calls.rollback += 1; state.page = snapshotBefore.page; state.nav = snapshotBefore.nav; state.blocks = snapshotBefore.blocks; state.settings = snapshotBefore.settings; },
    release() {},
    async query(sql, params = []) {
      if (/SELECT \* FROM site_pages WHERE id=\?/i.test(sql)) return [[state.page], null];
      if (/SELECT id FROM site_pages WHERE route=\?/i.test(sql)) return [[], null];
      if (/FROM site_navigation_items/i.test(sql) && /FOR UPDATE/i.test(sql)) return [state.nav, null];
      if (/FROM site_content_blocks/i.test(sql) && /FOR UPDATE/i.test(sql)) return [state.blocks.filter((block) => block.items != null && block.status !== 'archived').map((block) => ({ ...block, items: invalidItems && block.id === 1 ? '{bad json' : block.items })), null];
      if (/FROM site_settings/i.test(sql) && /FOR UPDATE/i.test(sql)) return [state.settings, null];
      return [[], null];
    },
    async execute(sql, params = []) {
      if (/UPDATE site_pages SET/i.test(sql)) { state.page.route = params[0]; state.page.slug = params[1]; state.page.title = params[3]; return [{ affectedRows: 1 }, null]; }
      if (/UPDATE site_navigation_items SET href=\?/i.test(sql)) { calls.navCompatibilityUpdates.push({ sql, params }); state.nav.forEach((item) => { item.href = params[0]; item.title = item.title_override || params[1]; }); return [{ affectedRows: state.nav.length }, null]; }
      if (/UPDATE site_content_blocks SET items=\?/i.test(sql)) { calls.blockUpdates.push({ id: params[1], items: params[0] }); state.blocks.find((block) => block.id === params[1]).items = params[0]; return [{ affectedRows: 1 }, null]; }
      if (/UPDATE site_settings SET `value`=\?/i.test(sql)) { calls.settingUpdates.push({ key: params[1], value: params[0] }); state.settings.find((row) => row.key === params[1]).value = params[0]; return [{ affectedRows: 1 }, null]; }
      return [{ affectedRows: 1 }, null];
    },
  };
  const snapshotBefore = snapshot();
  return { state, calls, pool: { async getConnection() { return conn; } }, nextRoute };
}

{
  const { pool, state, calls, nextRoute } = routeSyncPool();
  await createAdminRepository(pool).updatePage(1, { route: nextRoute, title: 'CRM rendszer' });
  assert.equal(state.page.route, nextRoute);
  assert.equal(state.nav[0].href, nextRoute);
  const publishedItems = JSON.parse(state.blocks[0].items);
  assert.equal(publishedItems[0].url, nextRoute);
  assert.equal(publishedItems[1].url, 'https://example.com');
  assert.equal(publishedItems[2].url, '/assets/demo.png');
  assert.match(publishedItems[3].label, /megoldasaink\/crm-ugyfelkezeles/);
  assert.equal(publishedItems[4].href, '/masik/');
  const draftItems = JSON.parse(state.blocks[1].items);
  assert.equal(draftItems[0].primaryUrl, nextRoute);
  assert.equal(draftItems[0].secondaryUrl, nextRoute);
  assert.equal(JSON.parse(state.blocks[2].items)[0].url, '/megoldasaink/crm-ugyfelkezeles/');
  assert.equal(calls.commit, 1);
  assert.equal(calls.rollback, 0);
}

{
  const { pool, state, calls } = routeSyncPool({ currentRoute: '/kapcsolat/', nextRoute: '/elerhetoseg/' });
  await createAdminRepository(pool).updatePage(1, { route: '/elerhetoseg/', title: 'Elérhetőség' });
  const publishedItems = JSON.parse(state.blocks[0].items);
  const settings = JSON.parse(state.settings[0].value);
  assert.equal(publishedItems[0].url, '/elerhetoseg/');
  assert.equal(settings.primaryUrl, '/elerhetoseg/');
  assert.equal(settings.secondaryUrl, '/elerhetoseg/');
  assert.equal(settings.deployUrl, 'https://deploy.easylink.hu');
  assert.equal(calls.settingUpdates.length, 1);
}

{
  const { pool, calls } = routeSyncPool({ currentRoute: '/kapcsolat/', nextRoute: '/kapcsolat/' });
  await createAdminRepository(pool).updatePage(1, { route: '/kapcsolat/', title: 'Kapcsolat' });
  assert.equal(calls.blockUpdates.length, 0);
  assert.equal(calls.settingUpdates.length, 0);
  assert.equal(calls.commit, 1);
}

{
  const { pool, state, calls } = routeSyncPool({ invalidItems: true });
  await assert.rejects(() => createAdminRepository(pool).updatePage(1, { route: '/uj/' }), /Hibás JSON/);
  assert.equal(calls.rollback, 1);
  assert.equal(calls.commit, 0);
  assert.equal(state.page.route, '/megoldasaink/crm-ugyfelkezeles/');
  assert.equal(state.nav[0].href, '/megoldasaink/crm-ugyfelkezeles/');
}

assert.equal(validateContentReferences(snapshot()).ok, true);
assert.equal(validateContentReferences(snapshot([nav()], [page(1, 'draft')])).errors[0].code, 'NAVIGATION_TARGET_PAGE_NOT_PUBLISHED');
assert.equal(validateContentReferences(snapshot([nav()], [page(1, 'archived')])).errors[0].code, 'NAVIGATION_TARGET_PAGE_NOT_PUBLISHED');
assert.equal(validateContentReferences(snapshot([nav()], [])).errors[0].code, 'NAVIGATION_TARGET_PAGE_MISSING');
assert.equal(validateContentReferences(snapshot([nav({ href: '/wrong/' })])).errors.some((e) => e.code === 'NAVIGATION_TARGET_ROUTE_MISMATCH'), true);
assert.equal(validateContentReferences(snapshot([nav({ title: 'Wrong' })])).errors.some((e) => e.code === 'NAVIGATION_TARGET_TITLE_MISMATCH'), true);
assert.equal(validateContentReferences(snapshot([nav({ title_override: 'Override', title: 'Wrong' })])).errors.some((e) => e.code === 'NAVIGATION_TARGET_TITLE_MISMATCH'), true);
assert.equal(validateContentReferences(snapshot([nav({ target_type: 'external', href: 'https://example.com', target_page_id: null })])).ok, true);
assert.equal(validateContentReferences(snapshot([nav({ target_type: 'external', href: 'https://example.com', target_page_id: 1 })])).errors[0].code, 'NAVIGATION_EXTERNAL_TARGET_INVALID');
assert.equal(validateContentReferences(snapshot([nav({ target_type: 'external', href: 'https://example.com', target_page_id: null, title_override: 'Bad' })])).errors[0].code, 'NAVIGATION_EXTERNAL_TARGET_INVALID');
assert.equal(validateContentReferences(snapshot([nav({ target_type: 'page', target_page_id: 'abc' })])).errors[0].code, 'NAVIGATION_TARGET_PAGE_ID_INVALID');
assert.equal(validateContentReferences(snapshot([nav({ target_type: 'mystery' })])).errors[0].code, 'NAVIGATION_TARGET_TYPE_INVALID');
assert.equal(validateContentReferences(snapshot([nav({ target_type: 'legacy', href: '/old/', target_page_id: null })])).ok, true);
assert.equal(validateContentReferences(snapshot([nav({ status: 'draft', target_page_id: 999, href: '/bad/' })])).ok, true);
assert.equal(validateContentReferences(snapshot([nav({ status: 'archived', target_page_id: 999, href: '/bad/' })])).ok, true);
assert.equal(normalizeSnapshotForReferenceValidation(snapshot([{ id: 1, title: 'Old', href: '/old/', status: 'published', sort_order: 1 }])).navigation[0].target_type, 'legacy');
assert.equal(validateContentReferences(snapshot([{ id: 1, title: 'Old', href: '/old/', status: 'published', sort_order: 1 }])).ok, true);

assert.equal(validateNavPayload({ items: [nav({ status: 'published' })] }, [page(1, 'draft')]).error.code, 'NAVIGATION_TARGET_PAGE_NOT_PUBLISHED');
assert.equal(validateNavPayload({ items: [nav({ status: 'draft' })] }, [page(1, 'draft')]).ok, true);

function navigationPool(targetStatus = 'draft') {
  const calls = { updates: 0, commits: 0, rollbacks: 0 };
  const conn = {
    async beginTransaction() {},
    async commit() { calls.commits += 1; },
    async rollback() { calls.rollbacks += 1; },
    release() {},
    async query(sql, params = []) {
      if (/href=\?/i.test(sql)) return [[], null];
      if (/SELECT id,status FROM site_pages/i.test(sql)) return [[{ id: 1, status: targetStatus }], null];
      if (/SELECT \* FROM site_navigation_items/i.test(sql)) return [[nav()], null];
      if (/SELECT id, route, title(, status)? FROM site_pages/i.test(sql)) return [[page(1, targetStatus)] , null];
      return [[], null];
    },
    async execute() { calls.updates += 1; return [{ affectedRows: 1, insertId: 99 }, null]; },
  };
  return { calls, pool: { async getConnection() { return conn; }, async query(sql) { if (/SELECT id, route, slug/i.test(sql)) return [[page(1, targetStatus)], null]; return [[], null]; } } };
}
for (const targetStatus of ['draft', 'archived']) {
  const { pool, calls } = navigationPool(targetStatus);
  await assert.rejects(() => createAdminRepository(pool).updateNav([nav({ status: 'published' })]), /Publikus menüpont/);
  assert.equal(calls.updates, 0);
  assert.equal(calls.rollbacks, 1);
}
{
  const { pool, calls } = navigationPool('draft');
  await createAdminRepository(pool).updateNav([nav({ status: 'draft' })]);
  assert.equal(calls.updates, 1);
  assert.equal(calls.commits, 1);
}

const legacyPayloadForExistingPageTarget = { id: 10, title: 'P1', href: '/p1/', status: 'published', sort_order: 1 };
for (const targetStatus of ['draft', 'archived']) {
  const { pool, calls } = navigationPool(targetStatus);
  await assert.rejects(() => createAdminRepository(pool).updateNav([legacyPayloadForExistingPageTarget]), /Publikus menüpont/);
  assert.equal(calls.updates, 0);
  assert.equal(calls.rollbacks, 1);
  assert.equal(calls.commits, 0);
}
{
  const { pool, calls } = navigationPool('published');
  await createAdminRepository(pool).updateNav([legacyPayloadForExistingPageTarget]);
  assert.equal(calls.updates, 1);
  assert.equal(calls.commits, 1);
}

let builds = 0, deploys = 0, snapshots = [];
const releasesRoot = await mkdtemp(path.join(tmpdir(), 'easylink-nav-integrity-'));
const service = createPublishService({
  env: { SITE_PUBLISH_RELEASES_DIR: releasesRoot },
  repo: {
    async exportContentSnapshot() { return snapshot([nav()], [page(1, 'draft')]); },
    async createPublishSnapshot(s) { snapshots.push({ id: snapshots.length + 1, ...s }); return snapshots.length; },
    async markPublishStarted(id) { snapshots[id - 1].started = true; },
    async markPublishFinished(id, p) { snapshots[id - 1] = { ...snapshots[id - 1], ...p }; },
    async prunePublishSnapshots() {},
  },
  build: async () => { builds += 1; return { ok: true, log: '' }; },
  deploy: async () => { deploys += 1; return { ok: true, log: '' }; },
});
const result = await service.publish({ adminId: 1, label: 'bad refs' });
assert.equal(result.ok, false);
assert.equal(result.status, 'failed');
assert.equal(result.liveUnchanged, true);
assert.equal(result.contentSaved, true);
assert.equal(builds, 0);
assert.equal(deploys, 0);
assert.deepEqual(await readdir(releasesRoot), []);
assert.equal(snapshots[0].status, 'failed');
assert.equal(snapshots[0].started, undefined);
assert.match(snapshots[0].build_log_excerpt, /NAVIGATION_TARGET_PAGE_NOT_PUBLISHED/);

async function withServer(repo, publishService, fn) {
  const env = { SITE_ADMIN_SESSION_SECRET: 'nav-integrity-secret' };
  const server = createAdminServer({ repo, env, publishService });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const cookie = `easylink_site_admin=${encodeURIComponent(signSession({ id: 1, email: 'a@b.test', role: 'admin' }, env))}`;
  try { await fn(base, cookie); } finally { server.close(); }
}

{
  let publishCalls = 0;
  await withServer({ async page() { return { page: page(1), blocks: [] }; }, async updatePage() { const e = new Error('Az oldal nem archiválható, mert aktív menüpont hivatkozik rá: P1.'); e.code = 'PAGE_IN_USE'; e.status = 409; e.details = { usages: [nav()] }; throw e; } }, { publish: async () => { publishCalls += 1; return { ok: true }; } }, async (base, cookie) => {
    const response = await fetch(`${base}/api/admin/pages/1`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ status: 'archived' }) });
    assert.equal(response.status, 409);
    const json = await response.json();
    assert.equal(json.error.code, 'PAGE_IN_USE');
    assert.equal(json.error.details.usages.length, 1);
    assert.equal(publishCalls, 0);
  });
}

{
  let publishCalls = 0;
  const { pool } = navigationPool('draft');
  await withServer(createAdminRepository(pool), { publish: async () => { publishCalls += 1; return { ok: true }; } }, async (base, cookie) => {
    const response = await fetch(`${base}/api/admin/navigation`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ items: [nav({ status: 'published' })] }) });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, 'NAVIGATION_TARGET_PAGE_NOT_PUBLISHED');
    assert.equal(publishCalls, 0);
  });
}
{
  let publishCalls = 0;
  const { pool } = navigationPool('draft');
  await withServer(createAdminRepository(pool), { publish: async () => { publishCalls += 1; return { ok: true }; } }, async (base, cookie) => {
    const response = await fetch(`${base}/api/admin/navigation`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ items: [nav({ status: 'draft' })] }) });
    assert.equal(response.status, 200);
    assert.equal(publishCalls, 1);
  });
}


{
  let publishCalls = 0;
  const { pool } = navigationPool('draft');
  await withServer(createAdminRepository(pool), { publish: async () => { publishCalls += 1; return { ok: true }; } }, async (base, cookie) => {
    const response = await fetch(`${base}/api/admin/navigation`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ items: [legacyPayloadForExistingPageTarget] }) });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, 'NAVIGATION_TARGET_PAGE_NOT_PUBLISHED');
    assert.equal(publishCalls, 0);
  });
}
{
  let publishCalls = 0;
  const { pool } = navigationPool('published');
  await withServer(createAdminRepository(pool), { publish: async () => { publishCalls += 1; return { ok: true }; } }, async (base, cookie) => {
    const response = await fetch(`${base}/api/admin/navigation`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ items: [legacyPayloadForExistingPageTarget] }) });
    assert.equal(response.status, 200);
    assert.equal(publishCalls, 1);
  });
}

{
  let imports = 0, publishes = 0;
  const repo = { async publishSnapshot(id) { return { id, content_json: snapshot([nav()], [page(1, 'draft')]) }; }, async importContentSnapshot() { imports += 1; } };
  await withServer(repo, { publish: async () => { publishes += 1; return { ok: true }; } }, async (base, cookie) => {
    const response = await fetch(`${base}/api/admin/publish/rollback/1`, { method: 'POST', headers: { cookie } });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, 'CONTENT_REFERENCE_INVALID');
    assert.equal(imports, 0);
    assert.equal(publishes, 0);
  });
}
{
  let imports = 0, publishes = 0;
  const repo = { async publishSnapshot(id) { return { id, content_json: snapshot() }; }, async importContentSnapshot(content) { imports += 1; assert.equal(content.navigation[0].target_type, 'page'); } };
  await withServer(repo, { publish: async () => { publishes += 1; return { ok: true }; } }, async (base, cookie) => {
    const response = await fetch(`${base}/api/admin/publish/rollback/1`, { method: 'POST', headers: { cookie } });
    assert.equal(response.status, 200);
    assert.equal(imports, 1);
    assert.equal(publishes, 1);
  });
}

const usageHtml = pageForm({ page: page(1), blocks: [], navigationUsages: [{ title: 'P1', status: 'published', sort_order: 1 }, { title: 'Draft item', status: 'draft', sort_order: 2 }] });
assert.match(usageHtml, /Aktív menühivatkozások/);
assert.match(usageHtml, /Publikus/);
assert.match(usageHtml, /Piszkozat/);
assert.match(usageHtml, /href="\/admin\/menu"/);
assert.match(pageForm({ page: page(2, 'draft'), blocks: [], navigationUsages: [] }), /Az oldalra jelenleg nem mutat aktív menüpont/);
const js = await import('../src/lib/admin/render/client-js.mjs');
assert.match(js.publishMessageJs, /textContent/);
assert.doesNotMatch(js.publishMessageJs, /innerHTML/);
console.log('Navigation integrity smoke passed: repository guards, HTTP conflicts, strict validator, publish/rollback preflight, admin usage UI.');
