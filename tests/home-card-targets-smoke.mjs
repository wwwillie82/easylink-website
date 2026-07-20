import assert from 'node:assert/strict';
import { buildPageIndexById, resolveCardTarget } from '../src/lib/content/card-targets.mjs';

const pages = [
  { id: 1, route: '/old/', title: 'Old title', type: 'solution_detail', status: 'published', seoDescription: 'SEO text' },
  { id: 2, route: '/new-route/', title: 'New title', type: 'audience_detail', status: 'published' },
  { id: 3, route: '/draft/', title: 'Draft', type: 'solution_detail', status: 'draft' },
];
const pagesById = buildPageIndexById(pages);
let card = resolveCardTarget({ target_type: 'page', target_page_id: 1, title_override: null, text_override: 'Override text', badge: 7 }, { pagesById, allowedPageTypes: ['solution_detail'] });
assert.equal(card.title, 'Old title');
assert.equal(card.text, 'Override text');
assert.equal(card.href, '/old/');
pages[0].route = '/renamed/';
card = resolveCardTarget({ target_type: 'page', target_page_id: 1, title_override: 'Override title' }, { pagesById, allowedPageTypes: ['solution_detail'] });
assert.equal(card.title, 'Override title');
assert.equal(card.text, 'SEO text');
assert.equal(card.href, '/renamed/');
assert.equal(resolveCardTarget({ target_type: 'legacy', title: 'Manual', href: '/manual/', text: 'Manual text' }, { pagesById }).href, '/manual/');
assert.equal(resolveCardTarget({ target_type: 'external', title: 'Docs', href: 'https://example.com/docs' }, { pagesById }).href, 'https://example.com/docs');
assert.throws(() => resolveCardTarget({ target_type: 'free', href: '/x/' }, { pagesById }), /Invalid card target_type/);
assert.throws(() => resolveCardTarget({ target_type: 'legacy', href: '/x/', target_page_id: 1 }, { pagesById }), /Legacy kártyához/);
assert.throws(() => resolveCardTarget({ target_type: 'external', href: 'ftp://example.com' }, { pagesById }), /Külső kártya/);
assert.throws(() => resolveCardTarget({ target_type: 'legacy', href: 'javascript:alert(1)' }, { pagesById }), /Legacy kártya/);
assert.throws(() => resolveCardTarget({ target_type: 'page', target_page_id: 3 }, { pagesById, allowedPageTypes: ['solution_detail'] }), /nem publikus/);
assert.throws(() => resolveCardTarget({ target_type: 'page', target_page_id: 2 }, { pagesById, allowedPageTypes: ['solution_detail'] }), /típusa hibás/);
console.log('Home card targets smoke passed: page/legacy/external/strict invalid/route rename.');
