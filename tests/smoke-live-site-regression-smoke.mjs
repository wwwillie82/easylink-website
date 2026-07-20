import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildLiveSmokePlan, routeCtaExpectations, assertPageCtaContent, assertAnchor } from '../scripts/smoke-live-site.mjs';
import { HOME_LEGACY_CTA_ROLE } from '../src/lib/content/page-cta-contract.mjs';
import { buildPublicSmokeMetadataFromSnapshot, publicRendererPageCtaRole } from '../src/lib/content/smoke-metadata.mjs';

const defaultCta = {
  eyebrow: 'Fixture globális szemöldök',
  title: 'Fixture globális CTA főcím, nem régi demó szöveg',
  description: 'Fixture globális leírás markánsan eltérő tartalommal.',
  primaryLabel: 'Fixture elsődleges gomb',
  primaryUrl: '/fixture-primary/',
  secondaryLabel: 'Fixture másodlagos gomb',
  secondaryUrl: '/fixture-secondary/',
};

const pages = [
  { route: '/', type: 'home', blocks: [{ blockKey: '/:cta:4', type: 'cta', title: '', body: '', items: [{ ctaMode: 'global' }], status: 'published' }] },
  { route: '/global/', type: 'content_page', blocks: [{ blockKey: 'golden:cta-section', type: 'cta', title: '', body: '', items: [{ presentationRole: 'cta-section', ctaMode: 'global' }], status: 'published' }] },
  { route: '/hidden/', type: 'content_page', blocks: [{ blockKey: 'golden:cta-section', type: 'cta', title: '', body: '', items: [{ presentationRole: 'cta-section', ctaMode: 'hidden' }], status: 'published' }] },
  { route: '/custom/', type: 'content_page', blocks: [{ blockKey: 'golden:cta-section', type: 'cta', title: 'Helyi CTA főcím', body: 'Helyi CTA leírás', items: [{ presentationRole: 'cta-section', ctaMode: 'custom', eyebrow: 'Helyi eyebrow', label: 'Helyi elsődleges', url: '/helyi-elso/', secondaryLabel: 'Helyi másodlagos', secondaryUrl: '/helyi-masodik/' }], status: 'published' }] },
  { route: '/arak-global/', type: 'pricing', blocks: [{ blockKey: '/arak/:cta:2', type: 'cta', title: '', body: '', items: [{ presentationRole: 'pricing-cta', ctaMode: 'global' }], status: 'published' }] },
  { route: '/arak-custom/', type: 'pricing', blocks: [{ blockKey: '/arak/:cta:2', type: 'cta', title: 'Pricing helyi CTA főcím', body: 'Pricing helyi CTA leírás', items: [{ presentationRole: 'pricing-cta', ctaMode: 'custom', eyebrow: 'Pricing eyebrow', label: 'Pricing elsődleges', url: '/pricing-elso/', secondaryLabel: 'Pricing másodlagos', secondaryUrl: '/pricing-masodik/' }], status: 'published' }] },
  { route: '/arak-hidden/', type: 'pricing', blocks: [{ blockKey: '/arak/:cta:2', type: 'cta', title: '', body: '', items: [{ presentationRole: 'pricing-cta', ctaMode: 'hidden' }], status: 'published' }] },
  { route: '/arak/', type: 'content_page', blocks: [{ blockKey: '/arak/:cta:2', type: 'cta', title: 'Route pricing CTA főcím', body: 'Route pricing CTA leírás', items: [{ presentationRole: 'pricing-cta', ctaMode: 'custom', eyebrow: 'Route pricing eyebrow', label: 'Route pricing elsődleges', url: '/route-pricing-elso/' }], status: 'published' }] },
];

const planText = JSON.stringify(buildLiveSmokePlan());
assert.doesNotMatch(planText, /Demót kérek|Próbáld ki ingyen/);

const source = readFileSync(new URL('../scripts/smoke-live-site.mjs', import.meta.url), 'utf8');
assert.doesNotMatch(source, /expected\('home\.hero\.(primaryCta|secondaryCta)'/);
assert.doesNotMatch(source, /expected\('contact\.demo'/);

const snapshot = {
  settings: [{ key: 'defaultCta', value: JSON.stringify(defaultCta) }],
  pages: pages.map((page, index) => ({ id: index + 1, route: page.route, type: page.type, status: 'published' })),
  blocks: pages.flatMap((page, index) => (page.blocks || []).map((block) => ({ ...block, page_id: index + 1 }))),
};
const metadata = buildPublicSmokeMetadataFromSnapshot(snapshot);
assert.equal(metadata.source, 'admin-publish-snapshot');
assert.deepEqual(Object.keys(metadata).sort(), ['defaultCta', 'pages', 'source', 'version']);
assert.deepEqual(Object.keys(metadata.pages.find((page) => page.route === '/arak-custom/')).sort(), ['ctaBlock', 'ctaRole', 'route', 'type']);
assert.equal('blocks' in metadata.pages.find((page) => page.route === '/arak-custom/'), false);
assert.equal('settings' in metadata, false);
assert.equal('navigation' in metadata, false);
assert.equal('media' in metadata, false);

const expectations = routeCtaExpectations(metadata.pages, metadata.defaultCta);
assert.equal(expectations.get('/global/').content.primaryLabel, 'Fixture elsődleges gomb');
assert.equal(expectations.get('/custom/').content.primaryLabel, 'Helyi elsődleges');
assert.equal(expectations.get('/hidden/').shouldRender, false);
assert.equal(publicRendererPageCtaRole({ route: '/', type: 'home' }), HOME_LEGACY_CTA_ROLE);
assert.equal(publicRendererPageCtaRole({ route: '/arak/', type: 'content_page' }), 'pricing-cta');
assert.equal(publicRendererPageCtaRole({ route: '/barmi/', type: 'pricing' }), 'pricing-cta');
assert.equal(publicRendererPageCtaRole({ route: '/custom/', type: 'content_page' }), 'cta-section');
assert.equal(expectations.get('/arak-global/').mode, 'global');
assert.equal(expectations.get('/arak-global/').content.primaryLabel, 'Fixture elsődleges gomb');
assert.equal(expectations.get('/arak-custom/').mode, 'custom');
assert.equal(expectations.get('/arak-custom/').content.primaryLabel, 'Pricing elsődleges');
assert.equal(expectations.get('/arak-custom/').content.primaryUrl, '/pricing-elso/');
assert.equal(expectations.get('/arak-hidden/').mode, 'hidden');
assert.equal(expectations.get('/arak-hidden/').shouldRender, false);
assert.equal(expectations.get('/arak/').mode, 'custom');
assert.equal(expectations.get('/arak/').content.primaryLabel, 'Route pricing elsődleges');

let failures = [];
assertAnchor('<a href="/fixture-primary/" data-easylink-cta-id="site-header-demo">Fixture elsődleges gomb</a>', '/', 'site-header-demo', defaultCta.primaryLabel, defaultCta.primaryUrl, failures);
assert.deepEqual(failures, []);

failures = [];
assertPageCtaContent('/global/', `<section class="section cta"><span>${defaultCta.eyebrow}</span><h2>${defaultCta.title}</h2><p>${defaultCta.description}</p><a href="${defaultCta.primaryUrl}" data-easylink-cta-id="cta-section-primary">${defaultCta.primaryLabel}</a><a href="${defaultCta.secondaryUrl}" data-easylink-cta-id="cta-section-secondary">${defaultCta.secondaryLabel}</a></section>`, expectations.get('/global/'), failures);
assert.deepEqual(failures, []);

failures = [];
assertPageCtaContent('/hidden/', '<main><h1>Nincs CTA</h1></main>', expectations.get('/hidden/'), failures);
assert.deepEqual(failures, []);

failures = [];
assertPageCtaContent('/custom/', '<section class="section cta"><span>Helyi eyebrow</span><h2>Helyi CTA főcím</h2><p>Helyi CTA leírás</p><a href="/helyi-elso/" data-easylink-cta-id="cta-section-primary">Helyi elsődleges</a><a href="/helyi-masodik/" data-easylink-cta-id="cta-section-secondary">Helyi másodlagos</a></section>', expectations.get('/custom/'), failures);
assert.deepEqual(failures, []);

failures = [];
assertPageCtaContent('/custom/', `<section class="section cta"><h2>${defaultCta.title}</h2><a href="${defaultCta.primaryUrl}" data-easylink-cta-id="cta-section-primary">${defaultCta.primaryLabel}</a></section>`, expectations.get('/custom/'), failures);
assert.ok(failures.some((failure) => failure.includes('Helyi')));

failures = [];
assertPageCtaContent('/arak-custom/', '<section class="section cta"><span>Pricing eyebrow</span><h2>Pricing helyi CTA főcím</h2><p>Pricing helyi CTA leírás</p><a href="/pricing-elso/" data-easylink-cta-id="cta-section-primary">Pricing elsődleges</a><a href="/pricing-masodik/" data-easylink-cta-id="cta-section-secondary">Pricing másodlagos</a></section>', expectations.get('/arak-custom/'), failures);
assert.deepEqual(failures, []);

failures = [];
assertPageCtaContent('/arak-hidden/', '<main><h1>Pricing CTA nélkül</h1></main>', expectations.get('/arak-hidden/'), failures);
assert.deepEqual(failures, []);

failures = [];
assertPageCtaContent('/arak/', `<section class="section cta"><h2>${defaultCta.title}</h2><a href="${defaultCta.primaryUrl}" data-easylink-cta-id="cta-section-primary">${defaultCta.primaryLabel}</a></section>`, expectations.get('/arak/'), failures);
assert.ok(failures.some((failure) => failure.includes('Route pricing')));

const smokeSource = readFileSync(new URL('../scripts/smoke-live-site.mjs', import.meta.url), 'utf8');
const metadataSource = readFileSync(new URL('../src/lib/content/smoke-metadata.mjs', import.meta.url), 'utf8');
assert.match(smokeSource, /import \{ PUBLIC_SMOKE_METADATA_PATH, publicRendererPageCtaRole \}/);
assert.match(metadataSource, /import \{ HOME_LEGACY_CTA_ROLE/);
assert.doesNotMatch(smokeSource, /PAGE_CTA_ROLES\.find/);
assert.doesNotMatch(smokeSource, /api\/public\/settings/);
assert.doesNotMatch(metadataSource, /createPool|getPublicSiteSettings|listPublishedPublicPages|DATABASE_URL|DB_HOST/);
