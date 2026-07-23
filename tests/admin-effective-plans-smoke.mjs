import assert from 'node:assert/strict';
import {
  buildBlockEffectiveMutationPlan,
  buildHomeAggregateEffectiveMutationPlan,
  buildNavigationEffectiveMutationPlan,
  buildPageEffectiveMutationPlan,
  fullAdminPermissionMatrix,
  hasAction,
} from '../src/lib/admin/permissions.mjs';
import { pagesTable, pageForm, navHtml, mediaPanel, settingsPanel, publishPanel } from '../src/lib/admin/render.mjs';

const archiveOnlyPages = { pages: { canSave: false, canArchive: true, canDelete: false } };
const saveArchivePages = { pages: { canSave: true, canArchive: true, canDelete: true } };
const basePage = { id: 1, route: '/a/', slug: 'a', type: 'content_page', title: 'A', seo_title: 'A', seo_description: '', hero_eyebrow: '', hero_title: 'A', hero_description: '', hero_asset: '', hero_video: null, hero_height: null, hero_image_fit: null, hero_image_position_x: null, hero_image_position_y: null, hero_image_position_mobile_x: null, hero_image_position_mobile_y: null, hero_overlay_strength: null, hero_image_scale: null, presentation: JSON.stringify({ heroVariant: 'listing' }), status: 'published', sort_order: 1 };
const baseBlock = { id: 10, page_id: 1, block_key: 'manual:10', type: 'text', title: 'T', body: 'B', items: JSON.stringify([{ title: 'x' }]), presentation: JSON.stringify({ layout: 'stack' }), sort_order: 7, status: 'published' };

function assertNeeds(plan, save, archive, label) {
  assert.equal(plan.needsSave, save, `${label}: save`);
  assert.equal(plan.needsArchive, archive, `${label}: archive`);
}

// A. Page payload alias.
let plan = buildPageEffectiveMutationPlan(basePage, { presentation_hero_variant: 'detail' });
assertNeeds(plan, true, false, 'hero variant change');
assert.deepEqual(plan.next.presentation, { heroVariant: 'detail' });
assert.equal(plan.noOp, false);
plan = buildPageEffectiveMutationPlan(basePage, { presentation_hero_variant: 'listing' });
assert.equal(plan.noOp, true, 'same hero variant is no-op');
plan = buildPageEffectiveMutationPlan(basePage, { status: 'archived', presentation_hero_variant: 'detail' });
assertNeeds(plan, true, true, 'archive + hero variant');
assert.equal(hasAction(archiveOnlyPages, 'pages', 'save'), false);
assert.equal(hasAction(saveArchivePages, 'pages', 'save'), true);

// B. Navigation parent aliases.
const navCurrent = [{ id: 1, title: 'A', href: '/a/', target_type: 'legacy', target_page_id: null, title_override: null, parent_id: null, sort_order: 1, status: 'published' }, { id: 2, title: 'B', href: '/b/', target_type: 'legacy', target_page_id: null, title_override: null, parent_id: null, sort_order: 1, status: 'published' }];
for (const alias of ['parent_ref', 'parentRef', 'parent_id', 'parentId']) {
  plan = buildNavigationEffectiveMutationPlan(navCurrent, [{ ...navCurrent[1], [alias]: alias === 'parent_ref' || alias === 'parentRef' ? 'id:1' : 1 }]);
  assertNeeds(plan, true, false, `nav ${alias}`);
  assert.equal(plan.nextRows[0].parent_id, 1);
}
plan = buildNavigationEffectiveMutationPlan(navCurrent, [{ ...navCurrent[1], parent_ref: 'id:1', status: 'archived' }]);
assertNeeds(plan, true, true, 'nav archive + move');
plan = buildNavigationEffectiveMutationPlan([{ ...navCurrent[1], parent_id: 1 }], [{ ...navCurrent[1], parent_ref: 'id:1', status: 'archived' }]);
assertNeeds(plan, false, true, 'nav pure archive');
plan = buildNavigationEffectiveMutationPlan([{ ...navCurrent[0], sort_order: 1 }], [{ ...navCurrent[0], sort_order: '1' }]);
assert.equal(plan.noOp, true, 'sort_order string/number no-op');

// C. Standalone block sparse payload.
plan = buildBlockEffectiveMutationPlan(baseBlock, { id: 10, status: 'archived' });
assertNeeds(plan, false, true, 'block sparse archive');
assert.equal(plan.next.sort_order, 7);
assert.equal(plan.next.title, 'T');
assert.deepEqual(plan.next.items, [{ title: 'x' }]);
plan = buildBlockEffectiveMutationPlan(baseBlock, { id: 10, status: 'archived', sort_order: 8 });
assertNeeds(plan, true, true, 'block archive + sort');
plan = buildBlockEffectiveMutationPlan(baseBlock, { id: 10 });
assert.equal(plan.noOp, true, 'block no-op');

// D. Home aggregate sparse payload.
const currentHome = { page: { ...basePage, id: 1, route: '/', type: 'home' }, blocks: [baseBlock, { ...baseBlock, id: 11, status: 'archived' }] };
plan = buildHomeAggregateEffectiveMutationPlan(currentHome, { page: {}, blocks: [{ id: 10, status: 'archived' }], archived_block_ids: [] });
assertNeeds(plan, false, true, 'home sparse archive');
assert.equal(plan.nextPayload.blocks[0].sort_order, 7);
plan = buildHomeAggregateEffectiveMutationPlan(currentHome, { page: {}, blocks: [{ id: 10, status: 'archived', title: 'Changed' }], archived_block_ids: [] });
assertNeeds(plan, true, true, 'home archive + title');
plan = buildHomeAggregateEffectiveMutationPlan(currentHome, { page: {}, blocks: [], archived_block_ids: [11] });
assert.equal(plan.noOp, true, 'already archived block id no-op');
plan = buildHomeAggregateEffectiveMutationPlan(currentHome, { page: {}, blocks: [{ page_id: 1, type: 'text', title: 'N', body: '', items: [] }], archived_block_ids: [] });
assert.equal(plan.needsSave, true, 'home new block save');
plan = buildHomeAggregateEffectiveMutationPlan(currentHome, { page: { title: 'Home 2' }, blocks: [{ id: 10, status: 'archived' }], archived_block_ids: [] });
assertNeeds(plan, true, true, 'page change + block archive');

// E. Renderer-specific UI (actual renderer return HTML, not source scanning).
const pageData = { page: basePage, blocks: [baseBlock], defaultCta: {}, navigationUsages: [], pageTargetPages: [] };
let html = pagesTable([basePage], { permissions: { pages: { canSave: false, canArchive: false, canDelete: false } } });
assert.match(html, /new-page-form[\s\S]*disabled/, 'pages read-only create disabled');
assert.doesNotMatch(html, /data-page-delete/, 'pages read-only no physical delete');
html = pageForm(pageData, { permissions: archiveOnlyPages });
assert.match(html, /data-page-archive="1"/, 'archive-only page archive button');
assert.doesNotMatch(html, /data-page-delete="1"/, 'archive-only no page delete');
html = pageForm(pageData, { permissions: saveArchivePages });
assert.match(html, /data-page-delete="1"/, 'delete-capable page delete button');
html = navHtml(navCurrent, [], { permissions: { menu: { canSave: false, canArchive: false, canDelete: false } } });
assert.match(html, /id="add-nav" hidden disabled/, 'menu read-only no add root');
html = navHtml(navCurrent, [], { permissions: { menu: { canSave: false, canArchive: true, canDelete: false } } });
assert.match(html, /data-can-delete="0"/, 'menu archive-only marks delete disabled');
html = navHtml(navCurrent, [], { permissions: { menu: { canSave: false, canArchive: false, canDelete: true } } });
assert.match(html, /canDelete/, 'menu delete capability is passed to dynamic renderer');
html = mediaPanel({ permissions: { media: { canSave: false, canArchive: false } } });
assert.match(html, /data-can-save="0"/, 'media read-only upload disabled path');
html = mediaPanel({ permissions: { media: { canSave: false, canArchive: true } } });
assert.match(html, /canArchive":true/, 'media archive capability passed to async card renderer');
html = settingsPanel({ legalDocuments: {}, analytics: {}, contact: {}, brand: {}, social: {}, defaultCta: {} }, { permissions: { settings: { canSave: false } } });
assert.match(html, /settings-form" data-can-save="0"[\s\S]*fieldset disabled/, 'settings read-only fieldset disabled');
html = publishPanel({ snapshots: [{ id: 1, created_at: 'now', content_hash: 'abcdef', is_current: 1 }], permissions: { publish: { canRepublish: true, canRestore: false } } });
assert.match(html, /data-republish/, 'publish republish-only button');
assert.doesNotMatch(html, /data-rollback="/, 'publish republish-only no restore button');
html = publishPanel({ snapshots: [{ id: 1, created_at: 'now', content_hash: 'abcdef', is_current: 1 }], permissions: { publish: { canRepublish: false, canRestore: true } } });
assert.doesNotMatch(html, /data-republish>/, 'publish restore-only no republish button');
assert.match(html, /data-rollback="1"/, 'publish restore-only rollback');
assert.equal(fullAdminPermissionMatrix.media.canDelete, false, 'media delete remains false');

console.log('admin effective plans smoke ok');
