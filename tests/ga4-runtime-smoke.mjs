import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const component = fs.readFileSync(new URL('../src/components/Ga4Analytics.astro', import.meta.url), 'utf8');
const script = component.match(/<script is:inline>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'GA4 inline runtime script exists');
assert.doesNotMatch(component, /G-HPZ3H10VWX|GTM-|google-analytics\.com|collect|innerHTML|eval\(/i);
assert.match(component, /googletagmanager\.com\/gtag\/js\?id=/);
assert.match(component, /encodeURIComponent\(settings\.measurementId\)/);
assert.match(component, /script\.async = true/);

function createRuntime({ settings, consentState, title = 'Demo title', href = 'https://site-dev.easylink.hu/arak?x=1' }) {
  const appended = [];
  const listeners = new Map();
  const scripts = [];
  const mount = { dataset: { analyticsSettings: JSON.stringify(settings) } };
  const document = {
    title,
    head: { appendChild(node) { appended.push(node); scripts.push(node); } },
    getElementById(id) { return id === 'easylink-ga4-runtime' ? mount : null; },
    createElement(tag) { return { tagName: tag.toUpperCase(), dataset: {}, set async(value) { this._async = value; }, get async() { return this._async; } }; },
    querySelector(selector) { return selector === 'script[data-easylink-ga4="true"]' ? scripts[0] || null : null; },
  };
  const url = new URL(href);
  const window = {
    location: { href, pathname: url.pathname, search: url.search },
    addEventListener(type, fn) { listeners.set(type, [...(listeners.get(type) || []), fn]); },
    dispatchEvent(event) { for (const fn of listeners.get(event.type) || []) fn(event); },
  };
  if (consentState !== undefined) window.EasylinkConsent = { getState: () => structuredClone(consentState) };
  const context = { window, document, JSON, Number, String, Array, Date, URLSearchParams, encodeURIComponent };
  vm.runInNewContext(script, context);
  return { window, document, appended, listeners, setConsent(state) { window.EasylinkConsent = { getState: () => structuredClone(state) }; }, event() { window.dispatchEvent({ type: 'easylink:consent-changed', detail: { analytics: 'ignored' } }); } };
}

const active = { active: true, provider: 'ga4', measurementId: 'G-ABCD1234', consentMode: 'basic', configurationVersion: 1 };
for (const settings of [
  { ...active, active: false },
  { ...active, provider: 'none' },
  { ...active, measurementId: '' },
  { ...active, measurementId: 'UA-1' },
  { ...active, measurementId: 'G-ABCD1234"><script>' },
  { ...active, consentMode: 'advanced' },
]) {
  const rt = createRuntime({ settings, consentState: { version: 1, necessary: 'granted', analytics: 'granted', updatedAt: new Date().toISOString() } });
  assert.equal(rt.appended.length, 0);
  assert.equal(rt.window.dataLayer, undefined);
  assert.equal(rt.window.gtag, undefined);
}

for (const consentState of [
  undefined,
  { version: 1, necessary: 'granted', analytics: 'denied', updatedAt: new Date().toISOString() },
  { bad: true },
  { version: 0, necessary: 'granted', analytics: 'granted', updatedAt: new Date().toISOString() },
]) {
  const rt = createRuntime({ settings: active, consentState });
  assert.equal(rt.appended.length, 0);
  assert.equal(rt.window.dataLayer, undefined);
  assert.equal(rt.window.gtag, undefined);
}

const granted = { version: 1, necessary: 'granted', analytics: 'granted', updatedAt: new Date().toISOString() };
let rt = createRuntime({ settings: active, consentState: granted });
assert.equal(rt.appended.length, 1);
assert.equal(rt.appended[0].async, true);
assert.equal(rt.appended[0].id, 'easylink-ga4-gtag-js');
assert.equal(rt.appended[0].src, 'https://www.googletagmanager.com/gtag/js?id=G-ABCD1234');
assert.equal(rt.window.dataLayer.length, 5);
assert.deepEqual(Array.from(rt.window.dataLayer[0]).slice(0, 2), ['consent', 'default']);
assert.deepEqual(Array.from(rt.window.dataLayer[1]).slice(0, 2), ['consent', 'update']);
assert.equal(Array.from(rt.window.dataLayer[1])[2].analytics_storage, 'granted');
for (const cmd of [Array.from(rt.window.dataLayer[0])[2], Array.from(rt.window.dataLayer[1])[2]]) {
  assert.equal(cmd.ad_storage, 'denied');
  assert.equal(cmd.ad_user_data, 'denied');
  assert.equal(cmd.ad_personalization, 'denied');
}
assert.equal(Array.from(rt.window.dataLayer[3])[0], 'config');
assert.equal(Array.from(rt.window.dataLayer[3])[2].send_page_view, false);
assert.equal(JSON.stringify(Array.from(rt.window.dataLayer[4])), JSON.stringify(['event', 'page_view', { page_title: 'Demo title', page_location: 'https://site-dev.easylink.hu/arak?x=1', page_path: '/arak?x=1' }]));

rt.event(); rt.event();
assert.equal(rt.appended.length, 1);
assert.equal(rt.window.dataLayer.filter((a) => Array.from(a)[0] === 'config').length, 1);
assert.equal(rt.window.dataLayer.filter((a) => Array.from(a)[1] === 'page_view').length, 1);

rt = createRuntime({ settings: active, consentState: { ...granted, analytics: 'denied' } });
rt.setConsent(granted);
rt.event();
rt.event();
assert.equal(rt.appended.length, 1);
assert.equal(rt.window.dataLayer.filter((a) => Array.from(a)[1] === 'page_view').length, 1);

rt.setConsent({ ...granted, analytics: 'denied' });
rt.event();
assert.equal(rt.appended.length, 1);
assert.equal(rt.window.dataLayer.at(-1)[0], 'consent');
assert.equal(rt.window.dataLayer.at(-1)[1], 'update');
assert.equal(rt.window.dataLayer.at(-1)[2].analytics_storage, 'denied');
assert.equal(rt.window.dataLayer.filter((a) => Array.from(a)[0] === 'config').length, 1);
assert.equal(rt.window.dataLayer.filter((a) => Array.from(a)[1] === 'page_view').length, 1);

rt = createRuntime({ settings: active, consentState: { ...granted, analytics: 'denied' } });
rt.event();
assert.equal(rt.appended.length, 0);
assert.equal(rt.window.dataLayer, undefined);

const settingsModule = fs.readFileSync(new URL('../src/lib/content/settings.ts', import.meta.url), 'utf8');
assert.match(settingsModule, /export type PublicAnalyticsSettings/);
assert.match(settingsModule, /measurementId: active \? a\.ga4MeasurementId : ''/);
assert.match(settingsModule, /finally \{\s*await pool\?\.end\?\.\(\)\.catch/);

const layout = fs.readFileSync(new URL('../src/layouts/BaseLayout.astro', import.meta.url), 'utf8');
assert.match(layout, /<CookieConsent consent=\{publicSettings\.consent\} \/>\s*<Ga4Analytics analytics=\{publicSettings\.analytics\} \/>/);

console.log('ga4-runtime smoke ok');
