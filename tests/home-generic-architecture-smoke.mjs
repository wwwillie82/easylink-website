import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pageForm, pagesTable } from '../src/lib/admin/render/pages.mjs';
import { homeMiddleContentBlocks, HOME_HERO_META_KEY, HOME_INTRO_KEY, HOME_SOLUTIONS_KEY } from '../src/lib/content/home-blocks.mjs';
const page = { id: 1, route: '/', slug: 'home', type: 'home', title: 'Home', status: 'published', sort_order: 1, seo_title: '', seo_description: '', hero_eyebrow: '', hero_title: '', hero_description: '', hero_asset: '' };
const blocks = [
  { id: 1, page_id: 1, block_key: HOME_HERO_META_KEY, type: 'hero-meta', title: 'Meta', body: '', items: [], status: 'published', sort_order: 0 },
  { id: 2, page_id: 1, block_key: HOME_INTRO_KEY, type: 'split-text', title: 'Intro', body: 'Body', items: [{ version: 1, heading: 'Heading' }], status: 'published', sort_order: 10 },
  { id: 3, page_id: 1, block_key: HOME_SOLUTIONS_KEY, type: 'cards', title: 'Cards', body: 'Body', items: [{ version: 2, cards: [] }], status: 'published', sort_order: 20 },
  { id: 4, page_id: 1, block_key: '/:cta:4', type: 'cta', title: 'CTA', body: '', items: [{ ctaMode: 'global' }], status: 'published', sort_order: 900 },
];
const html = pageForm({ page, blocks, defaultCta: {}, navigationUsages: [], homeEditor: { editor_revision: 'r', pages: [] } });
const order = ['data-page-section="basics"','data-page-section="hero-content"','data-page-section="hero-display"','data-page-section="hero-video"','data-page-section="advanced-seo"','data-page-section="page-cta"','data-page-section="blocks"'].map((needle) => html.indexOf(needle));
assert.ok(order.every((i) => i >= 0), 'all admin sections must render');
assert.deepEqual(order, [...order].sort((a,b)=>a-b), 'admin sections must be ordered');
assert.doesNotMatch(html, /Főoldali canonical tartalom/);
assert.match(html, /split-text/);
assert.match(html, /ai-assistant-preview/);
assert.match(html, /integrations-strip/);
const table = pagesTable([page]);
assert.equal((table.match(/Szerkesztés/g) || []).length, 1);
assert.doesNotMatch(table, /Főoldal szerkesztése/);
const middle = homeMiddleContentBlocks({ page: { ...page, blocks }, mode: 'db-authoritative', routeIndex: { pages: [] } });
assert.deepEqual(middle.map((b)=>b.type), ['split-text','cards']);
const indexSource = await readFile('src/pages/index.astro', 'utf8');
assert.match(indexSource, /<Hero[\s\S]*<ContentBlocks[\s\S]*<CTASection/);
console.log('home generic architecture smoke ok');
