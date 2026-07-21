import assert from 'node:assert/strict';
import { pageForm, pagesTable } from '../src/lib/admin/render/pages.mjs';
import { blockForm, pageEditorJs, serializeEditorItems } from '../src/lib/admin/render/blocks.mjs';
const page = { id: 1, route: '/', slug: 'home', type: 'home', title: 'Home', status: 'published', sort_order: 0, seo_title: 'SEO', seo_description: '', hero_eyebrow: 'Ey', hero_title: 'Title', hero_description: 'Desc', hero_asset: '/a.webp' };
const blocks = [
  { id: 1, page_id: 1, block_key: 'home:hero-meta', type: 'hero-meta', title: 'Meta', body: '', items: [], status: 'published', sort_order: 0 },
  { id: 2, page_id: 1, block_key: 'home:intro', type: 'split-text', title: 'Intro', body: 'Body', items: [{ version: 1, heading: 'Heading' }], status: 'published', sort_order: 10 },
  { id: 3, page_id: 1, block_key: 'home:solutions', type: 'cards', title: 'Cards', body: 'Body', items: [{ version: 2, variant: 'default', cards: [] }], status: 'published', sort_order: 20 },
  { id: 4, page_id: 1, block_key: '/:cta:4', type: 'cta', title: 'CTA', body: '', items: [{ ctaMode: 'global' }], status: 'published', sort_order: 900 },
];
const html = pageForm({ page, blocks, defaultCta: { title: 'G' }, navigationUsages: [], homeEditor: { editor_revision: 'r', pages: [{ id: 2, title: 'Target', route: '/target/', type: 'content_page', status: 'published' }] } });
const sections = ['basics','hero-content','hero-display','hero-video','advanced-seo','page-cta','blocks'].map((name)=>html.indexOf(`data-page-section="${name}"`));
assert.ok(sections.every((index)=>index >= 0));
assert.deepEqual(sections, [...sections].sort((a,b)=>a-b));
assert.doesNotMatch(html, /data-page-section="home-canonical"/);
for (const type of ['text','split-text','cards','ai-assistant-preview','integrations-strip']) assert.match(html, new RegExp(`value="${type}"`));
assert.doesNotMatch(html, /home:hero-meta[\s\S]*data-move-block/);
assert.match(html, /data-page-cta-editor/);
assert.match(html, /data-home-preview[^>]*>Előnézet/);
assert.match(html, /data-home-publish[^>]*>Élesítés/);
assert.match(html, />Mentés</);
const contentBlocksHtml = html.slice(html.indexOf('data-page-section="blocks"'));
assert.doesNotMatch(contentBlocksHtml, /Mentés és élesítés|Mentés a főoldallal/);
assert.match(html, /data-split-text-editor/);
assert.match(html, /data-split-heading/);
assert.match(html, /data-split-layout/);
assert.match(html, /data-ai-assistant-editor/);
assert.match(html, /data-ai-assistant-sources/);
assert.match(html, /data-ai-message-role/);
assert.match(html, /data-integrations-strip-editor/);
assert.match(html, /data-integration-row/);
assert.doesNotMatch(html.match(/data-split-text-editor[\s\S]*?<\/form>/)?.[0] || '', /data-item-title/);
assert.doesNotMatch(html.match(/data-ai-assistant-editor[\s\S]*?<\/form>/)?.[0] || '', /data-ai-kind/);
assert.doesNotMatch(html, /Belső oldal ID/);

const cardsStart = html.lastIndexOf('<form class="card block-form', html.indexOf('block_key" value="home:solutions"'));
const cardsEnd = html.indexOf('</form>', html.indexOf('block_key" value="home:solutions"'));
const cardsFormHtml = cardsStart >= 0 && cardsEnd >= 0 ? html.slice(cardsStart, cardsEnd + 7) : '';
assert.ok(cardsFormHtml, 'server-rendered cards form should be present');
assert.doesNotMatch(cardsFormHtml, /data-item-url|Cél URL \/ slug/);
assert.match(cardsFormHtml, /data-card-target-href/);
assert.match(cardsFormHtml, /Target — \/target\/ — content_page/);

const js = pageEditorJs(1, { isHome: true });
assert.match(js, /syncPageCtaUi\(f\)/);
assert.ok(js.includes("fetch('/api/admin/pages/1/home"));
assert.match(js, /if\(!r\.ok\|\|!j\?\.ok\)/);
assert.match(js, /throw new Error\(message\)/);
assert.match(js, /Elavult szerkesztői állapot/);
assert.match(js, /A szerver válasza nem értelmezhető/);
assert.match(js, /ps\.markSaved\(\);document\.querySelectorAll/);
assert.match(js, /data-home-preview/);
assert.ok(js.includes("window.open('/admin/pages/1/home/preview/"));
assert.ok(js.includes("fetch('/api/admin/publish"));
assert.ok(js.includes(".block-form button[type=\"submit\"]')") && js.includes('=>b.remove()'));
assert.match(js, /dataset\.addAiSource/);
assert.match(js, /dataset\.addAiMessage/);
assert.match(js, /dataset\.addIntegration/);
assert.match(js, /function syncCardTargetUi/);
assert.match(js, /function cardTargetHtml/);
assert.match(js, /function cardsActionHtml/);
assert.match(js, /function ensureCardsEditor/);
assert.match(js, /data-card-target-page/);
assert.match(js, /data-card-target-href/);
assert.doesNotMatch(js.match(/function rowHtml[\s\S]*?function syncRow/)?.[0] || '', /data-item-url|Cél URL \/ slug/);
assert.doesNotMatch(js.match(/type==='cards'\?\[[^;]+/)?.[0] || '', /item-url/);
assert.doesNotMatch(js, /querySelector\('\[data-item-url\]'\)\?\.value\|\|r\.querySelector\('\[data-card-target-href\]'\)/);
assert.match(js, /data-cards-action-editor/);
assert.match(js, /pageTargetOptions/);
assert.match(html, /data-page-target-options/);
assert.match(html, /value="card-grid"/);

const cardGridHtml = blockForm({ page_id: 1, type: 'card-grid', title: 'Grid', body: '', items: [{ version: 2, cards: [{ target_type: 'external', href: 'https://example.com', title: 'Ext' }], action: null }], status: 'published', sort_order: 1 }, { pageTargetPages: [{ id: 2, title: 'Target', route: '/target/', type: 'content_page', status: 'published' }] });
assert.doesNotMatch(cardGridHtml, /data-item-url|Cél URL \/ slug/);
assert.match(cardGridHtml, /data-card-target-href/);
const pageCards = serializeEditorItems({ type: 'cards', rows: [{ raw: { href: '/old/', target_page_id: 9 }, target_type: 'page', target_page_id: '2', url: '', title: 'Page' }] })[0].cards[0];
assert.equal(pageCards.target_page_id, '2');
assert.equal(pageCards.href, undefined);
const legacyCards = serializeEditorItems({ type: 'cards', rows: [{ raw: { target_page_id: 9 }, target_type: 'legacy', target_page_id: '', url: '/legacy/', title: 'Legacy' }] })[0].cards[0];
assert.equal(legacyCards.href, '/legacy/');
assert.equal(legacyCards.target_page_id, undefined);
const externalCards = serializeEditorItems({ type: 'cards', rows: [{ raw: {}, target_type: 'external', target_page_id: '', url: 'https://example.com', title: 'External' }] })[0].cards[0];
assert.equal(externalCards.href, 'https://example.com');
assert.equal(externalCards.target_page_id, undefined);
const actionPage = serializeEditorItems({ type: 'cards', rows: Object.assign([], { action: { enabled: true, target_type: 'page', target_page_id: '2', href: '/stale/', label: 'Go' } }) })[0].action;
assert.equal(actionPage.target_page_id, '2');
assert.equal(actionPage.href, undefined);
const actionLegacy = serializeEditorItems({ type: 'cards', rows: Object.assign([], { action: { enabled: true, target_type: 'legacy', target_page_id: '2', href: '/go/', label: 'Go' } }) })[0].action;
assert.equal(actionLegacy.href, '/go/');
assert.equal(actionLegacy.target_page_id, undefined);

assert.doesNotMatch(js, /Mentés a főoldallal/);
const table = pagesTable([page]);
assert.equal((table.match(/Szerkesztés/g) || []).length, 1);
assert.doesNotMatch(table, /Főoldal szerkesztése/);
console.log('Admin home UI smoke passed: generic home admin, section order, CTA and single edit action.');
