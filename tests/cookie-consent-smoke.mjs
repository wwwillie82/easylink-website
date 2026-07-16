import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import vm from 'node:vm';
import { writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';

const consent = await readFile('src/components/CookieConsent.astro', 'utf8');
const settings = await readFile('src/lib/content/settings.ts', 'utf8');
const layout = await readFile('src/layouts/BaseLayout.astro', 'utf8');
const footer = await readFile('src/components/Footer.astro', 'utf8');
const pkg = JSON.parse(await readFile('package.json', 'utf8'));

assert.match(pkg.scripts['smoke:cookie-consent'], /cookie-consent-smoke/);
assert.match(layout, /import CookieConsent/);
assert.match(layout, /getPublicSiteSettings/);
assert.match(layout, /<CookieConsent consent=\{publicSettings\.consent\}/);
assert.match(footer, /publicSettings\.consent\.active && <button/);
assert.match(footer, /data-easylink-open-cookie-settings/);
assert.doesNotMatch(footer, /href="#"/);

for (const token of ['analytics.enabled', "provider === 'ga4'", 'ga4MeasurementId', "consentMode === 'basic'", 'consentConfigurationVersion']) assert.match(settings, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.match(settings, /PublicConsentSettings = \{ active: boolean; configurationVersion: number; privacyPdfPath: string; cookiePdfPath: string \}/);
assert.match(settings, /catch \{\s*return publicFallback\(\);\s*\} finally \{\s*await pool\?\.end/);
assert.match(settings, /settingsPromise \?\?=/);
assert.match(settings, /status !== 'archived'/);
assert.match(settings, /processing_status === 'ready'/);
assert.match(settings, /type === 'application\/pdf'/);
for (const unsafe of ["value.includes('://')", "startsWith('//')", "startsWith('javascript:')", 'part.includes']) assert.ok(settings.includes(unsafe), `missing unsafe path guard: ${unsafe}`);
assert.match(settings, /\[\\u0000-\\u001f\\u007f/);

for (const token of ['easylink_consent', 'MAX_AGE_SECONDS = 60 * 60 * 24 * 180', 'Path=/', 'SameSite=Lax', 'Secure', 'version', 'necessary', 'analytics', 'updatedAt']) assert.match(consent, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
for (const token of ['Süti-beállítások', 'Statisztika engedélyezése', 'Csak szükséges sütik', 'Beállítások', 'Kiválasztás mentése', 'Minden elfogadása', 'Adatkezelési Tájékoztató', 'Cookie Tájékoztató']) assert.match(consent, new RegExp(token));
assert.match(consent, /keys !== 'analytics,necessary,updatedAt,version'/);
assert.match(consent, /raw\.version !== VERSION/);
assert.match(consent, /raw\.necessary !== 'granted'/);
assert.match(consent, /raw\.analytics !== 'granted' && raw\.analytics !== 'denied'/);
assert.match(consent, /value\.length > 512/);
assert.match(consent, /safeLegalHref/);
assert.match(consent, /document\.createElement\('a'\)/);
assert.match(consent, /setAttribute\('href', href\)/);
assert.doesNotMatch(consent, /href="\$\{docs\./);
assert.match(consent, /window\.EasylinkConsent = \{ getState:/);
assert.match(consent, /CustomEvent\('easylink:consent-changed'/);
assert.match(consent, /if \(active && !saved\) showBanner\(\)/);
assert.doesNotMatch(consent, /dispatchEvent[\s\S]*page load/i);
assert.match(consent, /applyModalIsolation/);
assert.match(consent, /restoreModalIsolation/);
assert.match(consent, /el\.inert = true/);
assert.doesNotMatch(consent, /gtag|googletagmanager|google-analytics|GTM-/i);

const script = consent.match(/<script is:inline>([\s\S]*?)<\/script>/)[1];

class FakeElement {
  constructor(name, document, selector = '') { this.name = name; this.document = document; this.selector = selector; this.listeners = {}; this.attrs = {}; this.children = []; this.disabled = false; this.hidden = false; this.checked = false; this.textContent = ''; this.inert = false; this.isConnected = true; document?.allElements?.add(this); }
  focus() { this.document.activeElement = this; }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  click() { if (this.inert) return; this.listeners.click?.({ currentTarget: this, target: this, preventDefault() {} }); }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null; }
  removeAttribute(name) { delete this.attrs[name]; if (name === 'inert') this.inert = false; }
  appendChild(child) { this.children.push(child); return child; }
  querySelector(selector) { return this.document.query(selector); }
  querySelectorAll(selector) { return this.document.queryAll(selector); }
  closest(selector) { return this.selector === selector ? this : null; }
}

class FakeMount extends FakeElement {
  constructor(document) { super('mount', document); this.dataset = {}; this._innerHTML = ''; }
  set innerHTML(value) { this._innerHTML = String(value); this.document.rebuild(this._innerHTML); }
  get innerHTML() { return this._innerHTML; }
}

class FakeDocument {
  constructor(cookie = '') { this.listeners = {}; this.cookieValue = cookie; this.cookieWrites = []; this.created = []; this.elements = new Map(); this.allElements = new Set(); this.activeElement = null; this.body = new FakeElement('body', this); this.background = new FakeElement('background', this); this.footerButton = new FakeElement('footer', this, '[data-easylink-open-cookie-settings]'); this.mount = new FakeMount(this); this.body.children = [this.background, this.mount]; this.activeElement = this.body; }
  get cookie() { return this.cookieValue; }
  set cookie(value) { this.cookieWrites.push(value); this.cookieValue = value; }
  getElementById() { return this.mount; }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  createElement(name) { const el = new FakeElement(name, this); this.created.push(el); return el; }
  querySelector(selector) { return selector === '[data-easylink-open-cookie-settings]' ? this.footerButton : this.query(selector); }
  query(selector) { return this.elements.get(selector) || null; }
  queryAll() { return this.focusables || []; }
  rebuild(html) {
    for (const el of this.elements.values()) el.isConnected = false;
    for (const el of this.focusables || []) el.isConnected = false;
    this.elements = new Map(); this.focusables = [];
    if (html.includes('el-consent-banner')) {
      for (const selector of ['[data-accept]', '[data-reject]', '[data-settings]']) {
        const el = new FakeElement(selector, this, selector); this.elements.set(selector, el); this.focusables.push(el);
      }
    }
    if (html.includes('el-consent-dialog')) {
      const dialog = new FakeElement('dialog', this, '[role="dialog"]');
      const nav = new FakeElement('nav', this, '.el-consent-legal');
      const analytics = new FakeElement('analytics', this, '[data-analytics-toggle]');
      analytics.checked = html.includes('data-analytics-toggle type="checkbox" checked');
      const save = new FakeElement('save', this, '[data-save]');
      const accept = new FakeElement('accept', this, '[data-accept]');
      const reject = new FakeElement('reject', this, '[data-reject]');
      const close = new FakeElement('close', this, '[data-close]');
      this.elements.set('[role="dialog"]', dialog);
      this.elements.set('.el-consent-legal', nav);
      this.elements.set('[data-analytics-toggle]', analytics);
      this.elements.set('[data-save]', save);
      this.elements.set('[data-accept]', accept);
      this.elements.set('[data-reject]', reject);
      this.elements.set('[data-close]', close);
      this.focusables = [analytics, save, accept, reject, close];
    }
  }
}

function runtime({ active = true, version = 1, cookie = '', protocol = 'https:', privacyPdfPath = '/assets/site-media/2026/07/privacy.pdf', cookiePdfPath = '/assets/site-media/2026/07/cookie.pdf' } = {}) {
  const document = new FakeDocument(cookie);
  document.mount.dataset.consentSettings = JSON.stringify({ active, configurationVersion: version, privacyPdfPath, cookiePdfPath });
  const events = [];
  const window = { dispatchEvent(e) { events.push(e); }, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } } };
  const context = { document, window, location: { protocol }, JSON, Number, Date, Array, Object, encodeURIComponent, decodeURIComponent, CustomEvent: window.CustomEvent };
  vm.runInNewContext(script, context);
  return { document, mount: document.mount, events, cookieWrites: document.cookieWrites, api: context.window.EasylinkConsent };
}

let rt = runtime({ active: false });
assert.equal(rt.mount.innerHTML, '');
assert.equal(rt.api.getState().analytics, 'denied');

function consentCookie(payload) { return `easylink_consent=${encodeURIComponent(typeof payload === 'string' ? payload : JSON.stringify(payload))}`; }
const validGranted = { version: 1, necessary: 'granted', analytics: 'granted', updatedAt: new Date().toISOString() };
const validDenied = { ...validGranted, analytics: 'denied' };
for (const [payload, expected] of [[validGranted, 'granted'], [validDenied, 'denied']]) {
  rt = runtime({ active: true, cookie: consentCookie(payload) });
  assert.equal(rt.mount.innerHTML, '');
  assert.equal(rt.api.getState().analytics, expected);
  assert.equal(rt.events.length, 0);
}
for (const bad of [
  { ...validGranted, version: 0 },
  '{bad json',
  { ...validGranted, analytics: 'maybe' },
  { version: 1, analytics: 'granted', updatedAt: validGranted.updatedAt },
  { ...validGranted, necessary: 'denied' },
  { ...validGranted, marketing: 'granted' },
  { version: 1, necessary: 'granted', analytics: 'denied' },
  { version: 1, necessary: 'granted', analytics: 'denied', updatedAt: 'not-a-date' },
  'x'.repeat(513),
]) {
  rt = runtime({ active: true, cookie: consentCookie(bad) });
  assert.match(rt.mount.innerHTML, /el-consent-banner/);
  assert.equal(rt.events.length, 0);
}

rt = runtime({ active: true });
assert.match(rt.mount.innerHTML, /el-consent-banner/);
assert.equal(rt.api.getState().analytics, 'denied');
const s1 = rt.api.getState(); s1.analytics = 'granted';
assert.equal(rt.api.getState().analytics, 'denied');
for (const action of ['[data-save]', '[data-accept]', '[data-reject]']) {
  const flow = runtime({ active: true });
  flow.document.query('[data-settings]').click();
  flow.document.query(action).click();
  assert.equal(flow.document.activeElement, flow.document.footerButton, `${action} should focus live footer fallback`);
  assert.equal(flow.document.activeElement.isConnected, true, `${action} focused detached element`);
}
let backgroundClicks = 0;
rt.document.background.addEventListener('click', () => { backgroundClicks += 1; });
rt.document.query('[data-settings]').click();
assert.match(rt.mount.innerHTML, /role="dialog"/);
assert.equal(rt.document.background.inert, true);
assert.equal(rt.document.background.attrs['aria-hidden'], 'true');
rt.document.background.click();
assert.equal(backgroundClicks, 0);
assert.equal(rt.cookieWrites.length, 0);
rt.document.listeners.keydown({ key: 'Escape', preventDefault() { this.prevented = true; } });
assert.equal(rt.cookieWrites.length, 0);
assert.equal(rt.document.background.inert, false);
assert.equal(rt.document.background.getAttribute('aria-hidden'), null);
assert.match(rt.mount.innerHTML, /el-consent-banner/);
assert.equal(rt.document.activeElement, rt.document.query('[data-settings]'));

rt.document.query('[data-settings]').click();
let focusables = rt.document.focusables;
rt.document.activeElement = focusables.at(-1);
let prevented = false;
rt.document.listeners.keydown({ key: 'Tab', shiftKey: false, preventDefault() { prevented = true; } });
assert.equal(prevented, true);
assert.equal(rt.document.activeElement, focusables[0]);
rt.document.activeElement = focusables[0];
prevented = false;
rt.document.listeners.keydown({ key: 'Tab', shiftKey: true, preventDefault() { prevented = true; } });
assert.equal(prevented, true);
assert.equal(rt.document.activeElement, focusables.at(-1));
rt.document.query('[data-save]').click();
assert.equal(rt.document.background.inert, false);
assert.match(rt.cookieWrites.at(-1), /analytics%22%3A%22denied/);
assert.equal(rt.events.length, 1);
assert.equal(rt.events[0].type, 'easylink:consent-changed');
assert.match(rt.cookieWrites.at(-1), /Path=\//);
assert.match(rt.cookieWrites.at(-1), /SameSite=Lax/);
assert.match(rt.cookieWrites.at(-1), /Max-Age=15552000/);
assert.match(rt.cookieWrites.at(-1), /Secure/);
assert.doesNotMatch(rt.cookieWrites.at(-1), /Domain=/);

const validCookie = `easylink_consent=${encodeURIComponent(JSON.stringify({ version: 1, necessary: 'granted', analytics: 'granted', updatedAt: new Date().toISOString() }))}`;
rt = runtime({ active: true, cookie: validCookie });
const footerButton = rt.document.footerButton;
rt.document.listeners.click({ target: footerButton, preventDefault() { this.prevented = true; } });
assert.match(rt.mount.innerHTML, /role="dialog"/);
assert.equal(rt.document.background.inert, true);
rt.document.query('[data-save]').click();
assert.equal(rt.document.background.inert, false);
assert.equal(rt.document.activeElement, footerButton);
rt = runtime({ active: true, cookie: validCookie });
const footerButton2 = rt.document.footerButton;
rt.document.listeners.click({ target: footerButton2, preventDefault() {} });
rt.document.query('[data-close]').click();
assert.equal(rt.document.activeElement, footerButton2);

rt = runtime({ active: true, protocol: 'http:' });
rt.api.rejectAnalytics();
assert.doesNotMatch(rt.cookieWrites.at(-1), /Secure/);

for (const bad of ['javascript:alert(1)', 'https://example.com/x.pdf', '//example.com/x.pdf', '/assets/site-media/2026/07/x.pdf" onclick="alert(1)', '/assets/site-media/2026/07/<x>.pdf', '/assets/site-media/2026/07/bad\\x.pdf', '/assets/site-media/../x.pdf']) {
  rt = runtime({ active: true, privacyPdfPath: bad, cookiePdfPath: '' });
  rt.api.openSettings();
  assert.equal(rt.document.created.filter((el) => el.name === 'a').length, 0, `bad href rendered: ${bad}`);
  assert.doesNotMatch(rt.mount.innerHTML, /onclick|onerror|<img|javascript:/i);
}
rt = runtime({ active: true, privacyPdfPath: '/assets/site-media/2026/07/privacy.pdf', cookiePdfPath: '/assets/site-media/2026/07/cookie.pdf' });
rt.api.openSettings();
assert.equal(rt.document.created.filter((el) => el.name === 'a').length, 2);
assert.equal(rt.document.created[0].attrs.href, '/assets/site-media/2026/07/privacy.pdf');
assert.equal(rt.document.created[1].attrs.href, '/assets/site-media/2026/07/cookie.pdf');

const tmp = await mkdtemp(join(tmpdir(), 'easylink-settings-'));
const settingsSource = (await readFile('src/lib/content/settings.ts', 'utf8')).replace("from '@/lib/admin/settings.mjs'", `from 'file://${process.cwd()}/src/lib/admin/settings.mjs'`);
const transpiled = ts.transpileModule(settingsSource, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const settingsModulePath = join(tmp, 'settings.mjs');
await writeFile(settingsModulePath, transpiled);
const { readPublicSiteSettingsFromPool } = await import(`file://${settingsModulePath}`);
async function activeFrom(analytics) {
  const pool = { async query(sql) { return sql.includes('site_settings') ? [[{ key: 'analytics', value: JSON.stringify(analytics) }, { key: 'legalDocuments', value: JSON.stringify({}) }], null] : [[], null]; } };
  return (await readPublicSiteSettingsFromPool(pool)).consent;
}
assert.equal((await activeFrom({ enabled: false, provider: 'ga4', ga4MeasurementId: 'G-ABCD1', consentMode: 'basic', consentConfigurationVersion: 4 })).active, false);
assert.equal((await activeFrom({ enabled: true, provider: 'none', ga4MeasurementId: 'G-ABCD1', consentMode: 'basic', consentConfigurationVersion: 4 })).active, false);
assert.equal((await activeFrom({ enabled: true, provider: 'ga4', ga4MeasurementId: '', consentMode: 'basic', consentConfigurationVersion: 4 })).active, false);
assert.equal((await activeFrom({ enabled: true, provider: 'ga4', ga4MeasurementId: 'UA-1', consentMode: 'basic', consentConfigurationVersion: 4 })).active, false);
assert.equal((await activeFrom({ enabled: true, provider: 'ga4', ga4MeasurementId: 'G-ABCD1', consentMode: 'advanced', consentConfigurationVersion: 4 })).active, false);
const activeConsent = await activeFrom({ enabled: true, provider: 'ga4', ga4MeasurementId: 'G-ABCD1', consentMode: 'basic', consentConfigurationVersion: 7 });
assert.equal(activeConsent.active, true);
assert.equal(activeConsent.configurationVersion, 7);

const pages = (await readdir('src/pages', { recursive: true })).filter((f) => f.endsWith('.astro'));
for (const page of pages) {
  const src = await readFile(`src/pages/${page}`, 'utf8');
  assert.match(src, /BaseLayout/, `${page} must use BaseLayout global consent mount`);
}
console.log('cookie consent smoke ok');
