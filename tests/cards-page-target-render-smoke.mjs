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
console.log('Cards page-target render smoke passed: public resolver uses route index without persisting href.');
