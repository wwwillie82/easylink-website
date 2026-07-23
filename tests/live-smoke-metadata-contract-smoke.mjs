import assert from 'node:assert/strict';
import { buildLiveSmokePlan } from '../scripts/smoke-live-site.mjs';
import { buildPublicSmokeMetadataFromSnapshot } from '../src/lib/content/smoke-metadata.mjs';

const metadata = buildPublicSmokeMetadataFromSnapshot({
  pages: [
    {
      id: 1,
      route: '/',
      type: 'home',
      title: 'Easylink',
      hero_title: 'Adminból módosított főoldali cím',
      hero_description: 'Ez a ténylegesen publikált főoldali leírás.',
      status: 'published',
    },
    {
      id: 2,
      route: '/egyedi-oldal/',
      type: 'content_page',
      title: 'Egyedi oldal címe',
      hero_title: '',
      hero_description: '',
      status: 'published',
    },
    {
      id: 3,
      route: '/archivalt/',
      type: 'content_page',
      title: 'Archivált oldal',
      status: 'archived',
    },
  ],
  blocks: [],
  settings: [],
});

assert.equal(metadata.version, 2);
assert.equal(metadata.source, 'admin-publish-snapshot');
assert.equal(metadata.pages.length, 2, 'archived pages are excluded from public metadata');

const home = metadata.pages.find((page) => page.route === '/');
assert.deepEqual(home.smokeContent, {
  heroTitle: 'Adminból módosított főoldali cím',
  heroDescription: 'Ez a ténylegesen publikált főoldali leírás.',
});

const custom = metadata.pages.find((page) => page.route === '/egyedi-oldal/');
assert.deepEqual(custom.smokeContent, {
  heroTitle: 'Egyedi oldal címe',
  heroDescription: '',
}, 'empty hero_title falls back to the published page title');

const plan = buildLiveSmokePlan(metadata.pages);
assert.ok(plan.routes.includes('/'));
assert.ok(plan.routes.includes('/egyedi-oldal/'));
assert.ok(!plan.routes.includes('/archivalt/'));

const homeChecks = plan.contentChecks.find((entry) => entry.route === '/').checks;
assert.deepEqual(homeChecks.map((check) => check.value), [
  'Adminból módosított főoldali cím',
  'Ez a ténylegesen publikált főoldali leírás.',
]);
assert.equal(homeChecks.some((check) => check.value === 'easyLink ERP'), false, 'live smoke must not fall back to stale seed copy');

const legacyPlan = buildLiveSmokePlan([
  { route: '/', type: 'home', ctaBlock: null },
]);
assert.deepEqual(legacyPlan.contentChecks.find((entry) => entry.route === '/').checks, [], 'v1 metadata remains compatible without stale text assertions');
assert.ok(legacyPlan.routes.includes('/megoldasaink/'), 'core public route invariants remain required');
assert.equal(legacyPlan.routes.includes('/megoldasaink/penzugy-szamlazas/'), false, 'seed-only detail routes are not forced when absent from published metadata');

console.log('Live smoke metadata contract passed: published content drives assertions and v1 metadata remains compatible.');
