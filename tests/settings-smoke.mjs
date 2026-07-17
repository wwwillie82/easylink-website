import assert from 'node:assert/strict';
import { createAdminRepository } from '../src/lib/admin/repository.mjs';
import { normalizeSiteSettings, parseSiteSettingsRows } from '../src/lib/admin/settings.mjs';

assert.equal(normalizeSiteSettings({ analytics: { consentMode: 'basic', consentConfigurationVersion: 1 } }).analytics.provider, 'none');
assert.throws(() => normalizeSiteSettings({ analytics: { provider: 'ga4', ga4MeasurementId: 'UA-1' } }), /GA4/);
assert.throws(() => normalizeSiteSettings({ analytics: { consentMode: 'advanced' } }), /basic/);
const s=normalizeSiteSettings({ unknown: true, analytics: { enabled: true, provider: 'ga4', ga4MeasurementId: 'G-ABC1234', consentMode:'basic', consentConfigurationVersion: 2 }, legalDocuments: { termsPdfPath:'/assets/site-media/2026/07/a.pdf', evil:'x' }});
assert.equal(s.legalDocuments.termsPdfPath, '/assets/site-media/2026/07/a.pdf');
assert.equal(s.legalDocuments.evil, undefined);
assert.equal(parseSiteSettingsRows([{key:'legalDocuments', value: JSON.stringify({privacyPdfPath:'/assets/site-media/2026/07/p.pdf'})}]).legalDocuments.privacyPdfPath, '/assets/site-media/2026/07/p.pdf');

function poolFor(mediaRows = [], settingsRows = []) {
  const writes = [];
  const conn = { async beginTransaction(){ writes.push(['begin']); }, async execute(sql, params){ writes.push(params); }, async commit(){ writes.push(['commit']); }, async rollback(){ writes.push(['rollback']); }, release(){ writes.push(['release']); } };
  return { writes, async execute(sql, params){ writes.push(params); }, async query(sql, params) { if (sql.includes('site_media_assets') && sql.includes('id=?')) return [[mediaRows.find((m) => String(m.id) === String(params[0]))].filter(Boolean), null]; if (sql.includes('site_media_assets')) return [[mediaRows.find((m) => m.path === params[0])].filter(Boolean), null]; if (sql.includes('site_settings')) return [settingsRows, null]; return [[], null]; }, async getConnection(){ return conn; } };
}
const validPdf = { id: 1, path: '/assets/site-media/2026/07/terms.pdf', type: 'application/pdf', status: 'active', processing_status: 'ready' };
let pool = poolFor([validPdf]);
let repo = createAdminRepository(pool);
await repo.updateSiteSettings({ legalDocuments: { termsPdfPath: validPdf.path } }, { SITE_MEDIA_PUBLIC_BASE_URL: '/assets/site-media' });
assert.deepEqual(pool.writes.at(-2), ['commit']);
for (const bad of [
  { ...validPdf, status: 'archived' },
  { ...validPdf, processing_status: 'queued' },
  { ...validPdf, processing_status: 'processing' },
  { ...validPdf, processing_status: 'failed' },
  { ...validPdf, type: 'image/png' },
  { ...validPdf, type: 'video/mp4' },
]) {
  pool = poolFor([bad]);
  repo = createAdminRepository(pool);
  await assert.rejects(() => repo.updateSiteSettings({ legalDocuments: { termsPdfPath: validPdf.path } }, { SITE_MEDIA_PUBLIC_BASE_URL: '/assets/site-media' }), /PDF/);
}
pool = poolFor([validPdf]);
repo = createAdminRepository(pool);
await assert.rejects(() => repo.updateSiteSettings({ legalDocuments: { termsPdfPath: '/other/terms.pdf' } }, { SITE_MEDIA_PUBLIC_BASE_URL: '/assets/site-media' }), /feltöltött PDF/);
await repo.updateSiteSettings({ legalDocuments: { termsPdfPath: '', privacyPdfPath: '', cookiePdfPath: '' } }, { SITE_MEDIA_PUBLIC_BASE_URL: '/assets/site-media' });
const legalValue = (field, path = validPdf.path) => [{ key: 'legalDocuments', value: JSON.stringify({ [field]: path }) }];
for (const field of ['termsPdfPath','privacyPdfPath','cookiePdfPath']) {
  pool = poolFor([validPdf], legalValue(field));
  repo = createAdminRepository(pool);
  await assert.rejects(() => repo.archiveMedia(1), /jogi dokumentumként/);
  await assert.rejects(() => repo.updateMedia(1, { status: 'archived' }), /jogi dokumentumként/);
  await repo.updateMedia(1, { alt: 'Új alt' });
  await repo.updateMedia(1, { status: 'active' });
}
pool = poolFor([{ ...validPdf, id: 1 }], legalValue('termsPdfPath', '/assets/site-media/2026/07/other.pdf'));
repo = createAdminRepository(pool);
await repo.archiveMedia(1);
assert.equal(pool.writes.some((entry) => Array.isArray(entry) && entry[0] === 'archived'), true);
for (const media of [{ ...validPdf, id: 2, type: 'image/png' }, { ...validPdf, id: 3, type: 'video/mp4' }]) {
  pool = poolFor([media], legalValue('termsPdfPath'));
  repo = createAdminRepository(pool);
  await repo.updateMedia(media.id, { status: 'archived' });
  await repo.archiveMedia(media.id);
}
console.log('settings smoke ok');

import vm from 'node:vm';
import { settingsAdminJs, settingsSaveOutcome } from '../src/lib/admin/render/settings.mjs';

function settingsRuntime({ settingsResponse, uploadResponse } = {}) {
  let reloads = 0;
  const msgEl = { innerHTML: '' };
  const saveButton = { disabled: false, type: 'submit' };
  const inputs = {
    'analytics.enabled': { name: 'analytics.enabled', checked: false, value: '', addEventListener() {} },
    'analytics.provider': { name: 'analytics.provider', value: 'none', addEventListener() {} },
    'analytics.ga4MeasurementId': { name: 'analytics.ga4MeasurementId', value: '', addEventListener() {} },
    'analytics.consentMode': { name: 'analytics.consentMode', value: 'basic', addEventListener() {} },
    'analytics.consentConfigurationVersion': { name: 'analytics.consentConfigurationVersion', value: '1', addEventListener() {} },
    'legalDocuments.termsPdfPath': { name: 'legalDocuments.termsPdfPath', value: '', addEventListener() {} },
    'legalDocuments.privacyPdfPath': { name: 'legalDocuments.privacyPdfPath', value: '', addEventListener() {} },
    'legalDocuments.cookiePdfPath': { name: 'legalDocuments.cookiePdfPath', value: '', addEventListener() {} },

    'legalDocuments.terms.label': { name: 'legalDocuments.terms.label', value: 'Általános Szerződési Feltételek', addEventListener() {} },
    'legalDocuments.terms.pdfPath': { name: 'legalDocuments.terms.pdfPath', value: '', addEventListener() {}, dispatchEvent() {} },
    'legalDocuments.terms.active': { name: 'legalDocuments.terms.active', checked: true, value: 'on', addEventListener() {} },
    'legalDocuments.terms.order': { name: 'legalDocuments.terms.order', value: '1', addEventListener() {} },
    'legalDocuments.privacy.label': { name: 'legalDocuments.privacy.label', value: 'Adatkezelési Tájékoztató', addEventListener() {} },
    'legalDocuments.privacy.pdfPath': { name: 'legalDocuments.privacy.pdfPath', value: '', addEventListener() {}, dispatchEvent() {} },
    'legalDocuments.privacy.active': { name: 'legalDocuments.privacy.active', checked: true, value: 'on', addEventListener() {} },
    'legalDocuments.privacy.order': { name: 'legalDocuments.privacy.order', value: '2', addEventListener() {} },
    'legalDocuments.cookie.label': { name: 'legalDocuments.cookie.label', value: 'Cookie Tájékoztató', addEventListener() {} },
    'legalDocuments.cookie.pdfPath': { name: 'legalDocuments.cookie.pdfPath', value: '', addEventListener() {}, dispatchEvent() {} },
    'legalDocuments.cookie.active': { name: 'legalDocuments.cookie.active', checked: true, value: 'on', addEventListener() {} },
    'legalDocuments.cookie.order': { name: 'legalDocuments.cookie.order', value: '3', addEventListener() {} },
    'brand.headerLogoPath': { name: 'brand.headerLogoPath', value: '', addEventListener() {} },
    'brand.headerLogoAlt': { name: 'brand.headerLogoAlt', value: 'Easylink', addEventListener() {} },
    'brand.footerLogoPath': { name: 'brand.footerLogoPath', value: '', addEventListener() {} },
    'brand.footerLogoAlt': { name: 'brand.footerLogoAlt', value: 'Easylink', addEventListener() {} },
    searchVisibility: { name: 'searchVisibility', value: 'blocked', addEventListener() {} },
    'social.linkedin.active': { name: 'social.linkedin.active', checked: false, value: '', addEventListener() {} },
    'social.linkedin.url': { name: 'social.linkedin.url', value: '', addEventListener() {} },
    'social.linkedin.order': { name: 'social.linkedin.order', value: '1', addEventListener() {} },
    'defaultCta.secondaryUrl': { name: 'defaultCta.secondaryUrl', value: '', addEventListener() {} },
    'contact.country': { name: 'contact.country', value: '', addEventListener() {} },
    'contact.addressLine': { name: 'contact.addressLine', value: '', addEventListener() {} },
    'contact.city': { name: 'contact.city', value: '', addEventListener() {} },
    'contact.postalCode': { name: 'contact.postalCode', value: '', addEventListener() {} },
    'contact.phone': { name: 'contact.phone', value: '', addEventListener() {} },
    'contact.email': { name: 'contact.email', value: '', addEventListener() {} },
    'contact.companyName': { name: 'contact.companyName', value: '', addEventListener() {} },
    'defaultCta.secondaryLabel': { name: 'defaultCta.secondaryLabel', value: '', addEventListener() {} },
    'defaultCta.primaryUrl': { name: 'defaultCta.primaryUrl', value: '', addEventListener() {} },
    'defaultCta.primaryLabel': { name: 'defaultCta.primaryLabel', value: '', addEventListener() {} },
    'defaultCta.description': { name: 'defaultCta.description', value: '', addEventListener() {} },
    'defaultCta.title': { name: 'defaultCta.title', value: '', addEventListener() {} },
    'defaultCta.eyebrow': { name: 'defaultCta.eyebrow', value: '', addEventListener() {} },
    'social.youtube.active': { name: 'social.youtube.active', checked: false, value: '', addEventListener() {} },
    'social.youtube.url': { name: 'social.youtube.url', value: '', addEventListener() {} },
    'social.youtube.order': { name: 'social.youtube.order', value: '1', addEventListener() {} },
    'social.tiktok.active': { name: 'social.tiktok.active', checked: false, value: '', addEventListener() {} },
    'social.tiktok.url': { name: 'social.tiktok.url', value: '', addEventListener() {} },
    'social.tiktok.order': { name: 'social.tiktok.order', value: '1', addEventListener() {} },
    'social.instagram.active': { name: 'social.instagram.active', checked: false, value: '', addEventListener() {} },
    'social.instagram.url': { name: 'social.instagram.url', value: '', addEventListener() {} },
    'social.instagram.order': { name: 'social.instagram.order', value: '1', addEventListener() {} },
    'social.facebook.active': { name: 'social.facebook.active', checked: false, value: '', addEventListener() {} },
    'social.facebook.url': { name: 'social.facebook.url', value: '', addEventListener() {} },
    'social.facebook.order': { name: 'social.facebook.order', value: '1', addEventListener() {} },
  };
  const listeners = {};
  const form = { elements: inputs, onsubmit: null, querySelector(selector) { return selector === 'button[type="submit"]' ? saveButton : null; }, addEventListener(type, fn) { listeners[type] = fn; } };
  const current = { innerHTML: 'Aktuális dokumentum: nincs beállítva' };
  const section = { querySelector(selector) { return selector === '[data-current-doc]' ? current : null; } };
  const clearButton = { dataset: { clearDoc: 'termsPdfPath' }, onclick: null };
  const fileInput = { type: 'file', value: 'C:/fake/terms.pdf' };
  const uploadForm = { dataset: { docUpload: 'termsPdfPath' }, onsubmit: null, querySelector(selector) { return selector === 'input[type="file"]' ? fileInput : null; } };
  const document = {
    getElementById(id) { return id === 'msg' ? msgEl : id === 'settings-form' ? form : null; },
    querySelector(selector) {
      if (selector.startsWith('[name="')) return inputs[selector.slice(7, -2)];
      if (selector === '[data-legal-section="termsPdfPath"]') return section;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '[data-clear-doc]') return [clearButton];
      if (selector === '[data-doc-upload]') return [uploadForm];
      return [];
    },
  };
  const fetchCalls = [];
  const context = { document, location: { reload() { reloads += 1; } }, FormData: class FormData { constructor(formArg) { this.form = formArg; } }, Event: class Event { constructor(type) { this.type = type; } }, fetch: async (url) => { fetchCalls.push(String(url)); const body = String(url).includes('/api/admin/media') ? uploadResponse : settingsResponse; return { async json() { if (body === 'bad-json') throw new Error('bad json'); return body ?? { ok: true, data: { analytics: {}, legalDocuments: { termsPdfPath: inputs['legalDocuments.terms.pdfPath'].value, privacyPdfPath: '', cookiePdfPath: '' } }, publish: { ok: true } }; } }; } };
  vm.runInNewContext(settingsAdminJs(), context);
  return { msgEl, saveButton, inputs, listeners, form, clearButton, uploadForm, fileInput, current, fetchCalls, reloads: () => reloads };
}

assert.equal(settingsSaveOutcome({ ok: true, publish: { ok: true } }).message, 'Beállítások mentve és élesítve.');
assert.match(settingsAdminJs(), /setupDirtyForm/);
assert.doesNotMatch(settingsAdminJs(), /location\.reload\(\)/);
assert.doesNotMatch(settingsAdminJs(), /googletagmanager|google-analytics|gtag\(|GTM-/i);

let rt = settingsRuntime({ settingsResponse: { ok: true, data: {}, publish: { ok: true } } });
assert.equal(rt.saveButton.disabled, true);
rt.inputs['analytics.ga4MeasurementId'].value = 'G-ABC1234';
rt.listeners.input();
assert.equal(rt.saveButton.disabled, false);
await rt.form.onsubmit({ preventDefault() {} });
assert.equal(rt.reloads(), 0);
assert.match(rt.msgEl.innerHTML, /Beállítások mentve és élesítve/);
assert.equal(rt.saveButton.disabled, true);

rt = settingsRuntime({ settingsResponse: { ok: true, data: {}, publish: { status: 'publish_in_progress' } } });
rt.inputs['analytics.ga4MeasurementId'].value = 'G-ABC1234';
rt.listeners.input();
await rt.form.onsubmit({ preventDefault() {} });
assert.match(rt.msgEl.innerHTML, /élesítés folyamatban/);
assert.equal(rt.reloads(), 0);

rt = settingsRuntime({ settingsResponse: { ok: true, data: {}, publish: { ok: false, status: 'failed' } } });
rt.inputs['analytics.ga4MeasurementId'].value = 'G-ABC1234';
rt.listeners.input();
await rt.form.onsubmit({ preventDefault() {} });
assert.match(rt.msgEl.innerHTML, /élesítés sikertelen/);
assert.equal(rt.reloads(), 0);
assert.equal(rt.saveButton.disabled, true);

rt = settingsRuntime({ settingsResponse: { ok: false, error: { message: 'API hiba' } } });
rt.inputs['analytics.ga4MeasurementId'].value = 'G-ABC1234';
rt.listeners.input();
await rt.form.onsubmit({ preventDefault() {} });
assert.match(rt.msgEl.innerHTML, /API hiba/);
assert.equal(rt.saveButton.disabled, false);

rt = settingsRuntime({ uploadResponse: { ok: true, data: { path: '/assets/site-media/2026/07/terms.pdf' } }, settingsResponse: { ok: true, data: {}, publish: { ok: true } } });
await rt.uploadForm.onsubmit({ preventDefault() {} });
assert.match(rt.current.innerHTML, /PDF megnyitása/);
assert.match(rt.current.innerHTML, /\/assets\/site-media\/2026\/07\/terms\.pdf/);
assert.equal(rt.inputs['legalDocuments.terms.pdfPath'].value, '/assets/site-media/2026/07/terms.pdf');
assert.equal(rt.fileInput.value, '');
assert.match(rt.msgEl.innerHTML, /Beállítások mentve/);

rt = settingsRuntime({ uploadResponse: { ok: true, data: { path: '/assets/site-media/2026/07/new.pdf' } }, settingsResponse: { ok: false, error: { message: 'settings save failed' } } });
rt.inputs['legalDocuments.terms.pdfPath'].value = '/assets/site-media/2026/07/old.pdf';
await rt.uploadForm.onsubmit({ preventDefault() {} });
assert.equal(rt.inputs['legalDocuments.terms.pdfPath'].value, '/assets/site-media/2026/07/old.pdf');
assert.doesNotMatch(rt.current.innerHTML, /new\.pdf/);

rt = settingsRuntime({ settingsResponse: { ok: true, data: {}, publish: { ok: false, status: 'failed' } } });
rt.inputs['legalDocuments.terms.pdfPath'].value = '/assets/site-media/2026/07/terms.pdf';
await rt.clearButton.onclick();
assert.match(rt.current.innerHTML, /nincs beállítva/);
assert.equal(rt.inputs['legalDocuments.terms.pdfPath'].value, '');
assert.match(rt.msgEl.innerHTML, /élő oldal változatlan maradt/);

rt = settingsRuntime({ settingsResponse: 'bad-json' });
rt.inputs['analytics.ga4MeasurementId'].value = 'G-ABC1234';
rt.listeners.input();
await rt.form.onsubmit({ preventDefault() {} });
assert.match(rt.msgEl.innerHTML, /Hibás szerver válasz/);
console.log('settings admin runtime smoke ok');
