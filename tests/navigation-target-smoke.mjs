import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { normalizeNavigationTargetType, normalizeNavigationTargetFields, normalizeRouteForExactMatch, classifyNavigationHref, resolveNavigationItem, buildRouteMatchMap, planNavigationBackfillItem } from '../src/lib/content/internal-links.mjs';
import { runNavigationBackfill, parseArgs, formatSummary } from '../scripts/navigation-target-backfill.mjs';
import { createAdminRepository } from '../src/lib/admin/repository.mjs';
import { validateNavPayload } from '../src/lib/admin/server.mjs';
import { migrate, ensureNavigationTargetSchema } from '../scripts/db-migrate.mjs';

assert.equal(normalizeNavigationTargetType(undefined), 'legacy');
assert.equal(normalizeNavigationTargetType('page'), 'page');
assert.equal(normalizeNavigationTargetType('bogus'), 'legacy');
assert.equal(normalizeRouteForExactMatch('/Arak'), '/arak/');
assert.equal(normalizeRouteForExactMatch('/arak/?x=1'), '');
assert.deepEqual(classifyNavigationHref('/arak/'), { kind: 'internal', route: '/arak/' });
assert.equal(classifyNavigationHref('/arak/#x').kind, 'legacy');
assert.equal(classifyNavigationHref('https://example.com').kind, 'external');
assert.equal(resolveNavigationItem({ title: 'Legacy', href: '/legacy/', target_type: 'legacy', sort_order: 1, status: 'published' }).href, '/legacy/');
assert.deepEqual(resolveNavigationItem({ title: 'External', href: 'https://example.com', target_type: 'external', sortOrder: 2, status: 'published' }), { title: 'External', href: 'https://example.com', sortOrder: 2, status: 'published' });
assert.deepEqual(resolveNavigationItem({ title: 'Old', href: '/old/', target_type: 'page', sortOrder: 3, status: 'published' }, { route: '/arak/', title: 'Árak' }), { title: 'Árak', href: '/arak/', sortOrder: 3, status: 'published' });
assert.deepEqual(resolveNavigationItem({ title: 'Old', href: '/old/', target_type: 'page', title_override: 'Áraink', sortOrder: 3, status: 'published' }, { route: '/arak/', title: 'Árak' }), { title: 'Áraink', href: '/arak/', sortOrder: 3, status: 'published' });
assert.deepEqual(resolveNavigationItem({ title: 'Broken', href: '/kept/', target_type: 'page', sortOrder: 4, status: 'published' }, null), { title: 'Broken', href: '/kept/', sortOrder: 4, status: 'published' });


const validBaseNavPayload = { id: '1', title: 'T', href: '/t/', sort_order: '1', status: 'published' };
assert.equal(validateNavPayload({ items: [{ ...validBaseNavPayload, target_page_id: '1' }] }).ok, false);
assert.equal(validateNavPayload({ items: [{ ...validBaseNavPayload, title_override: 'X' }] }).ok, false);
assert.equal(validateNavPayload({ items: [{ ...validBaseNavPayload, target_type: 'external', target_page_id: '1' }] }).ok, false);
assert.equal(validateNavPayload({ items: [{ ...validBaseNavPayload, target_type: 'legacy', title_override: 'X' }] }).ok, false);
assert.equal(validateNavPayload({ items: [{ ...validBaseNavPayload, target_type: 'page', target_page_id: '1' }] }).ok, true);
assert.equal(validateNavPayload({ items: [{ ...validBaseNavPayload, target_type: 'page' }] }).ok, false);

const pages = [{ id: 1, route: '/arak/', title: 'Árak' }, { id: 2, route: '/kapcsolat/', title: 'Kapcsolat' }];
const routeMatches = buildRouteMatchMap(pages);
let plan = planNavigationBackfillItem({ id: 1, title: 'Árak', href: '/arak/', target_type: 'legacy' }, routeMatches);
assert.equal(plan.action, 'page');
assert.equal(plan.update.target_page_id, 1);
assert.equal(plan.update.title_override, null);
plan = planNavigationBackfillItem({ id: 2, title: 'Áraink', href: '/arak/', target_type: 'legacy' }, routeMatches);
assert.equal(plan.action, 'page');
assert.equal(plan.update.title_override, 'Áraink');
assert.deepEqual(plan.oldResolved, plan.nextResolved);
assert.equal(planNavigationBackfillItem({ id: 3, title: 'Q', href: '/arak/?x=1', target_type: 'legacy' }, routeMatches).action, 'legacy');
assert.equal(planNavigationBackfillItem({ id: 4, title: 'X', href: 'https://example.com', target_type: 'legacy' }, routeMatches).action, 'external');
assert.equal(planNavigationBackfillItem({ id: 5, title: 'Missing', href: '/missing/', target_type: 'legacy' }, routeMatches).action, 'legacy');
assert.equal(planNavigationBackfillItem({ id: 6, title: 'Done', href: '/arak/', target_type: 'page', target_page_id: 1 }, routeMatches).action, 'already_migrated');
assert.equal(planNavigationBackfillItem({ id: 60, title: 'External done', href: 'https://example.com', target_type: 'external' }, routeMatches).action, 'already_migrated');
assert.equal(planNavigationBackfillItem({ id: 61, title: 'Inkonzisztens', href: '/arak/', target_type: 'legacy', target_page_id: 12 }, routeMatches).action, 'page');
assert.equal(planNavigationBackfillItem({ id: 62, title: 'Hibás page', href: '/missing/', target_type: 'page', target_page_id: 0 }, routeMatches).action, 'legacy');
assert.equal(planNavigationBackfillItem({ id: 17, title: 'Teszt', href: '/teszt', status: 'archived', target_type: 'legacy' }, routeMatches).action, 'archived_skipped');
assert.equal(planNavigationBackfillItem({ id: 18, title: 'Archived external', href: 'https://example.com', status: 'archived', target_type: 'legacy' }, routeMatches).action, 'archived_skipped');
assert.equal(planNavigationBackfillItem({ id: 19, title: 'Archived mismatch', href: '/arak/', status: 'archived', target_type: 'legacy' }, buildRouteMatchMap([{ id: 1, route: '/arak/', title: 'Más' }])).action, 'archived_skipped');
const ambiguous = buildRouteMatchMap([{ id: 1, route: '/dup/', title: 'A' }, { id: 2, route: '/dup', title: 'B' }]);
assert.equal(planNavigationBackfillItem({ id: 7, title: 'Dup', href: '/dup/', target_type: 'legacy' }, ambiguous).reason, 'többértelmű route egyezés');

const badPlan = planNavigationBackfillItem({ id: 8, title: 'Régi', href: '/arak/', target_type: 'legacy' }, buildRouteMatchMap([{ id: 1, route: '/uj/', title: 'Régi' }]));
assert.equal(badPlan.action, 'legacy');

const navRows = [
  { id: 1, title: 'Áraink', href: '/arak/', sort_order: 1, status: 'published', target_type: 'legacy', target_page_id: null, title_override: null },
  { id: 2, title: 'Külső', href: 'https://example.com', sort_order: 2, status: 'published', target_type: 'legacy', target_page_id: null, title_override: null },
  { id: 3, title: 'Query', href: '/arak/?x=1', sort_order: 3, status: 'published', target_type: 'legacy', target_page_id: null, title_override: null },
  { id: 17, title: 'Teszt', href: '/teszt', sort_order: 4, status: 'archived', target_type: 'legacy', target_page_id: null, title_override: null },
  ...Array.from({ length: 6 }, (_, index) => ({ id: 20 + index, title: `Migrated ${index}`, href: '/arak/', sort_order: 10 + index, status: 'published', target_type: 'page', target_page_id: 1, title_override: null })),
];
const adapter = {
  async listPages() { return pages; },
  async listNavigation() { return navRows.map((r) => ({ ...r })); },
  async applyUpdate(plan) { const row = navRows.find((r) => r.id === plan.id && r.target_type === plan.original.target_type && r.target_page_id == null && r.title === plan.original.title && r.href === plan.original.href && (r.title_override ?? null) === (plan.original.title_override ?? null)); if (!row) return 0; Object.assign(row, plan.update); return 1; },
};
let summary = await runNavigationBackfill(adapter, { apply: false });
assert.equal(summary.dryRun, true);
assert.equal(summary.page.length, 1);
assert.equal(summary.external.length, 1);
assert.equal(summary.legacy.length, 1);
assert.equal(summary.archived_skipped.length, 1);
assert.equal(summary.error.length, 0);
assert.equal(summary.already_migrated.length, 6);
assert.equal(navRows[0].target_type, 'legacy');
summary = await runNavigationBackfill(adapter, { apply: true });
assert.equal(summary.applied, 2);
assert.equal(summary.archived_skipped.length, 1);
assert.equal(summary.error.length, 0);
assert.equal(navRows.find((r) => r.id === 17).target_type, 'legacy');
assert.equal(navRows[0].target_type, 'page');
assert.equal(navRows[0].target_page_id, 1);
assert.equal(navRows[0].title_override, 'Áraink');
assert.equal(navRows[1].target_type, 'external');
const afterApply = await runNavigationBackfill(adapter, { apply: true });
assert.equal(afterApply.applied, 0);
assert.equal(afterApply.already_migrated.length, 8);
assert.equal(afterApply.archived_skipped.length, 1);
assert.equal(afterApply.error.length, 0);
assert.match(formatSummary(afterApply), /már migrált: 8/);
assert.match(formatSummary(afterApply), /archivált \/ kihagyva: 1/);
assert.deepEqual(parseArgs([]), { ok: true, help: false, apply: false, dryRun: true });
assert.equal(parseArgs(['--apply']).apply, true);
assert.equal(parseArgs(['--apply', '--dry-run']).ok, false);
assert.equal(parseArgs(['--wat']).ok, false);
assert.throws(() => execFileSync(process.execPath, ['scripts/navigation-target-backfill.mjs', '--apply', '--dry-run'], { encoding: 'utf8', stdio: 'pipe' }), /A --apply és --dry-run/);
assert.throws(() => execFileSync(process.execPath, ['scripts/navigation-target-backfill.mjs', '--wat'], { encoding: 'utf8', stdio: 'pipe' }), /Ismeretlen kapcsoló/);

let archivedApplyCalls = 0;
const archivedOnlySummary = await runNavigationBackfill({ async listPages() { return pages; }, async listNavigation() { return [{ id: 17, title: 'Teszt', href: '/teszt', status: 'archived', target_type: 'legacy' }]; }, async applyUpdate() { archivedApplyCalls += 1; return 1; } }, { apply: true });
assert.equal(archivedOnlySummary.archived_skipped.length, 1);
assert.equal(archivedOnlySummary.error.length, 0);
assert.equal(archivedOnlySummary.applied, 0);
assert.equal(archivedApplyCalls, 0);
assert.match(formatSummary(archivedOnlySummary), /archivált \/ kihagyva: 1/);
const publishedMismatch = await runNavigationBackfill({ async listPages() { return [{ id: 1, route: '/teszt/', title: 'Más' }]; }, async listNavigation() { return [{ id: 21, title: 'Teszt', href: '/teszt', status: 'published', target_type: 'legacy' }]; }, async applyUpdate() { return 1; } }, { apply: true });
assert.equal(publishedMismatch.error.length, 1);
assert.equal(publishedMismatch.applied, 0);

const zeroApplySummary = await runNavigationBackfill({ async listPages() { return pages; }, async listNavigation() { return [{ id: 10, title: 'Árak', href: '/arak/', target_type: 'legacy' }]; }, async applyUpdate() { return 0; } }, { apply: true });
assert.equal(zeroApplySummary.applied, 0);
assert.equal(zeroApplySummary.conflict.length, 1);
const conflictRows = [{ id: 11, title: 'Árak', href: '/arak/', target_type: 'legacy', target_page_id: null, title_override: null }];
const conflictAdapter = { async listPages() { return pages; }, async listNavigation() { return conflictRows.map((r) => ({ ...r })); }, async applyUpdate(plan) { conflictRows[0].title = 'Közben módosult'; return conflictRows[0].title === plan.original.title ? 1 : 0; } };
const titleConflict = await runNavigationBackfill(conflictAdapter, { apply: true });
assert.equal(titleConflict.applied, 0);
assert.equal(titleConflict.conflict.length, 1);
const hrefConflictRows = [{ id: 12, title: 'Árak', href: '/arak/', target_type: 'legacy', target_page_id: null, title_override: null }];
const hrefConflict = await runNavigationBackfill({ async listPages() { return pages; }, async listNavigation() { return hrefConflictRows.map((r) => ({ ...r })); }, async applyUpdate(plan) { hrefConflictRows[0].href = '/mas/'; return hrefConflictRows[0].href === plan.original.href ? 1 : 0; } }, { apply: true });
assert.equal(hrefConflict.applied, 0);
assert.equal(hrefConflict.conflict.length, 1);

const publicRepositorySource = await readFile('src/lib/db/repository.ts', 'utf8');
assert.match(publicRepositorySource, /LEFT JOIN site_pages p ON p\.id = n\.target_page_id/);
assert.match(publicRepositorySource, /resolveNavigationItem\(row/);

const headerSource = await readFile('src/components/Header.astro', 'utf8');
assert.match(headerSource, /siteNavigation\.map\(\(item\) => \(\s*<a href=\{item\.href\}>\s*\{item\.title\}\s*<\/a>/s);

const adminState = { nav: [{ id: 1, title: 'Áraink', href: '/arak/', sort_order: 1, status: 'published', target_type: 'page', target_page_id: 1, title_override: 'Áraink' }], pages: [{ id: 1, route: '/arak/', title: 'Árak' }], blocks: [] };
const adminPool = {
  async query(sql, params = []) {
    const text = String(sql);
    if (text.startsWith('SELECT * FROM site_navigation_items WHERE id=')) return [[adminState.nav.find((n) => String(n.id) === String(params[0]))].filter(Boolean), null];
    if (text.startsWith('SELECT n.*, p.route AS target_route')) return [adminState.nav.map((n) => ({ ...n, target_route: adminState.pages.find((p) => p.id === n.target_page_id)?.route || null, target_title: adminState.pages.find((p) => p.id === n.target_page_id)?.title || null })), null];
    if (text.startsWith('SELECT * FROM site_navigation_items ORDER')) return [adminState.nav.map((n) => ({ ...n })), null];
    if (text.startsWith('SELECT id, route, title FROM site_pages WHERE id=')) return [[adminState.pages.find((p) => String(p.id) === String(params[0]))].filter(Boolean), null];
    if (text.startsWith('SELECT id FROM site_pages WHERE id=')) return [[adminState.pages.find((p) => String(p.id) === String(params[0]))].filter(Boolean), null];
    if (text.startsWith('SELECT * FROM site_pages WHERE id=')) return [[adminState.pages.find((p) => String(p.id) === String(params[0]))].filter(Boolean), null];
    if (text.startsWith('SELECT * FROM site_content_blocks')) return [adminState.blocks, null];
    return [[], null];
  },
  async execute(sql, params = []) {
    const text = String(sql);
    if (text.startsWith('UPDATE site_navigation_items SET title=?, href=?, sort_order=?, status=?, target_type=')) {
      const row = adminState.nav.find((n) => String(n.id) === String(params[7]));
      Object.assign(row, { title: params[0], href: params[1], sort_order: params[2], status: params[3], target_type: params[4], target_page_id: params[5], title_override: params[6] });
      return [{ affectedRows: 1 }, null];
    }
    if (text.startsWith('UPDATE site_navigation_items SET title=?, href=?, sort_order=?, status=? WHERE id=?')) {
      const row = adminState.nav.find((n) => String(n.id) === String(params[4]));
      Object.assign(row, { title: params[0], href: params[1], sort_order: params[2], status: params[3] });
      return [{ affectedRows: 1 }, null];
    }
    if (text.startsWith('INSERT INTO site_navigation_items')) {
      adminState.nav.push({ id: 2, title: params[0], href: params[1], target_type: params[2], target_page_id: params[3], title_override: params[4], sort_order: params[5], status: params[6] });
      return [{ insertId: 2, affectedRows: 1 }, null];
    }
    return [{ affectedRows: 1 }, null];
  },
  async getConnection() { throw new Error('not used'); },
};
const adminRepo = createAdminRepository(adminPool);
let adminNav = await adminRepo.nav();
assert.equal(adminNav[0].title, 'Áraink');
assert.equal(adminNav[0].href, '/arak/');
await adminRepo.updateNav([{ id: 1, title: 'Áraink', href: '/arak/', sort_order: 1, status: 'published' }]);
assert.equal(adminState.nav[0].target_type, 'page');
assert.equal(adminState.nav[0].target_page_id, 1);
assert.equal(adminState.nav[0].title_override, 'Áraink');
await adminRepo.updateNav([{ id: 1, title: 'Árak', href: '/arak/', sort_order: 1, status: 'published' }]);
assert.equal(adminState.nav[0].target_type, 'page');
assert.equal(adminState.nav[0].title_override, null);
await adminRepo.updateNav([{ id: 1, title: 'Egyedi cím', href: '/arak/', sort_order: 1, status: 'published' }]);
assert.equal(adminState.nav[0].target_type, 'page');
assert.equal(adminState.nav[0].title_override, 'Egyedi cím');
adminNav = await adminRepo.nav();
assert.equal(adminNav[0].title, 'Egyedi cím');
await adminRepo.updateNav([{ id: 1, title: 'Kézi', href: '/kezi/', sort_order: 1, status: 'published' }]);
assert.equal(adminState.nav[0].target_type, 'legacy');
assert.equal(adminState.nav[0].target_page_id, null);
assert.equal(adminState.nav[0].title_override, null);
adminNav = await adminRepo.nav();
assert.equal(adminNav[0].href, '/kezi/');
await adminRepo.updateNav([{ title: 'Új', href: '/uj/', sort_order: 2, status: 'draft' }]);
assert.equal(adminState.nav[1].target_type, 'legacy');
assert.equal(adminState.nav[1].target_page_id, null);
await assert.rejects(() => adminRepo.updateNav([{ id: 1, title: 'Bad', href: '/bad/', sort_order: 1, status: 'published', target_page_id: 1 }]), /cél típusát/);
await assert.rejects(() => adminRepo.updateNav([{ id: 1, title: 'Bad', href: '/bad/', sort_order: 1, status: 'published', title_override: 'X' }]), /cél típusát/);
await assert.rejects(() => adminRepo.updateNav([{ id: 1, title: 'Bad', href: '/bad/', sort_order: 1, status: 'published', target_type: 'external', target_page_id: 1 }]), /Legacy és külső/);
await assert.rejects(() => adminRepo.updateNav([{ id: 1, title: 'Bad', href: '/bad/', sort_order: 1, status: 'published', target_type: 'legacy', title_override: 'X' }]), /Legacy és külső/);
await assert.rejects(() => adminRepo.updateNav([{ id: 1, title: 'Bad', href: '/bad/', sort_order: 1, status: 'published', target_type: 'page', target_page_id: 999 }]), /nem található/);
await adminRepo.updateNav([{ id: 1, title: 'Árak explicit', href: '/arak/', sort_order: 1, status: 'published', target_type: 'page', target_page_id: 1, title_override: 'Árak explicit' }]);
assert.equal(adminState.nav[0].target_type, 'page');
assert.equal(adminState.nav[0].target_page_id, 1);
assert.equal(adminState.nav[0].title_override, 'Árak explicit');

const imported = { pages: [], blocks: [], nav: [], media: [], settings: [], deleted: [] };
const importPool = {
  async getConnection() { return {
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
    async query(sql, params = []) {
      const text = String(sql);
      if (text.startsWith('DELETE FROM')) imported.deleted.push(text);
      if (text.startsWith('INSERT INTO site_pages')) imported.pages.push(params[0]);
      if (text.startsWith('INSERT INTO site_content_blocks')) imported.blocks.push(params[0]);
      if (text.startsWith('INSERT INTO site_navigation_items')) imported.nav.push(params[0]);
      if (text.startsWith('INSERT INTO site_settings')) imported.settings.push(params[0]);
      if (text.startsWith('INSERT INTO site_media_assets')) imported.media.push(params[0]);
      return [[], null];
    },
  }; },
};
const importRepo = createAdminRepository(importPool);
await importRepo.importContentSnapshot({ pages: [{ id: 10, route: '/arak/', title: 'Árak' }], blocks: [{ id: 20, page_id: 10 }], navigation: [{ id: 30, title: 'Régi', href: '/regi/' }] });
assert.deepEqual(imported.deleted.slice(0, 3), ['DELETE FROM site_content_blocks', 'DELETE FROM site_navigation_items', 'DELETE FROM site_pages']);
assert.equal(imported.pages[0].id, 10);
assert.equal(imported.nav[0].target_type, 'legacy');
assert.equal(imported.nav[0].target_page_id, null);
assert.equal(imported.nav[0].title_override, null);
imported.pages = []; imported.blocks = []; imported.nav = []; imported.deleted = [];
await importRepo.importContentSnapshot({ pages: [{ id: 10, route: '/arak/', title: 'Árak' }], blocks: [], navigation: [{ id: 31, title: 'Hibás', href: '/hibas/', target_type: 'page', target_page_id: 999, title_override: 'Hibás' }, { id: 32, title: 'Külső', href: 'https://example.com', target_type: 'external', target_page_id: 10, title_override: 'X' }] });
assert.equal(imported.nav[0].target_type, 'legacy');
assert.equal(imported.nav[0].target_page_id, null);
assert.equal(imported.nav[0].title_override, null);
assert.equal(imported.nav[1].target_type, 'external');
assert.equal(imported.nav[1].target_page_id, null);
assert.equal(imported.nav[1].title_override, null);
imported.pages = []; imported.blocks = []; imported.nav = []; imported.deleted = [];
await importRepo.importContentSnapshot({ pages: [{ id: 10, route: '/arak/', title: 'Árak' }], blocks: [], navigation: [{ id: 30, title: 'Áraink', href: '/arak/', target_type: 'page', target_page_id: 10, title_override: 'Áraink' }] });
assert.equal(imported.pages[0].id, imported.nav[0].target_page_id);

function createSchemaPool() {
  const state = { columns: new Set(), indexes: new Set(), fks: new Set(), ddl: [] };
  return { state,
    async query(sql, params = []) {
      const text = String(sql);
      if (text.includes('INFORMATION_SCHEMA.COLUMNS')) return [[...state.columns].includes(`${params[0]}.${params[1]}`) ? [{ COLUMN_NAME: params[1] }] : [], null];
      if (text.includes('INFORMATION_SCHEMA.STATISTICS')) return [[...state.indexes].includes(`${params[0]}.${params[1]}`) ? [{ INDEX_NAME: params[1] }] : [], null];
      if (text.includes('INFORMATION_SCHEMA.TABLE_CONSTRAINTS')) return [[...state.fks].includes(`${params[0]}.${params[2]}`) ? [{ CONSTRAINT_NAME: params[2] }] : [], null];
      state.ddl.push(text);
      if (text.startsWith('ALTER TABLE site_navigation_items ADD COLUMN target_type')) state.columns.add('site_navigation_items.target_type');
      if (text.startsWith('ALTER TABLE site_navigation_items ADD COLUMN target_page_id')) state.columns.add('site_navigation_items.target_page_id');
      if (text.startsWith('ALTER TABLE site_navigation_items ADD COLUMN title_override')) state.columns.add('site_navigation_items.title_override');
      if (text.startsWith('CREATE INDEX idx_site_navigation_items_target_page')) state.indexes.add('site_navigation_items.idx_site_navigation_items_target_page');
      if (text.startsWith('ALTER TABLE site_navigation_items ADD CONSTRAINT fk_site_navigation_items_target_page')) state.fks.add('site_navigation_items.fk_site_navigation_items_target_page');
      return [[], null];
    },
  };
}
const schemaPool = createSchemaPool();
await ensureNavigationTargetSchema(schemaPool);
assert.equal(schemaPool.state.columns.has('site_navigation_items.target_type'), true);
assert.equal(schemaPool.state.indexes.has('site_navigation_items.idx_site_navigation_items_target_page'), true);
assert.equal(schemaPool.state.fks.has('site_navigation_items.fk_site_navigation_items_target_page'), true);
schemaPool.state.ddl = [];
await ensureNavigationTargetSchema(schemaPool);
assert.equal(schemaPool.state.ddl.some((stmt) => /^(ALTER|CREATE) /i.test(stmt)), false);

function createMigratePool() {
  const schemaPool = createSchemaPool();
  schemaPool.state.columns.add('site_navigation_items.target_type');
  schemaPool.state.columns.add('site_navigation_items.target_page_id');
  schemaPool.state.columns.add('site_navigation_items.title_override');
  schemaPool.state.indexes.add('site_navigation_items.idx_site_navigation_items_target_page');
  schemaPool.state.fks.add('site_navigation_items.fk_site_navigation_items_target_page');
  return schemaPool;
}
const migratePool = createMigratePool();
await migrate({ pool: migratePool });
assert.ok(migratePool.state.ddl.some((stmt) => stmt.startsWith('ALTER TABLE site_media_assets ADD COLUMN IF NOT EXISTS processing_status')));
assert.ok(migratePool.state.ddl.some((stmt) => stmt.startsWith('ALTER TABLE site_media_assets ADD COLUMN IF NOT EXISTS processing_finished_at')));

const drySql = await migrate({ dryRun: true });
assert.match(drySql, /target_type VARCHAR\(32\) NOT NULL DEFAULT 'legacy'/);
assert.match(drySql, /fk_site_navigation_items_target_page/);

const schemaSource = await readFile('src/lib/db/schema.sql', 'utf8');
assert.match(schemaSource, /href VARCHAR\(512\) NOT NULL UNIQUE/);
assert.doesNotMatch(schemaSource, /ALTER TABLE site_navigation_items ADD COLUMN IF NOT EXISTS target_type/);
assert.doesNotMatch(schemaSource, /card_description|card_asset|link_target|site_navigation_targets/);
console.log('Navigation target smoke passed: resolver, backfill, provider, admin compatibility, snapshot rollback ordering and migration helpers.');
