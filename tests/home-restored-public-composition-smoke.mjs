import assert from 'node:assert/strict';
import { homeMiddleContentBlocks } from '../src/lib/content/home-blocks.mjs';
import { isRecognizedPageCta } from '../src/lib/content/page-cta-contract.mjs';

const page = { id: 10, route: '/', type: 'home', title: 'Home' };
const preRestoreBlocks = [
  { id: 139, page_id: 10, block_key: 'home:intro', type: 'split-text', title: 'Intro', body: 'Split intro', items: [], status: 'archived', sort_order: 100 },
  { id: 140, page_id: 10, block_key: 'home:solutions', type: 'cards', title: 'Megoldásaink', body: 'Solutions', items: [], status: 'archived', sort_order: 110 },
  { id: 141, page_id: 10, block_key: 'home:ai-assistant', type: 'ai-assistant-preview', title: 'AI assistant', body: 'AI', items: [], status: 'archived', sort_order: 120 },
  { id: 142, page_id: 10, block_key: 'home:integrations', type: 'integrations-strip', title: 'Integrációs adatáramlás', body: 'Integrations', items: [], status: 'archived', sort_order: 130 },
  { id: 143, page_id: 10, block_key: 'home:audiences', type: 'cards', title: 'Kinek szól?', body: 'Audiences', items: [], status: 'archived', sort_order: 140 },
  ...[1, 27, 28, 29].map((id) => ({ id, page_id: 10, block_key: `old:${id}`, type: 'text', title: `Old duplicate ${id}`, body: 'Should not render', items: [], status: 'published', sort_order: id })),
  { id: 30, page_id: 10, block_key: '/:cta:4', type: 'cta', title: 'CTA', body: 'CTA body', items: [{ ctaMode: 'custom', label: 'Demót kérek', url: '/demo/' }], status: 'published', sort_order: 900 },
  { id: 100, page_id: 10, block_key: 'home:hero-meta', type: 'hero-meta', title: 'Hero meta', body: '', items: [], status: 'published', sort_order: 0 },
  { id: 88, page_id: 10, block_key: 'manual:archived-control', type: 'text', title: 'Archived control', body: 'Control', items: [], status: 'archived', sort_order: 88 },
];
assert.equal(preRestoreBlocks.length, 12);
const restoredBlocks = preRestoreBlocks.map((block) => ({ ...block, status: [139, 140, 141, 142, 143].includes(block.id) ? 'published' : ([1, 27, 28, 29].includes(block.id) ? 'archived' : block.status) }));
const middle = homeMiddleContentBlocks({ page: { ...page, blocks: restoredBlocks }, routeIndex: { pages: [] } });
assert.deepEqual(middle.map((block) => block.id), [139, 140, 141, 142, 143]);
assert.deepEqual(middle.map((block) => block.block_key), ['home:intro', 'home:solutions', 'home:ai-assistant', 'home:integrations', 'home:audiences']);
for (const id of [1, 27, 28, 29, 30, 88, 100]) assert.equal(middle.some((block) => block.id === id), false, `id=${id} must not be a middle block`);
assert.equal(isRecognizedPageCta(restoredBlocks.find((block) => block.id === 30)), true);

function renderFixture(blocks) {
  const middleHtml = homeMiddleContentBlocks({ page: { ...page, blocks }, routeIndex: { pages: [] } }).map((block) => `<section data-content-block-section="${block.type}" data-block-id="${block.id}">${block.title}</section>`).join('');
  const cta = blocks.find((block) => block.status !== 'archived' && isRecognizedPageCta(block));
  return `<main><header>Header</header><section data-hero>Hero</section>${middleHtml}${cta ? `<section data-cta="page" data-block-id="${cta.id}">${cta.title}</section>` : ''}<footer>Footer</footer></main>`;
}
const html = renderFixture(restoredBlocks);
const count = (needle) => (html.match(new RegExp(needle, 'g')) || []).length;
assert.equal(count('data-content-block-section="split-text"'), 1);
assert.equal(count('Megoldásaink'), 1);
assert.equal(count('data-content-block-section="ai-assistant-preview"'), 1);
assert.equal(count('data-content-block-section="integrations-strip"'), 1);
assert.equal(count('Kinek szól\\?'), 1);
assert.equal(count('data-cta="page"'), 1);
assert.doesNotMatch(html, /Old duplicate|Archived control|home:hero-meta/);
console.log('Home restored public composition smoke passed.');
