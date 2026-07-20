import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { pageForm } from '../src/lib/admin/render/pages.mjs';
import { movedBlockOrder, pageEditorJs } from '../src/lib/admin/render/blocks.mjs';
import { blockHasRole, findRoleBlock } from '../src/lib/content/block-role-contract.mjs';
import { isCanonicalCtaSection, isPricingCta, assertSingleCanonicalCta } from '../src/lib/content/cta-contract.mjs';

const home = readFileSync('src/pages/index.astro', 'utf8');
assert.match(home, /homeCtaBlock/);
assert.match(home, /resolvePageCtaBlock\(homePage\?\.blocks, \{ role: 'home-legacy-cta' \}\)/);
assert.match(home, /<CTASection block=\{homeCtaBlock\} \/>/);
assert.doesNotMatch(home, /<CTASection\s*\/>/);

const ctaSection = readFileSync('src/components/CTASection.astro', 'utf8');
assert.match(ctaSection, /const shouldRender = Boolean\(block && cta/);
assert.doesNotMatch(ctaSection, /Készen állsz könnyedebben vezetni a céged\?/);
assert.doesNotMatch(ctaSection, /deployUrl/);

const dbDefault = { eyebrow: 'DB eyebrow', title: 'DB title', description: 'DB body', primaryLabel: 'Demót kérnék', primaryUrl: '/db-demo/', secondaryLabel: 'DB secondary', secondaryUrl: '/db-secondary/' };
const page = { id: 55, route: '/uj/', slug: 'uj', type: 'content_page', title: 'Új', status: 'draft', sort_order: 10, seo_title: '', seo_description: '', hero_eyebrow: '', hero_title: '', hero_description: '', hero_asset: '' };
const html = pageForm({ page, blocks: [], defaultCta: dbDefault, navigationUsages: [] });
assert.match(html, /CTA létrehozása az alapértelmezett sablonból/);
assert.match(html, /Demót kérnék/);
assert.doesNotMatch(html, /Demót kérek/);
assert.match(html, /data-template-create="true"/);
assert.match(html, /name="block_key" value="golden:cta-section"/);
assert.match(pageEditorJs(55), /forceTemplateCreate/);

assert.throws(() => pageForm({ page, defaultCta: dbDefault, navigationUsages: [], blocks: [
  { id: 1, page_id: 55, block_key: 'golden:cta-section', type: 'cta', items: JSON.stringify([{ presentationRole: 'cta-section' }]), status: 'published', sort_order: 900 },
  { id: 2, page_id: 55, block_key: 'manual:cta-section-copy', type: 'cta', items: JSON.stringify([{ presentationRole: 'cta-section' }]), status: 'draft', sort_order: 901 },
] }), (error) => error?.code === 'CTA_INTEGRITY_ERROR');

assert.equal(isCanonicalCtaSection({ block_key: 'golden:cta-section', items: '[]' }), true);
assert.equal(isCanonicalCtaSection({ block_key: 'manual:has:cta-section', items: '[]' }), false);
assert.equal(isCanonicalCtaSection({ block_key: 'manual:null-string', items: 'null' }), false);
assert.equal(isCanonicalCtaSection({ block_key: 'manual:null-value', items: null }), false);
assert.equal(isCanonicalCtaSection({ block_key: 'manual:bad-json', items: '[{bad json]' }), false);
assert.equal(isCanonicalCtaSection({ block_key: 'manual:object-json', items: '{\"presentationRole\":\"cta-section\"}' }), false);
assert.equal(isCanonicalCtaSection({ block_key: 'manual:string-json', items: '\"cta-section\"' }), false);
assert.equal(isCanonicalCtaSection({ block_key: 'manual:number-json', items: '42' }), false);
assert.equal(isCanonicalCtaSection({ block_key: 'manual:boolean-json', items: 'true' }), false);
assert.equal(isCanonicalCtaSection({ block_key: 'manual:array-role', items: JSON.stringify([{ presentationRole: 'cta-section' }]) }), true);
assert.equal(isCanonicalCtaSection({ block_key: 'manual:x', items: JSON.stringify([{ presentationRole: 'cta-section' }]) }), true);
assert.equal(blockHasRole({ block_key: 'manual:has:cta-section', items: [] }, 'cta-section'), false);
assert.equal(blockHasRole({ block_key: 'manual:x', items: [{ role: 'cta-section' }] }, 'cta-section'), true);
assert.equal(isPricingCta({ block_key: '/arak/:cta:2', items: JSON.stringify([{ label: 'Demo' }]) }), false);
assert.equal(isPricingCta({ block_key: '/arak/:cta:2', items: JSON.stringify([{ presentationRole: 'pricing-cta' }]) }), true);
assert.equal(findRoleBlock([{ block_key: 'manual:x', type: 'cta', status: 'published', items: [{ label: 'not canonical' }] }], 'cta-section'), undefined);
assert.throws(() => assertSingleCanonicalCta([{ block_key: 'golden:cta-section', items: [] }, { block_key: 'manual:x', items: [{ role: 'cta-section' }] }]), (error) => error?.code === 'CTA_INTEGRITY_ERROR');

const moved = movedBlockOrder([
  { node: 'fixed-before', fixed: true, sortOrder: 10 },
  { node: 'content-10', fixed: false, sortOrder: 20 },
  { node: 'content-20', fixed: false, sortOrder: 30 },
  { node: 'fixed-after', fixed: true, sortOrder: 900 },
], 2, 'up');
assert.equal(moved.sortOrder, 15);
assert.doesNotThrow(() => movedBlockOrder([
  { node: 'fixed-before', fixed: true, sortOrder: 10 },
  { node: 'content-10', fixed: false, sortOrder: 20 },
  { node: 'content-20', fixed: false, sortOrder: 30 },
  { node: 'fixed-after', fixed: true, sortOrder: 900 },
], 2, 'up'));
assert.match(pageEditorJs(55), /\[data-page-section="blocks"\] \.block-form/);
assert.doesNotMatch(pageEditorJs(55), /document\.querySelectorAll\('\.block-form'\)\.map/);

const repo = readFileSync('src/lib/admin/repository.mjs', 'utf8');
assert.match(repo, /beginTransaction\(\)/);
assert.match(repo, /canonicalCtaBlockFromDefault\(settings\.defaultCta\)/);
assert.match(repo, /INSERT INTO site_content_blocks/);
assert.match(repo, /rollback\(\)/);

{
  const runtime = pageEditorJs(77);
  const events = {};
  let reloads = 0;
  const fetchCalls = [];
  const msg = { innerHTML: '', textContent: '', querySelector() { return null; }, insertAdjacentHTML(_p, h) { this.innerHTML += h; }, appendChild(node) { this.lastChild = node; this.textContent = node.textContent; } };
  const makeInput = (value = '') => ({ value, disabled: false, checked: false, matches(sel) { return sel === '[name=type]' && this.name === 'type'; }, addEventListener() {}, dispatchEvent() {} });
  function makeForm({ template = false, id = '', title = 'CTA' } = {}) {
    const submit = { disabled: false, type: 'submit' };
    const fields = {
      id: makeInput(id), page_id: makeInput('77'), block_key: makeInput(template ? 'golden:cta-section' : 'manual:existing'), type: makeInput('cta'), title: makeInput(title), body: makeInput('Body'), items: makeInput(JSON.stringify([{ eyebrow: 'E', label: 'L', url: '/u/', secondaryLabel: 'S', secondaryUrl: '/s/', presentationRole: template ? 'cta-section' : undefined }])), sort_order: makeInput(template ? '900' : '10'), status: makeInput('published'),
      ctaEyebrow: makeInput('E'), ctaLabel: makeInput('L'), ctaUrl: makeInput('/u/'), ctaSecondaryLabel: makeInput('S'), ctaSecondaryUrl: makeInput('/s/'), blockType: makeInput('cta'),
    };
    fields.type.name = 'type';
    const panels = ['common','cta'].map((panel) => ({ dataset: { panel }, hidden: false, classList: { toggle() {} }, removeAttribute() {}, setAttribute() {}, querySelectorAll() { return []; } }));
    return {
      dataset: { templateCreate: template ? 'true' : undefined, initialBlockType: 'cta', itemsTouched: 'false' }, submit, fields, onsubmit: null, onclick: null,
      addEventListener(type, fn) { events[(template ? 'template' : 'existing') + ':' + type] = fn; },
      dispatchEvent() {},
      querySelector(selector) {
        if (selector === 'button[type="submit"]') return submit;
        if (selector === 'input[name="id"]') return fields.id;
        if (selector === 'input[name="items"]') return fields.items;
        if (selector.startsWith('[data-panel=')) return { dataset: { panel: selector.slice(13, -2) }, hidden: false, classList: { toggle() {} }, removeAttribute() {}, setAttribute() {}, querySelectorAll() { return []; } };
        if (selector === '[data-block-type]') return fields.blockType;
        if (selector === '[data-cta-eyebrow]') return fields.ctaEyebrow;
        if (selector === '[data-cta-label]') return fields.ctaLabel;
        if (selector === '[data-cta-url]') return fields.ctaUrl;
        if (selector === '[data-cta-secondary-label]') return fields.ctaSecondaryLabel;
        if (selector === '[data-cta-secondary-url]') return fields.ctaSecondaryUrl;
        if (selector === 'input[name="sort_order"]') return fields.sort_order;
        return null;
      },
      querySelectorAll(selector) {
        if (selector === '[data-panel]') return panels;
        if (selector === '[data-item-row]') return [];
        if (selector === 'input,textarea,select,button') return Object.values(fields);
        return [];
      },
    };
  }
  const templateForm = makeForm({ template: true });
  const existingForm = makeForm({ id: '123', title: 'Existing' });
  const pageFormMock = { addEventListener() {}, querySelector(selector) { return selector === 'button[type="submit"]' ? { disabled: false } : null; }, querySelectorAll() { return []; } };
  const document = {
    getElementById(id) { return id === 'msg' ? msg : id === 'page-form' ? pageFormMock : null; },
    querySelectorAll(selector) { return selector === '.block-form' ? [templateForm, existingForm] : []; },
    querySelector() { return null; },
    createElement() { return { className: '', textContent: '' }; },
  };
  class FormDataMock {
    constructor(form) { this.form = form; }
    *[Symbol.iterator]() { for (const key of ['id','page_id','block_key','type','title','body','items','sort_order','status']) yield [key, this.form.fields?.[key]?.value ?? '']; }
  }
  const context = { document, location: { reload() { reloads += 1; } }, history: { replaceState() {} }, FormData: FormDataMock, URLSearchParams, Event: class Event { constructor(type) { this.type = type; } }, fetch: async (url, options) => { fetchCalls.push({ url, options }); return { async json() { return { ok: true, data: { id: 999 }, publish: { ok: true } }; } }; } };
  vm.runInNewContext(runtime, context);
  assert.equal(templateForm.submit.disabled, false, 'template create submit starts enabled');
  assert.equal(existingForm.submit.disabled, true, 'normal unchanged existing block submit stays disabled');
  await templateForm.onsubmit({ preventDefault() {} });
  assert.equal(fetchCalls.length, 1, 'template submit performs exactly one POST');
  assert.equal(fetchCalls[0].url, '/api/admin/blocks');
  assert.equal(JSON.parse(fetchCalls[0].options.body).block_key, 'golden:cta-section');
  assert.equal(reloads, 1, 'template create reloads after successful insert');
  await templateForm.onsubmit({ preventDefault() {} });
  assert.equal(fetchCalls.length, 1, 'reload path prevents second insert in current UI lifecycle');
}


console.log('CTA lifecycle regression smoke passed: home CTA block, admin DB default, template create, role detection, move isolation, repository rollback source.');
