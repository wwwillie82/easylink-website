import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { pagesTable, pageForm } from '../src/lib/admin/render/pages.mjs';
import { navHtml } from '../src/lib/admin/render/menu.mjs';
import { settingsAdminJs, settingsPanel } from '../src/lib/admin/render/settings.mjs';
import { normalizeSiteSettings, publicBrand } from '../src/lib/admin/settings.mjs';

const pagesHtml = pagesTable([{ id: 1, title: 'Rólunk', route: '/rolunk/', type: 'content_page', status: 'draft', sort_order: 1 }]);
assert.match(pagesHtml, /data-pages-section="create"[\s\S]*Új oldal létrehozása/);
assert.match(pagesHtml, /data-pages-section="existing"[\s\S]*Meglévő oldalak/);
assert.equal((pagesHtml.match(/<section class="admin-section" data-pages-section=/g) || []).length, 2);

const page = { id: 1, title: 'Rólunk', route: '/rolunk/', status: 'draft', type: 'content_page', slug: 'rolunk', sort_order: 1, hero_eyebrow: '', hero_asset: '', hero_title: '', hero_description: '', seo_title: '', seo_description: '', hero_video: '' };
const formHtml = pageForm({ page, blocks: [{ id: 3, page_id: 1, type: 'text', title: 'Intro', body: 'Body', items: '[]', status: 'published', sort_order: 1 }] });
for (const section of ['basics','hero-content','hero-display','hero-video','advanced-seo','blocks']) assert.match(formHtml, new RegExp(`data-page-section="${section}"`));
const pageFormOnly = formHtml.match(/<form class="admin-form" id="page-form">[\s\S]*?<\/form>/)?.[0] || '';
assert.equal((pageFormOnly.match(/type="submit"/g) || []).length, 1);
assert.match(pageFormOnly, /<div class="admin-save-bar">[\s\S]*Mentés és élesítés/);
assert.match(navHtml([]), /<form class="admin-form admin-section" id="nav-form">[\s\S]*<div class="admin-save-bar">/);

const settings = normalizeSiteSettings({ brand: { headerLogoPath: '/assets/site-media/old-header.png', footerLogoPath: '/assets/site-media/old-footer.png' } });
const settingsHtml = settingsPanel(settings);
assert.match(settingsHtml, /data-logo-card="header"[^>]*data-logo-input="brand\.headerLogoPath"/);
assert.match(settingsHtml, /data-logo-current-path/);
assert.match(settingsHtml, /data-logo-preview/);
assert.match(settingsHtml, /data-logo-fallback/);
assert.equal(publicBrand(settings).headerLogoPath, '/assets/site-media/old-header.png');

function makeInput(name, value = '') {
  const listeners = {};
  return { name, value, listeners, addEventListener(type, fn) { listeners[type] = fn; }, dispatchEvent(event) { listeners[event.type]?.(event); } };
}
const headerInput = makeInput('brand.headerLogoPath', '/assets/site-media/old-header.png');
const footerInput = makeInput('brand.footerLogoPath', '/assets/site-media/old-footer.png');
const headerCurrent = { textContent: '', hidden: false };
const footerCurrent = { textContent: '', hidden: false };
const headerPreview = { src: '', hidden: false };
const footerPreview = { src: '', hidden: false };
const headerFallback = { hidden: true };
const footerFallback = { hidden: true };
const headerCard = { querySelector(sel) { return ({ '[data-logo-current-path]': headerCurrent, '[data-logo-preview]': headerPreview, '[data-logo-fallback]': headerFallback })[sel] || null; } };
const footerCard = { querySelector(sel) { return ({ '[data-logo-current-path]': footerCurrent, '[data-logo-preview]': footerPreview, '[data-logo-fallback]': footerFallback })[sel] || null; } };
const form = { elements: {}, querySelector(sel) { return sel === 'button[type="submit"]' ? { disabled: false } : null; }, addEventListener() {} };
const documentForLogo = {
  getElementById(id) { return id === 'settings-form' ? form : id === 'msg' ? { innerHTML: '' } : null; },
  querySelector(sel) {
    if (sel === '[data-logo-input="brand.headerLogoPath"]') return headerCard;
    if (sel === '[data-logo-input="brand.footerLogoPath"]') return footerCard;
    return null;
  },
  querySelectorAll(sel) {
    if (sel === 'input[name="brand.headerLogoPath"],input[name="brand.footerLogoPath"]') return [headerInput, footerInput];
    return [];
  },
  addEventListener() {},
};
vm.runInNewContext(settingsAdminJs(), { document: documentForLogo, Event: class Event { constructor(type) { this.type = type; } }, FormData: class FormData {} });
headerInput.value = '/assets/site-media/new-header.png';
headerInput.dispatchEvent(new Event('input'));
assert.equal(headerCurrent.textContent, '/assets/site-media/new-header.png');
assert.equal(headerPreview.src, '/assets/site-media/new-header.png');
assert.equal(footerCurrent.textContent, '/assets/site-media/old-footer.png');
headerInput.value = '';
headerInput.dispatchEvent(new Event('change'));
assert.equal(headerInput.value, '');
assert.equal(headerPreview.hidden, true);
assert.equal(headerFallback.hidden, false);

const layout = await readFile('src/lib/admin/render/layout.mjs', 'utf8');
assert.match(layout, /\.admin-grid--social\{grid-template-columns:repeat\(3,minmax\(220px,1fr\)\)\}/);
assert.match(layout, /@media\(max-width:980px\)\{\.admin-grid--social\{grid-template-columns:repeat\(2,minmax\(220px,1fr\)\)\}\}/);
assert.match(layout, /@media\(max-width:680px\)\{\.admin-grid,\.grid,\.admin-grid--compact,\.admin-grid--social\{grid-template-columns:1fr\}/);
assert.match(layout, /\.admin-form\{padding-bottom:140px\}/);
assert.match(layout, /scroll-margin-bottom:160px/);

for (const text of ['dirty-state','payload','stabil platform ID','public Header komponens','public Footer komponens','meglévő publish visszajelzés fut']) {
  assert.doesNotMatch(settingsHtml.replace(/<script>[\s\S]*?<\/script>/g, ''), new RegExp(text));
}
console.log('Admin A1c UI smoke passed.');
