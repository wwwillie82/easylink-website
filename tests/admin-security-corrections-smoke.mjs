import assert from 'node:assert/strict';
import {
  buildBlockEffectiveMutationPlan,
  buildNavigationEffectiveMutationPlan,
} from '../src/lib/admin/permissions.mjs';
import {
  layout,
  mediaPanel,
  navHtml,
  pageForm,
} from '../src/lib/admin/render.mjs';
import {
  isAdminMutation,
  withAdminMutationLock,
} from '../src/lib/admin/server-page-delete.mjs';

function assertEmbeddedScriptsParse(html, label) {
  const scripts = [...String(html).matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length > 0, `${label}: no scripts found`);
  for (const [index, match] of scripts.entries()) {
    if (/type=["']application\/json["']/.test(match[0])) continue;
    assert.doesNotThrow(
      () => new Function(match[1]),
      `${label}: embedded script ${index + 1} must parse`,
    );
  }
}

const basePage = {
  id: 1,
  route: '/a/',
  slug: 'a',
  type: 'content_page',
  title: 'A',
  seo_title: 'A',
  seo_description: '',
  hero_eyebrow: '',
  hero_title: 'A',
  hero_description: '',
  hero_asset: '',
  hero_video: null,
  hero_height: null,
  hero_image_fit: null,
  hero_image_position_x: null,
  hero_image_position_y: null,
  hero_image_position_mobile_x: null,
  hero_image_position_mobile_y: null,
  hero_overlay_strength: null,
  hero_image_scale: null,
  presentation: JSON.stringify({ heroVariant: 'listing' }),
  status: 'published',
  sort_order: 1,
};
const baseBlock = {
  id: 10,
  page_id: 1,
  block_key: 'manual:10',
  type: 'text',
  title: 'T',
  body: 'B',
  items: JSON.stringify([{ title: 'x' }]),
  presentation: JSON.stringify({ layout: 'grid', gridColumns: 3, surface: 'polished' }),
  sort_order: 7,
  status: 'published',
};
const pageData = {
  page: basePage,
  blocks: [baseBlock],
  defaultCta: {},
  navigationUsages: [],
  pageTargetPages: [],
};

let html = pageForm(pageData, {
  permissions: { pages: { canSave: true, canArchive: false, canDelete: false } },
});
assertEmbeddedScriptsParse(html, 'page form');
assert.doesNotMatch(html, /if\(f\.dataset\.canSave/, 'undefined f runtime reference removed');
assert.doesNotMatch(html, /<option value="archived"[^>]*>Archivált<\/option>/, 'archive option hidden without archive permission');

html = pageForm({ ...pageData, page: { ...basePage, status: 'archived' } }, {
  permissions: { pages: { canSave: true, canArchive: false, canDelete: false } },
});
assert.match(html, /<option value="archived" selected disabled>Archivált<\/option>/, 'current archived state remains visible but cannot be selected as a new transition');

html = navHtml([], [], {
  permissions: { menu: { canSave: true, canArchive: false, canDelete: false } },
});
assertEmbeddedScriptsParse(html, 'menu form');
assert.doesNotMatch(html, /value=\\"archived\\"(?![^>]*disabled)/, 'dynamic new menu rows do not expose archive without permission');

html = mediaPanel({ permissions: { media: { canSave: true, canArchive: true } } });
assertEmbeddedScriptsParse(html, 'media panel');
assert.doesNotMatch(html, /\+\s*<span>'\s*\+/, 'malformed media span concatenation removed');

html = layout('<button class="danger" data-page-delete="1">Törlés</button>', {
  current: '/admin/pages',
  adminContext: {
    permissions: {
      pages: { canSave: false, canArchive: false, canDelete: true },
    },
  },
});
assert.doesNotMatch(html, /button\.danger/, 'legacy global danger selector removed');
assert.match(html, /data-page-delete="1"/, 'renderer output remains present');

const blockPlan = buildBlockEffectiveMutationPlan(baseBlock, {
  id: 10,
  presentation: JSON.stringify({ layout: 'stack' }),
  presentation_visible_keys: ['layout', 'gridColumns'],
});
assert.equal(blockPlan.needsSave, true);
assert.deepEqual(blockPlan.next.presentation, { layout: 'stack', surface: 'polished' });
assert.deepEqual(blockPlan.next.presentation_visible_keys, ['layout', 'gridColumns']);

const navPlan = buildNavigationEffectiveMutationPlan([], [
  {
    client_key: 'group-a',
    target_type: 'group',
    title: 'Csoport',
    href: null,
    sort_order: 1,
    status: 'published',
  },
  {
    client_key: 'child-a',
    parent_ref: 'client:group-a',
    target_type: 'external',
    title: 'Gyermek',
    href: 'https://example.com',
    sort_order: 1,
    status: 'published',
  },
]);
assert.equal(navPlan.needsSave, true);
assert.equal(navPlan.nextRows[1].parent_ref, 'client:group-a');
assert.equal(navPlan.nextRows[1].parent_id, null);

assert.equal(isAdminMutation({ method: 'PUT' }, '/api/admin/pages/1'), true);
assert.equal(isAdminMutation({ method: 'POST' }, '/api/admin/login'), false);
assert.equal(isAdminMutation({ method: 'GET' }, '/api/admin/pages'), false);

const sql = [];
const conn = {
  async query(statement) {
    sql.push(statement);
    if (statement.includes('GET_LOCK')) return [[{ acquired: 1 }]];
    return [[{ released: 1 }]];
  },
  release() { sql.push('release'); },
};
const result = await withAdminMutationLock(
  { async getConnection() { return conn; } },
  async () => 'ok',
);
assert.equal(result, 'ok');
assert.ok(sql.some((statement) => String(statement).includes('GET_LOCK')));
assert.ok(sql.some((statement) => String(statement).includes('RELEASE_LOCK')));
assert.equal(sql.at(-1), 'release');

console.log('admin security corrections smoke ok');
