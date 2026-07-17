import assert from 'node:assert/strict';
import vm from 'node:vm';
import { normalizeSiteSettings } from '../src/lib/admin/settings.mjs';
import { settingsAdminJs, settingsPanel } from '../src/lib/admin/render/settings.mjs';
import { mediaPickerJs } from '../src/lib/admin/render/media.mjs';

const legacyPath = '/assets/site-media/2026/07/privacy.pdf';
const html = settingsPanel(normalizeSiteSettings({ legalDocuments: { privacyPdfPath: legacyPath } }));
const targets = [...html.matchAll(/data-media-picker-target="([^"]+)"/g)].map((m) => m[1]);
assert.deepEqual(targets, ['#brand-header-logo-path', '#brand-footer-logo-path', '#legal-terms-pdf-path', '#legal-privacy-pdf-path', '#legal-cookie-pdf-path']);
assert.equal(targets.every((target) => /^#[A-Za-z][\w-]*$/.test(target)), true);
assert.equal(targets.some((target) => target.includes('brand.headerLogoPath') || target.includes('legalDocuments.privacy.pdfPath')), false);
assert.match(html, /id="legal-privacy-pdf-path" name="legalDocuments\.privacy\.pdfPath" value="\/assets\/site-media\/2026\/07\/privacy\.pdf"/);
assert.equal((html.match(/data-clear-doc="termsPdfPath"/g) || []).length, 1);
assert.equal((html.match(/data-clear-doc="privacyPdfPath"/g) || []).length, 1);
assert.equal((html.match(/data-clear-doc="cookiePdfPath"/g) || []).length, 1);
assert.equal((html.match(/data-clear-media-input="legalDocuments\.(terms|privacy|cookie)\.pdfPath"/g) || []).length, 0);
assert.doesNotMatch(html, /name="legalDocuments\.privacyPdfPath"/);

function input(name, value = '') { return { name, value, checked: false, addEventListener() {}, dispatchEvent() {} }; }
const elements = {
  'analytics.enabled': { ...input('analytics.enabled'), checked: false },
  'analytics.provider': input('analytics.provider', 'none'),
  'analytics.ga4MeasurementId': input('analytics.ga4MeasurementId'),
  'analytics.consentMode': input('analytics.consentMode', 'basic'),
  'analytics.consentConfigurationVersion': input('analytics.consentConfigurationVersion', '1'),
  'legalDocuments.terms.label': input('legalDocuments.terms.label', 'Általános Szerződési Feltételek'),
  'legalDocuments.terms.pdfPath': input('legalDocuments.terms.pdfPath', '/assets/site-media/2026/07/terms.pdf'),
  'legalDocuments.terms.active': { ...input('legalDocuments.terms.active'), checked: true },
  'legalDocuments.terms.order': input('legalDocuments.terms.order', '1'),
  'legalDocuments.privacy.label': input('legalDocuments.privacy.label', 'Adatkezelési Tájékoztató'),
  'legalDocuments.privacy.pdfPath': input('legalDocuments.privacy.pdfPath'),
  'legalDocuments.privacy.active': { ...input('legalDocuments.privacy.active'), checked: true },
  'legalDocuments.privacy.order': input('legalDocuments.privacy.order', '2'),
  'legalDocuments.cookie.label': input('legalDocuments.cookie.label', 'Cookie Tájékoztató'),
  'legalDocuments.cookie.pdfPath': input('legalDocuments.cookie.pdfPath'),
  'legalDocuments.cookie.active': { ...input('legalDocuments.cookie.active'), checked: true },
  'legalDocuments.cookie.order': input('legalDocuments.cookie.order', '3'),
  'brand.headerLogoPath': input('brand.headerLogoPath'),
  'brand.headerLogoAlt': input('brand.headerLogoAlt', 'Easylink'),
  'brand.footerLogoPath': input('brand.footerLogoPath'),
  'brand.footerLogoAlt': input('brand.footerLogoAlt', 'Easylink'),
  searchVisibility: input('searchVisibility', 'blocked'),
};
for (const id of ['facebook','instagram','tiktok','youtube','linkedin']) {
  elements[`social.${id}.active`] = { ...input(`social.${id}.active`), checked: false };
  elements[`social.${id}.url`] = input(`social.${id}.url`);
  elements[`social.${id}.order`] = input(`social.${id}.order`, '1');
}
for (const key of ['eyebrow','title','description','primaryLabel','primaryUrl','secondaryLabel','secondaryUrl']) elements[`defaultCta.${key}`] = input(`defaultCta.${key}`);
for (const key of ['companyName','email','phone','postalCode','city','addressLine','country']) elements[`contact.${key}`] = input(`contact.${key}`);
const submitButton = { disabled: false, type: 'submit' };
const form = { elements, querySelector(sel) { return sel === 'button[type="submit"]' ? submitButton : null; }, addEventListener() {} };
const clearButton = { dataset: { clearDoc: 'termsPdfPath' }, onclick: null };
const current = { innerHTML: '' };
const section = { querySelector(sel) { return sel === '[data-current-doc]' ? current : null; } };
let payload;
const documentForAdmin = {
  getElementById(id) { return id === 'settings-form' ? form : id === 'msg' ? { innerHTML: '' } : null; },
  querySelector(sel) {
    const name = sel.match(/^\[name="(.+)"\]$/)?.[1];
    if (name) return elements[name] || null;
    if (sel === '[data-legal-section="termsPdfPath"]') return section;
    return null;
  },
  querySelectorAll(sel) { return sel === '[data-clear-doc]' ? [clearButton] : []; },
  addEventListener() {},
};
vm.runInNewContext(settingsAdminJs(), { document: documentForAdmin, Event: class Event { constructor(type) { this.type = type; } }, FormData: class FormData {}, fetch: async (_url, options) => { payload = JSON.parse(options.body); return { async json() { return { ok: true, publish: { ok: true } }; } }; } });
await clearButton.onclick();
assert.equal(elements['legalDocuments.terms.pdfPath'].value, '');
assert.equal(payload.legalDocuments.termsPdfPath, '');
assert.equal(payload.legalDocuments.items.find((item) => item.type === 'terms').pdfPath, '');

function pickerInput() { return { value: '', dispatches: [], dispatchEvent(event) { this.dispatches.push(event.type); } }; }
const pickedInput = pickerInput();
let modal;
const list = { innerHTML: '' };
function eventTargetFor(selector) { return selector === '#brand-header-logo-path' ? pickedInput : null; }
const pickerButton = { dataset: { mediaPickerTarget: '#brand-header-logo-path', mediaPickerKind: 'image' }, closest(selector) { return selector === '[data-media-picker-target]' ? this : null; } };
const documentForPicker = {
  listeners: {},
  body: { insertAdjacentHTML() { modal = { hidden: true, listeners: {}, addEventListener(type, fn) { this.listeners[type] = fn; }, querySelector(sel) { return sel === '[data-media-picker-hint]' ? { textContent: '' } : null; } }; } },
  addEventListener(type, fn) { this.listeners[type] = fn; },
  getElementById(id) { if (id === 'media-picker-modal') return modal || null; if (id === 'media-picker-list') return list; return null; },
  querySelector: eventTargetFor,
};
const context = { document: documentForPicker, Event: class Event { constructor(type) { this.type = type; } }, fetch: async () => ({ async json() { return { ok: true, data: [{ id: 1, path: '/assets/site-media/2026/07/logo.png', type: 'image/png', status: 'active', processing_status: 'ready', alt: 'Logo' }] }; } }) };
vm.runInNewContext(mediaPickerJs(), context);
documentForPicker.listeners.click({ target: pickerButton });
await new Promise((resolve) => setTimeout(resolve, 0));
const pick = { dataset: { pickMediaPath: '/assets/site-media/2026/07/logo.png' }, closest(sel) { return sel === '[data-pick-media-path]' ? this : null; } };
modal.listeners.click({ target: pick });
assert.equal(pickedInput.value, '/assets/site-media/2026/07/logo.png');
assert.deepEqual(pickedInput.dispatches, ['input', 'change']);

console.log('settings media picker clear smoke ok');
