import assert from 'node:assert/strict';
import { normalizeCardsItems, publicCardsFromItems } from '../src/lib/content/block-contracts.mjs';
import { buildPageIndexById, resolveCardTarget } from '../src/lib/content/card-targets.mjs';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>\"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const renderAction = (action) => action?.href ? `<p class="more"><a class="button button-secondary" href="${escapeHtml(action.href)}">${escapeHtml(action.label)}</a></p>` : '';

const routeIndex = { pages: [{ id: 30, route: '/megoldasaink/', title: 'Megoldásaink', type: 'solutions_index' }] };
const items = [{ version: 2, variant: 'default', cards: [{ title: 'Kártya', target_type: 'legacy', href: '/x/' }], action: { label: 'Összes megoldás', target_type: 'page', target_page_id: 30 } }];

const previous = (() => {
  try { resolveCardTarget({ ...items[0].action, kind: 'section-action', title: items[0].action.label, label: items[0].action.label }, { pagesById: buildPageIndexById(routeIndex.pages), itemIndex: 1 }); return null; }
  catch (error) { return error; }
})();
assert.equal(previous?.code, 'CARD_TARGET_PAGE_NOT_PUBLISHED');
assert.deepEqual(routeIndex.pages[0], { id: 30, route: '/megoldasaink/', title: 'Megoldásaink', type: 'solutions_index' });

const normalized = normalizeCardsItems(items, { pages: routeIndex.pages })[0];
assert.equal(normalized.action.label, 'Összes megoldás');
assert.equal(normalized.action.target_type, 'page');
assert.equal(normalized.action.target_page_id, 30);
assert.equal(Object.hasOwn(normalized.action, 'href'), false, 'page-target action contract must not persist a derived href');

const vm = publicCardsFromItems(items, { pages: routeIndex.pages });
assert.equal(vm.action.label, 'Összes megoldás');
assert.equal(vm.action.href, '/megoldasaink/');
const html = renderAction(vm.action);
assert.equal((html.match(/Összes megoldás/g) || []).length, 1);
assert.equal((html.match(/href="\/megoldasaink\/"/g) || []).length, 1);

const renamed = publicCardsFromItems(items, { pages: [{ ...routeIndex.pages[0], route: '/uj-megoldasok/' }] });
assert.equal(renamed.action.href, '/uj-megoldasok/');
assert.equal(publicCardsFromItems([{ version: 2, cards: [], action: { label: 'Legacy', target_type: 'legacy', href: '/legacy/' } }], { pages: routeIndex.pages }).action.href, '/legacy/');
assert.equal(publicCardsFromItems([{ version: 2, cards: [], action: { label: 'External', target_type: 'external', href: 'https://example.com/' } }], { pages: routeIndex.pages }).action.href, 'https://example.com/');
assert.throws(() => publicCardsFromItems([{ version: 2, cards: [], action: { label: 'Missing', target_type: 'page', target_page_id: 999 } }], { pages: routeIndex.pages }), /nem található|missing/i);

const fallbackPages = [{ id: 31, route: '/page-card/', title: 'Publikus oldal címe', type: 'solution', status: 'published' }];
const fallbackItems = [{
  version: 2,
  cards: [
    { target_type: 'page', target_page_id: 31, title: 'Tárolt canonical cím', title_override: '   ', text: 'Page canonical leírás', text_override: '' },
    { target_type: 'legacy', href: '/legacy-card/', title: 'Legacy canonical cím', title_override: '', text: 'Legacy canonical leírás', text_override: '   ' },
    { target_type: 'external', href: 'https://example.com/card', title: 'External canonical cím', title_override: '   ', text: 'External canonical leírás', text_override: '' },
    { target_type: 'page', target_page_id: 31, title: 'Tárolt cím', title_override: 'Override oldal címe', text: 'Tárolt leírás', text_override: 'Override oldal leírása' }
  ],
  action: null
}];

const normalizedFallback = normalizeCardsItems(fallbackItems)[0].cards;
assert.deepEqual(normalizedFallback.map(({ title, title_override, text, text_override }) => ({ title, title_override, text, text_override })), [
  { title: 'Tárolt canonical cím', title_override: '', text: 'Page canonical leírás', text_override: '' },
  { title: 'Legacy canonical cím', title_override: '', text: 'Legacy canonical leírás', text_override: '' },
  { title: 'External canonical cím', title_override: '', text: 'External canonical leírás', text_override: '' },
  { title: 'Override oldal címe', title_override: 'Override oldal címe', text: 'Override oldal leírása', text_override: 'Override oldal leírása' }
]);

const fallbackVm = publicCardsFromItems(fallbackItems, { pages: fallbackPages });
assert.deepEqual(fallbackVm.cards.map(({ title, text }) => ({ title, text })), [
  { title: 'Publikus oldal címe', text: 'Page canonical leírás' },
  { title: 'Legacy canonical cím', text: 'Legacy canonical leírás' },
  { title: 'External canonical cím', text: 'External canonical leírás' },
  { title: 'Override oldal címe', text: 'Override oldal leírása' }
]);

console.log('Cards page-target render smoke passed: public resolver uses route index and empty overrides fall back to canonical fields.');
