import assert from 'node:assert/strict';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const fixturePagePath = new URL('../src/pages/generic-contact-inline-fixture.astro', import.meta.url);
await writeFile(fixturePagePath, `---
import GenericPublicPageRenderer from '@/components/page-renderers/GenericPublicPageRenderer.astro';
const page = { id: 501, route: '/fixture/contact-inline/', slug: 'contact-inline', type: 'contact', title: 'Contact inline fixture', seoTitle: '', seoDescription: '', heroEyebrow: 'Kapcsolat', heroTitle: 'Kapcsolat', heroDescription: 'Fixture', heroAsset: '', presentation: { heroVariant: 'listing' }, status: 'published', sortOrder: 1, blocks: [
  { type: 'cta', title: 'Írj nekünk', body: 'Email: contact@easylink.hu\\nTelefon: +36 1 234 5678', status: 'published', blockKey: 'contact-inline-fixture', presentation: { sectionGroupKey: 'contact-inline-main', layout: 'grid', gridColumns: 2, columnRatio: '0.85:1.15', columnPosition: 1, surface: 'polished', headingScale: 'prominent', bodyWhitespace: 'preserve-lines' }, items: [{ label: 'Email írása', url: 'mailto:contact@easylink.hu', secondaryLabel: 'Másodlagos', secondaryUrl: '/arak/' }] },
  { type: 'feature-list', title: 'Miben tudunk segíteni?', status: 'published', presentation: { sectionGroupKey: 'contact-inline-main', layout: 'grid', gridColumns: 2, columnRatio: '0.85:1.15', columnPosition: 2, surface: 'polished', headingScale: 'prominent' }, items: ['Megnézzük, mely modulok illenek.'] },
  { type: 'cta', title: 'Oldal végi CTA', body: 'CTA body', status: 'published', blockKey: 'contact-page-cta', items: [{ presentationRole: 'cta-section', ctaMode: 'custom', label: 'Demót kérek', url: '/kapcsolat/' }] },
] };
const routeIndex = { pages: [page], byId: new Map([[String(page.id), page]]) };
---
<GenericPublicPageRenderer page={page} routeIndex={routeIndex} />
`);
const build = spawnSync('npm', ['run', 'build'], { encoding: 'utf8', stdio: 'pipe', env: { ...process.env } });
await rm(fixturePagePath, { force: true });
assert.equal(build.status, 0, `contact fixture build failed\nSTDOUT:\n${build.stdout}\nSTDERR:\n${build.stderr}`);
const html = await readFile(new URL('../dist/generic-contact-inline-fixture/index.html', import.meta.url), 'utf8');
assert.match(html, /generic-public-section--surface-polished/);
assert.match(html, /--public-section-columns: 0.85fr 1.15fr/);
assert.match(html, /content-card--body-preserve-lines/);
assert.match(html, /content-card--heading-prominent/);
assert.match(html, /Email: contact@easylink.hu/);
assert.match(html, /Telefon: \+36 1 234 5678/);
assert.match(html, /href="mailto:contact@easylink.hu"[^>]*data-easylink-cta="email"[^>]*data-easylink-cta-id="contact-inline-fixture"[^>]*data-easylink-cta-slot="contact-inline-fixture"/);
assert.match(html, /href="\/arak\/"[^>]*>Másodlagos<\/a>/);
assert.ok(html.indexOf('Írj nekünk') < html.indexOf('Miben tudunk segíteni?'), 'contact inline CTA card must stay before feature card');
assert.ok(html.indexOf('Miben tudunk segíteni?') < html.lastIndexOf('Oldal végi CTA'), 'page CTA must remain last');
assert.equal((html.match(/<section class="section cta/g) || []).length, 1, 'page CTA must render exactly once');
console.log('Contact generic renderer admin parity smoke passed.');
