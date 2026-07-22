import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createAdminServer } from '../src/lib/admin/server.mjs';
import { createAdminRepository } from '../src/lib/admin/repository.mjs';
import { normalizeSiteSettings, parseSiteSettingsRows } from '../src/lib/admin/settings.mjs';
import { hashPassword } from '../src/lib/db/client.mjs';
import { safeContactIntro } from '../src/lib/content/contact.mjs';

const normalized = normalizeSiteSettings({
  contact: { email: ' hello@easylink.hu ', phone: ' +36 1 234-5678 ', country: ' Magyarország ' },
  analytics: {},
  legalDocuments: {},
});
assert.equal(normalized.contact.email, 'hello@easylink.hu');
assert.equal(normalized.contact.country, 'Magyarország');
assert.equal(parseSiteSettingsRows([{ key: 'contact', value: JSON.stringify({ email: 'info@example.com', city: 'Budapest' }) }]).contact.city, 'Budapest');
assert.throws(() => normalizeSiteSettings({ contact: { email: 'bad' } }), /email/);
assert.throws(() => normalizeSiteSettings({ contact: { phone: 'alert(1)' } }), /telefon/);
assert.throws(() => normalizeSiteSettings({ contact: { city: '<b>x</b>' } }), /Hibás mezőérték/);
assert.equal(normalizeSiteSettings({ contact: { email: '', phone: '' } }).contact.email, '');

assert.equal(safeContactIntro('Email: hello@easylink.hu'), '');
assert.equal(safeContactIntro('Írj ide: hello@easylink.hu'), '');
assert.equal(safeContactIntro('mailto:hello@easylink.hu'), '');
assert.equal(safeContactIntro('tel:+3612345678'), '');
assert.equal(safeContactIntro('Írj nekünk, vagy kérj demót az alábbi kapcsolati adatokon.'), 'Írj nekünk, vagy kérj demót az alábbi kapcsolati adatokon.');

function settingsPool(settingsRows = []) {
  const queries = [];
  const writes = [];
  const conn = {
    async beginTransaction() { writes.push({ type: 'begin' }); },
    async execute(sql, params) { writes.push({ type: 'execute', sql, params }); },
    async commit() { writes.push({ type: 'commit' }); },
    async rollback() { writes.push({ type: 'rollback' }); },
    release() { writes.push({ type: 'release' }); },
  };
  return {
    queries,
    writes,
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql.includes('site_settings')) return [settingsRows, null];
      return [[], null];
    },
    async getConnection() { return conn; },
  };
}

const existingAnalytics = { enabled: true, provider: 'ga4', ga4MeasurementId: 'G-ABC1234', consentMode: 'basic', consentConfigurationVersion: 3 };
const existingLegalDocuments = { termsPdfPath: '', privacyPdfPath: '', cookiePdfPath: '' };
const existingContact = { companyName: 'Easylink Kft.', email: 'info@example.com', phone: '+36 1 234 5678', postalCode: '9400', city: 'Sopron', addressLine: 'Teszt utca 1.', country: 'Magyarország' };
const readPool = settingsPool([
  { key: 'analytics', value: JSON.stringify(existingAnalytics) },
  { key: 'legalDocuments', value: JSON.stringify(existingLegalDocuments) },
  { key: 'contact', value: JSON.stringify(existingContact) },
]);
let repository = createAdminRepository(readPool);
const loadedSettings = await repository.getSiteSettings();
assert.deepEqual(loadedSettings.analytics, existingAnalytics);
assert.equal(loadedSettings.legalDocuments.termsPdfPath, existingLegalDocuments.termsPdfPath);
assert.equal(loadedSettings.legalDocuments.privacyPdfPath, existingLegalDocuments.privacyPdfPath);
assert.equal(loadedSettings.legalDocuments.cookiePdfPath, existingLegalDocuments.cookiePdfPath);
assert.equal(loadedSettings.legalDocuments.items.length, 3);
assert.deepEqual(loadedSettings.legalDocuments.items.map((item) => item.type), ['terms', 'privacy', 'cookie']);
assert.deepEqual(loadedSettings.contact, existingContact);
assert.deepEqual(readPool.queries.find((entry) => entry.sql.includes('site_settings')).params, ['analytics', 'legalDocuments', 'contact', 'brand', 'social', 'defaultCta', 'searchVisibility']);

const writePool = settingsPool();
repository = createAdminRepository(writePool);
const savedSettings = await repository.updateSiteSettings({ analytics: existingAnalytics, legalDocuments: existingLegalDocuments, contact: existingContact });
assert.deepEqual(savedSettings.analytics, existingAnalytics);
assert.equal(savedSettings.legalDocuments.termsPdfPath, existingLegalDocuments.termsPdfPath);
assert.equal(savedSettings.legalDocuments.privacyPdfPath, existingLegalDocuments.privacyPdfPath);
assert.equal(savedSettings.legalDocuments.cookiePdfPath, existingLegalDocuments.cookiePdfPath);
assert.equal(savedSettings.legalDocuments.items.length, 3);
assert.deepEqual(savedSettings.legalDocuments.items.map((item) => item.type), ['terms', 'privacy', 'cookie']);
assert.deepEqual(savedSettings.contact, existingContact);
const writtenKeys = writePool.writes.filter((entry) => entry.type === 'execute').map((entry) => entry.params[0]);
assert.deepEqual(writtenKeys, ['analytics', 'legalDocuments', 'contact', 'brand', 'social', 'defaultCta', 'searchVisibility']);
assert.equal(writePool.writes.some((entry) => entry.type === 'commit'), true);
assert.equal(writePool.writes.some((entry) => entry.type === 'rollback'), false);

const apiUser = { id: 1, email: 'admin@example.com', password_hash: hashPassword('correct-password'), display_name: 'Admin', role: 'admin', status: 'active' };
let apiSettings = normalizeSiteSettings({ analytics: existingAnalytics, legalDocuments: existingLegalDocuments, contact: existingContact });
const apiRepo = {
  async findAdminUserByEmail(email) { return email === apiUser.email ? apiUser : null; },
  async markAdminLogin() {},
  async getSiteSettings() { return apiSettings; },
  async updateSiteSettings(input) { apiSettings = normalizeSiteSettings(input); return apiSettings; },
};
const apiServer = createAdminServer({
  repo: apiRepo,
  env: { SITE_ADMIN_SESSION_SECRET: 'cta-contact-test-session-secret', NODE_ENV: 'test' },
  publishService: { async publish() { return { ok: true, status: 'success', published: true }; } },
});
apiServer.listen(0);
await once(apiServer, 'listening');
const apiBase = `http://127.0.0.1:${apiServer.address().port}`;
try {
  let response = await fetch(`${apiBase}/api/admin/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'text/html' },
    body: new URLSearchParams({ email: apiUser.email, password: 'correct-password' }),
    redirect: 'manual',
  });
  assert.equal(response.status, 303);
  const cookie = response.headers.get('set-cookie');
  assert.ok(cookie);

  response = await fetch(`${apiBase}/api/admin/settings`, { headers: { cookie } });
  assert.equal(response.status, 200);
  let body = await response.json();
  assert.deepEqual(body.data.analytics, existingAnalytics);
  assert.equal(body.data.legalDocuments.termsPdfPath, existingLegalDocuments.termsPdfPath);
  assert.equal(body.data.legalDocuments.privacyPdfPath, existingLegalDocuments.privacyPdfPath);
  assert.equal(body.data.legalDocuments.cookiePdfPath, existingLegalDocuments.cookiePdfPath);
  assert.equal(body.data.legalDocuments.items.length, 3);
  assert.deepEqual(body.data.legalDocuments.items.map((item) => item.type), ['terms', 'privacy', 'cookie']);
  assert.deepEqual(body.data.contact, existingContact);

  const updatedContact = { ...existingContact, email: 'sales@example.com', city: 'Győr' };
  response = await fetch(`${apiBase}/api/admin/settings`, {
    method: 'PUT',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ analytics: existingAnalytics, legalDocuments: existingLegalDocuments, contact: updatedContact }),
  });
  assert.equal(response.status, 200);
  body = await response.json();
  assert.deepEqual(body.data.analytics, existingAnalytics);
  assert.equal(body.data.legalDocuments.termsPdfPath, existingLegalDocuments.termsPdfPath);
  assert.equal(body.data.legalDocuments.privacyPdfPath, existingLegalDocuments.privacyPdfPath);
  assert.equal(body.data.legalDocuments.cookiePdfPath, existingLegalDocuments.cookiePdfPath);
  assert.equal(body.data.legalDocuments.items.length, 3);
  assert.deepEqual(body.data.legalDocuments.items.map((item) => item.type), ['terms', 'privacy', 'cookie']);
  assert.deepEqual(body.data.contact, updatedContact);

  for (const contact of [{ ...updatedContact, email: 'bad' }, { ...updatedContact, phone: 'alert(1)' }]) {
    response = await fetch(`${apiBase}/api/admin/settings`, {
      method: 'PUT',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ analytics: existingAnalytics, legalDocuments: existingLegalDocuments, contact }),
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).ok, false);
  }
} finally {
  await new Promise((resolve, reject) => apiServer.close((error) => error ? reject(error) : resolve()));
}

const footerSource = readFileSync('src/components/Footer.astro', 'utf8');
const contentBlocksSource = readFileSync('src/components/ContentBlocks.astro', 'utf8');
assert.match(footerSource, /publicSettings\.contact/);
assert.match(contentBlocksSource, /analyticsIntent/);
assert.match(contentBlocksSource, /data-easylink-cta=\{intent \|\| undefined\}/);
assert.doesNotMatch(contentBlocksSource, /href=\{deployUrl\}[^>]*data-easylink-cta="demo"/);
assert.doesNotMatch(footerSource, /mailto:hello@easylink\.hu/);
assert.doesNotMatch(contentBlocksSource, /Email: hello@easylink\.hu/);

const layoutSource = readFileSync('src/layouts/BaseLayout.astro', 'utf8');
assert.match(layoutSource, /<Ga4Analytics[\s\S]*<CtaTracking \/>/);
for (const file of ['src/components/Header.astro', 'src/components/Hero.astro', 'src/components/CTASection.astro', 'src/components/Footer.astro', 'src/components/ContentBlocks.astro']) {
  assert.match(readFileSync(file, 'utf8'), /data-easylink-cta/);
}
assert.match(contentBlocksSource, /analyticsIntent/);
assert.doesNotMatch(contentBlocksSource, /label.*Demót|url.*mailto.*hello/);

const ga4Source = readFileSync('src/components/Ga4Analytics.astro', 'utf8');
assert.doesNotMatch(ga4Source, /transport_type/);
const ga4Script = ga4Source.match(/<script is:inline>([\s\S]*?)<\/script>/)?.[1];
const ctaScript = readFileSync('src/components/CtaTracking.astro', 'utf8').match(/<script is:inline>([\s\S]*?)<\/script>/)?.[1];
assert.ok(ga4Script && ctaScript);

function trackingRuntime(initialConsent = 'granted') {
  const calls = [];
  const clickListeners = [];
  const consent = { analytics: initialConsent };
  const document = {
    title: 'CTA test',
    head: { appendChild() {} },
    getElementById(id) {
      return id === 'easylink-ga4-runtime' ? { dataset: { analyticsSettings: JSON.stringify({ active: true, provider: 'ga4', measurementId: 'G-ABC1234', consentMode: 'basic', configurationVersion: 1 }) } } : null;
    },
    querySelector() { return null; },
    createElement() { return { dataset: {} }; },
    addEventListener(type, listener, options) { if (type === 'click') clickListeners.push({ listener, options }); },
  };
  const window = {
    __easylinkGa4RuntimeState: { scriptRequested: true, configured: true, initialPageViewSent: true, analyticsGranted: initialConsent === 'granted', listenerAttached: true },
    location: { href: 'https://site-dev.easylink.hu/kapcsolat/?x=1', pathname: '/kapcsolat/', search: '?x=1' },
    gtag(...args) { calls.push(args); },
    EasylinkConsent: { getState() { return { version: 1, necessary: 'granted', analytics: consent.analytics, updatedAt: new Date().toISOString() }; } },
    addEventListener() {},
  };
  vm.runInNewContext(ga4Script, { window, document, JSON, Number, String, Array, Date, encodeURIComponent });
  vm.runInNewContext(ctaScript, { window, document, String, Set });
  vm.runInNewContext(ctaScript, { window, document, String, Set });

  class Anchor {
    constructor(dataset = {}) {
      this.dataset = dataset;
      this.href = 'https://deploy.easylink.hu';
      this.target = '';
      this.textContent = 'Demót kérek';
      this.parentNode = null;
    }
    closest(selector) { return selector === 'a[data-easylink-cta]' ? this : null; }
  }

  return {
    calls,
    clickListeners,
    consent,
    Anchor,
    click(anchor, extra = {}) {
      let preventDefaultCalls = 0;
      const event = {
        target: anchor,
        defaultPrevented: false,
        preventDefault() { preventDefaultCalls += 1; this.defaultPrevented = true; },
        ...extra,
      };
      clickListeners[0].listener(event);
      return { event, preventDefaultCalls };
    },
    ctaEvents() { return calls.filter((call) => call[0] === 'event' && call[1] === 'cta_click'); },
  };
}

let runtime = trackingRuntime('denied');
let anchor = new runtime.Anchor({ easylinkCta: 'demo', easylinkCtaId: 'site-header-demo', easylinkCtaSlot: 'header' });
runtime.click(anchor);
assert.equal(runtime.ctaEvents().length, 0);
assert.equal(runtime.clickListeners.length, 1);
assert.equal(runtime.clickListeners[0].options, undefined);

runtime = trackingRuntime('granted');
anchor = new runtime.Anchor({ easylinkCta: 'demo', easylinkCtaId: 'site-header-demo', easylinkCtaSlot: 'header' });
runtime.click(anchor);
let eventCall = runtime.ctaEvents().at(-1);
assert.ok(eventCall);
assert.equal(eventCall[1], 'cta_click');
assert.deepEqual(Object.keys(eventCall[2]).sort(), ['cta_id', 'cta_slot', 'cta_type', 'page_path']);
assert.equal(eventCall[2].cta_type, 'demo');
assert.equal(eventCall[2].page_path, '/kapcsolat/');
assert.equal('href' in eventCall[2], false);
assert.equal('email' in eventCall[2], false);
assert.equal('phone' in eventCall[2], false);
assert.equal('transport_type' in eventCall[2], false);

const dynamicAnchor = new runtime.Anchor({ easylinkCta: 'trial', easylinkCtaId: 'dynamic-trial', easylinkCtaSlot: 'dynamic-slot' });
runtime.click(dynamicAnchor);
assert.equal(runtime.ctaEvents().at(-1)[2].cta_type, 'trial');

dynamicAnchor.textContent = 'Új próba felirat';
dynamicAnchor.href = 'https://example.com/uj-cel';
dynamicAnchor.parentNode = { id: 'moved-container' };
runtime.click(dynamicAnchor);
eventCall = runtime.ctaEvents().at(-1);
assert.equal(eventCall[2].cta_type, 'trial');
assert.equal(eventCall[2].cta_id, 'dynamic-trial');

const beforePrevented = runtime.ctaEvents().length;
runtime.click(anchor, { defaultPrevented: true });
assert.equal(runtime.ctaEvents().length, beforePrevented);

anchor.target = '_blank';
const modifierResult = runtime.click(anchor, { ctrlKey: true, metaKey: false });
assert.equal(modifierResult.preventDefaultCalls, 0);
assert.equal(anchor.target, '_blank');

runtime.consent.analytics = 'denied';
const beforeRevoked = runtime.ctaEvents().length;
runtime.click(anchor);
assert.equal(runtime.ctaEvents().length, beforeRevoked);

for (const type of ['none', 'bad']) {
  runtime = trackingRuntime('granted');
  anchor = new runtime.Anchor({ easylinkCta: type, easylinkCtaId: 'x', easylinkCtaSlot: 'x' });
  runtime.click(anchor);
  assert.equal(runtime.ctaEvents().length, 0);
}

console.log('cta tracking smoke ok');
