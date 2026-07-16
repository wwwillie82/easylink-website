import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { normalizeSiteSettings, parseSiteSettingsRows } from '../src/lib/admin/settings.mjs';

const s = normalizeSiteSettings({ contact: { email: ' hello@easylink.hu ', phone: ' +36 1 234-5678 ', country: ' Magyarország ' }, analytics: {}, legalDocuments: {} });
assert.equal(s.contact.email, 'hello@easylink.hu');
assert.equal(s.contact.country, 'Magyarország');
assert.equal(parseSiteSettingsRows([{ key: 'contact', value: JSON.stringify({ email: 'info@example.com', city: 'Budapest' }) }]).contact.city, 'Budapest');
assert.throws(() => normalizeSiteSettings({ contact: { email: 'bad' } }), /email/);
assert.throws(() => normalizeSiteSettings({ contact: { phone: 'alert(1)' } }), /telefon/);
assert.throws(() => normalizeSiteSettings({ contact: { city: '<b>x</b>' } }), /kapcsolati/);
assert.equal(normalizeSiteSettings({ contact: { email: '', phone: '' } }).contact.email, '');
assert.equal(normalizeSiteSettings({ analytics: { enabled: true, provider: 'ga4', ga4MeasurementId: 'G-ABC1234', consentMode:'basic', consentConfigurationVersion: 2 }, legalDocuments: { termsPdfPath: '/x.pdf' } }).analytics.provider, 'ga4');

const footer = readFileSync('src/components/Footer.astro', 'utf8');
const contact = readFileSync('src/pages/kapcsolat/index.astro', 'utf8');
assert.match(footer, /publicSettings\.contact/);
assert.match(contact, /contactSettings/);
assert.doesNotMatch(footer, /mailto:hello@easylink\.hu/);
assert.doesNotMatch(contact, /Email: hello@easylink\.hu/);

const layout = readFileSync('src/layouts/BaseLayout.astro', 'utf8');
assert.match(layout, /<Ga4Analytics[\s\S]*<CtaTracking \/>/);
for (const f of ['src/components/Header.astro','src/components/Hero.astro','src/components/CTASection.astro','src/components/Footer.astro','src/pages/kapcsolat/index.astro']) {
  assert.match(readFileSync(f, 'utf8'), /data-easylink-cta/);
}
const cb = readFileSync('src/components/ContentBlocks.astro', 'utf8');
assert.match(cb, /analyticsIntent/);
assert.doesNotMatch(cb, /label.*Demót|url.*mailto.*hello/);

function runtime(consent='granted') {
  const calls=[];
  const listeners=[];
  class Anchor { constructor(ds={}){ this.dataset=ds; this.target=''; } closest(sel){ return sel==='a[data-easylink-cta]'?this:null; } }
  const document={ addEventListener(t,fn,opt){ listeners.push({t,fn,opt}); } };
  const window={ __easylinkGa4RuntimeState:{analyticsGranted: consent==='granted', configured:true}, location:{pathname:'/kapcsolat/', search:'?x=1'}, gtag(...a){ calls.push(a); }, EasylinkConsent:{ getState(){ return {version:1, analytics: consent}; } }, addEventListener(){} };
  const ga4 = readFileSync('src/components/Ga4Analytics.astro','utf8').match(/<script is:inline>([\s\S]*)<\/script>/)[1];
  vm.runInNewContext(ga4, { window, document:{ getElementById(){ return { dataset:{ analyticsSettings: JSON.stringify({active:true,provider:'ga4',measurementId:'G-ABC1234',consentMode:'basic',configurationVersion:1}) } }; }, querySelector(){return null;}, createElement(){return {dataset:{}};}, head:{appendChild(){}} , title:'T'}, console });
  const cta = readFileSync('src/components/CtaTracking.astro','utf8').match(/<script is:inline>([\s\S]*)<\/script>/)[1];
  vm.runInNewContext(cta, { window, document });
  vm.runInNewContext(cta, { window, document });
  return { calls, listeners, click(ds={easylinkCta:'demo',easylinkCtaId:'id',easylinkCtaSlot:'slot'}, extra={}) { listeners[0].fn({ target:new Anchor(ds), defaultPrevented:false, ...extra }); } };
}
let rt=runtime('denied'); rt.click(); assert.equal(rt.calls.filter(c=>c[0]==='event'&&c[1]==='cta_click').length,0);
rt=runtime('granted'); rt.click({easylinkCta:'demo',easylinkCtaId:'site-header-demo',easylinkCtaSlot:'header'}); let ev=rt.calls.find(c=>c[0]==='event'&&c[1]==='cta_click'); assert.equal(ev[1],'cta_click'); assert.equal(ev[2].cta_type,'demo'); assert.equal(ev[2].page_path,'/kapcsolat/'); assert.equal('href' in ev[2], false); assert.equal('email' in ev[2], false); assert.equal(rt.listeners.length,1);
for (const typ of ['trial','email']) { rt=runtime('granted'); rt.click({easylinkCta:typ,easylinkCtaId:'stable-id',easylinkCtaSlot:'moved-slot'}); ev=rt.calls.find(c=>c[0]==='event'&&c[1]==='cta_click'); assert.equal(ev[2].cta_type,typ); }
rt=runtime('granted'); rt.click({easylinkCta:'none',easylinkCtaId:'x',easylinkCtaSlot:'x'}); assert.equal(rt.calls.filter(c=>c[0]==='event'&&c[1]==='cta_click').length,0);
rt=runtime('granted'); rt.click({easylinkCta:'bad',easylinkCtaId:'x',easylinkCtaSlot:'x'}); assert.equal(rt.calls.filter(c=>c[0]==='event'&&c[1]==='cta_click').length,0);
console.log('cta tracking smoke ok');
