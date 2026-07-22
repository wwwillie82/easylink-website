import assert from 'node:assert/strict';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { composePublicSections, pageHeroVariant, normalizeSectionPresentation, resolveRelatedLinksBlock } from '../src/lib/content/section-composition.mjs';
import { publicCardsFromItems, normalizeCardsItems } from '../src/lib/content/block-contracts.mjs';
import { inspect } from '../scripts/adopt-generic-public-presentation.mjs';

const publicRenderer = await readFile(new URL('../src/components/page-renderers/PublicPageRenderer.astro', import.meta.url), 'utf8');
assert.match(publicRenderer, /GenericPublicPageRenderer/);
assert.doesNotMatch(publicRenderer, /SolutionsIndexRenderer|SolutionDetailRenderer|AudiencesIndexRenderer|AudienceDetailRenderer|IntegrationsRenderer|PricingRenderer|ContactRenderer|ContentPageRenderer/);
for (const type of ['solutions_index','solution_detail','audiences_index','audience_detail','integrations','pricing','contact','content_page']) assert.match(publicRenderer, /isSupportedPublicPageType/);

assert.equal(pageHeroVariant({ type: 'solution_detail', presentation: {} }), 'listing');
assert.equal(pageHeroVariant({ type: 'content_page', presentation: { heroVariant: 'detail' } }), 'detail');
assert.equal(pageHeroVariant({ type: 'pricing', presentation: { heroVariant: 'bogus' } }), 'listing');

const blocks = [
  { type: 'text', title: 'ungrouped-1', presentation: { layout: 'nonsense', sectionTheme: 'bad', surface: 'bad', columnRatio: 'url(js)' } },
  { type: 'text', title: 'right', presentation: { sectionGroupKey: 'g', layout: 'grid', gridColumns: 2, columnRatio: '0.85:1.15', columnPosition: 2, surface: 'polished' } },
  { type: 'text', title: 'left', presentation: { sectionGroupKey: 'g', layout: 'grid', gridColumns: 2, columnRatio: '0.85:1.15', columnPosition: 1, surface: 'polished' } },
  { type: 'text', title: 'stack-a', presentation: { sectionGroupKey: 's', sectionTheme: 'gradient-light', layout: 'stack', columnPosition: 1 } },
  { type: 'text', title: 'ungrouped-2' },
];
const sections = composePublicSections(blocks);
assert.deepEqual(sections.map((s) => s.blocks.map((b) => b.title)), [['ungrouped-1'], ['left','right'], ['stack-a'], ['ungrouped-2']]);
assert.equal(sections[0].presentation.layout, 'grid');
assert.equal(sections[0].presentation.sectionTheme, 'default');
assert.deepEqual(composePublicSections([{ type: 'text', title: 'content-a', presentation: { sectionOrder: 2 } }, { type: 'cards', title: 'cards', presentation: { sectionGroupKey: 'cards', sectionOrder: 1, sectionTheme: 'light' } }, { type: 'video', title: 'content-b' }]).map((section) => section.blocks.map((block) => block.title)), [['cards'], ['content-a', 'content-b']]);
assert.equal(sections[1].presentation.layout, 'grid');
assert.equal(sections[1].presentation.columnRatio, '0.85fr 1.15fr');
assert.equal(normalizeSectionPresentation({ layout: 'grid', gridColumns: 2, columnRatio: '1:1' }).columnRatio, '1fr 1fr');
assert.equal(normalizeSectionPresentation({ layout: 'grid', gridColumns: 99, columnRatio: '1:1;background:red' }).gridColumns, 2);
assert.equal(normalizeSectionPresentation({ layout: 'grid', gridColumns: 99, columnRatio: '1:1;background:red' }).columnRatio, '');
for (const gridColumns of [1, 2, 3, 4]) assert.equal(normalizeSectionPresentation({ layout: 'grid', gridColumns }).gridColumns, gridColumns);
for (const gridColumns of [5, 6]) assert.equal(normalizeSectionPresentation({ layout: 'grid', gridColumns }).gridColumns, 2);
const publicSectionSource = await readFile(new URL('../src/components/PublicSection.astro', import.meta.url), 'utf8');
assert.match(publicSectionSource, /repeat\(\$\{presentation.gridColumns \|\| 1\}, 1fr\)/);
assert.match(publicSectionSource, /@media \(max-width: 860px\).*grid-template-columns: 1fr/);

const pages = [
  { id: 1, route: '/a/', slug: 'a', type: 'content_page', title: 'A', status: 'published', sortOrder: 1 },
  { id: 2, route: '/b/', slug: 'b', type: 'content_page', title: 'B', status: 'published', sortOrder: 2 },
  { id: 3, route: '/c/', slug: 'c', type: 'content_page', title: 'C', status: 'draft', sortOrder: 3 },
];
const routeIndex = { pages, byId: new Map(pages.filter((p) => p.status === 'published').map((p) => [String(p.id), p])) };
assert.equal(publicCardsFromItems([{ version: 2, cards: [{ target_type: 'page', target_page_id: 1, title_override: 'AA' }, { target_type: 'legacy', href: '/legacy/', title: 'L' }, { target_type: 'external', href: 'https://example.com/', title: 'E' }], action: { target_type: 'page', target_page_id: 2, label: 'More' } }], { pages: routeIndex.pages }).cards[0].href, '/a/');
assert.throws(() => publicCardsFromItems([{ target_type: 'page', target_page_id: 404, title: 'x' }], { pages: routeIndex.pages }), /target|oldal|missing|található/i);
const related = resolveRelatedLinksBlock({ type: 'related-links', items: [{ target_type: 'page', target_page_id: 2, title_override: 'Override' }, { target_type: 'page', target_page_id: 1 }] }, routeIndex);
assert.deepEqual(related, [{ title: 'Override', href: '/b/' }, { title: 'A', href: '/a/' }]);
assert.throws(() => resolveRelatedLinksBlock({ type: 'related-links', items: [{ target_type: 'page', target_page_id: 3 }] }, routeIndex), /publikus|published|nem található/i);
assert.throws(() => resolveRelatedLinksBlock({ type: 'related-links', items: [{ target_type: 'external', href: 'https://x.test' }] }, routeIndex), /page/);

for (const type of ['solutions_index','solution_detail','audiences_index','audience_detail','integrations','pricing','contact','content_page']) {
  const cta = { type: 'cta', title: 'CTA', items: [{ presentationRole: 'cta-section', label: 'Go', url: '/go/' }] };
  const fixture = { type, presentation: /detail/.test(type) ? { heroVariant: 'detail' } : {}, blocks: [{ type: 'text', title: `${type}-body` }, { type: 'related-links', items: [{ target_type: 'page', target_page_id: 1 }] }, cta] };
  const composed = composePublicSections(fixture.blocks);
  assert.equal(pageHeroVariant(fixture), /detail/.test(type) ? 'detail' : 'listing');
  assert.equal(composed.at(-1).blocks[0].type, 'related-links');
  assert.equal(composed.some((s) => s.blocks.includes(cta)), false);
}




const dbLikeRows = [
  {id:114,page_id:2,block_key:'golden:10:cards:Megoldásaink',type:'cards',status:'published',sort_order:2,presentation:null,title:'Cards title',body:'Cards body',items:'[]'},
  {id:3,page_id:2,block_key:'/megoldasaink/:feature-list:0',type:'feature-list',status:'published',sort_order:1,presentation:null,title:'Feature',body:'Body',items:'[]'},
  {id:120,page_id:2,block_key:'manual:598fbc42-261f-4b8e-ba62-33a1553c3b81',type:'video',status:'published',sort_order:3,presentation:null,title:'Video',body:'Body',items:'[]'},
  {id:121,page_id:2,block_key:'manual:14e66a0a-ebf9-4f85-9ba3-c182bed2a9c7',type:'ai-preview',status:'published',sort_order:4,presentation:null,title:'AI',body:'Body',items:'[]'},
  {id:122,page_id:2,block_key:'manual:68e691be-8397-4f16-8c36-fe9587cd7566',type:'network-visual',status:'published',sort_order:5,presentation:null,title:'Network',body:'Body',items:'[]'},
  {id:115,page_id:9,block_key:'golden:10:cards:Kinek szól?',type:'cards',status:'published',sort_order:10,presentation:null,title:'Cards title',body:'Cards body',items:'[]'},
];

const pageRowsForInspect = [...Array.from({length:15},(_,i)=>i+1).filter(id=>[2,3,4,5,6,7,8,9,10,11,12,13,14,15].includes(id)).map(id=>({ id, route: new Map([[3,'/megoldasaink/penzugy-szamlazas/'],[4,'/megoldasaink/hr-munkaugy/'],[5,'/megoldasaink/crm-ugyfelkezeles/'],[6,'/megoldasaink/dokumentumkezeles-adminisztracio/'],[7,'/megoldasaink/kontrolling/'],[8,'/megoldasaink/ai-asszisztens/'],[10,'/kinek-szol/hotelek-szallashelyek/'],[11,'/kinek-szol/vendeglatohelyek/'],[12,'/kinek-szol/szolgaltato-vallalkozasok/'],[2,'/megoldasaink/'],[9,'/kinek-szol/'],[13,'/integraciok/'],[14,'/arak/'],[15,'/kapcsolat/']]).get(id), type: id===2?'solutions_index':id===9?'audiences_index':id<9?'solution_detail':id<13?'audience_detail':id===13?'integrations':id===14?'pricing':'contact', status:'published', presentation: id<13 && id !== 2 && id !== 9 ? JSON.stringify({heroVariant:'detail'}) : null }))];
const expectedGroupRows = [{id:51,page_id:13,block_key:'/integraciok/:text:0',type:'text',status:'published',presentation:null,title:'t',body:'b',items:'[]'},{id:52,page_id:13,block_key:'/integraciok/:cards:1',type:'cards',status:'published',presentation:null,title:'Integrációs irányok',body:'Előkészített kapcsolódási irányok: nem kész runtime integrációs állítások.',items:'[]'},{id:53,page_id:14,block_key:'/arak/:feature-list:0',type:'feature-list',status:'published',presentation:null,title:'t',body:'b',items:'[]'},{id:117,page_id:14,block_key:'golden:20:text:Demó alapján pontosítunk',type:'text',status:'published',presentation:null,title:'t',body:'b',items:'[]'},{id:55,page_id:15,block_key:'/kapcsolat/:cta:0',type:'cta',status:'published',presentation:null,title:'t',body:'b',items:'[]'},{id:56,page_id:15,block_key:'/kapcsolat/:feature-list:1',type:'feature-list',status:'published',presentation:null,title:'t',body:'b',items:'[]'}];
const relatedTargetsForInspect = new Map([[3,[4,5,6]],[4,[3,5,6]],[5,[3,4,6]],[6,[3,4,5]],[7,[3,4,5]],[8,[3,4,5]],[10,[11,12]],[11,[10,12]],[12,[10,11]]]);
const relatedRowsForInspect = [...relatedTargetsForInspect.entries()].map(([page_id, targets], index) => ({ id: 800 + index, page_id, block_key: `generic-related-links:${page_id}`, type: 'related-links', title: 'Kapcsolódó oldalak', body: '', status: 'published', sort_order: 800, items: JSON.stringify(targets.map((target_page_id) => ({ target_type: 'page', target_page_id, title_override: '' }))) }));
const inspectPlan = await inspect({ async query(sql, params = []) { if (sql.includes('FROM site_pages')) return [pageRowsForInspect, null]; if (sql.includes('WHERE id IN') && sql.includes('site_content_blocks') && params.length === 6 && !sql.includes('sort_order,presentation')) return [expectedGroupRows, null]; if (sql.includes('WHERE id IN') && sql.includes('site_content_blocks') && params.length === 6 && sql.includes('sort_order,presentation')) return [dbLikeRows, null]; if (sql.includes("block_key LIKE 'generic-related-links:%'")) return [relatedRowsForInspect, null]; return [[], null]; } });
const adoptedPresentationsFromInspect = Object.fromEntries(inspectPlan.changes.filter((change) => change.kind === 'block').map((change) => [String(change.id), change.want]));
assert.deepEqual(Object.keys(adoptedPresentationsFromInspect).filter((id) => ['3','114','120','121','122'].includes(id)).sort(), ['114','120','121','122','3'].sort());

const fixturePagePath = new URL('../src/pages/generic-public-fixture.astro', import.meta.url);
await writeFile(fixturePagePath, `---
import GenericPublicPageRenderer from '@/components/page-renderers/GenericPublicPageRenderer.astro';
import { buildPublicRouteIndex } from '@/lib/content/public-pages';
const cta = (title = 'Fixture CTA', role = 'cta-section') => ({ type: 'cta', title, body: 'CTA body', status: 'published', sort_order: 900, blockKey: title.toLowerCase().replace(/\\s+/g, '-'), items: [{ presentationRole: role, ctaMode: 'custom', label: 'Elsődleges', url: '/kapcsolat/', secondaryLabel: 'Másodlagos', secondaryUrl: '/arak/' }] });
const adoptedPresentations = ${JSON.stringify(adoptedPresentationsFromInspect)};
const cardsItems = [{ version: 2, cards: [{ target_type: 'page', target_page_id: 21, title_override: 'Pénzügy fixture' }, { target_type: 'page', target_page_id: 22, title_override: 'HR fixture' }], action: { target_type: 'legacy', href: '/megoldasaink/', label: 'Összes' } }];
const pages = [
  { id: 10, route: '/fixture/megoldasaink/', slug: 'megoldasaink', type: 'solutions_index', title: 'Megoldásaink fixture', seoTitle: '', seoDescription: '', heroEyebrow: 'Megoldásaink', heroTitle: 'Megoldásaink', heroDescription: 'Listing fixture', heroAsset: '', presentation: { heroVariant: 'listing' }, status: 'published', sortOrder: 1, blocks: [
    { type: 'feature-list', title: 'Lista előszó', body: 'Első published blokk', sort_order: 1, status: 'published', presentation: adoptedPresentations['3'], items: ['A'] },
    { type: 'cards', title: 'Nem megjelenő cards cím', body: 'Nem megjelenő cards lead', sort_order: 2, status: 'published', presentation: adoptedPresentations['114'], items: cardsItems },
    { type: 'video', title: 'Lista videó', body: 'Video body', sort_order: 3, status: 'published', presentation: adoptedPresentations['120'], items: [{}] },
    { type: 'ai-preview', title: 'Lista AI preview', body: 'AI body', sort_order: 4, status: 'published', presentation: adoptedPresentations['121'], items: [] },
    { type: 'network-visual', title: 'Lista network', body: 'Network body', sort_order: 5, status: 'published', presentation: adoptedPresentations['122'], items: [{}] },
    cta('Solutions fixture CTA'),
  ] },
  { id: 11, route: '/fixture/kinek-szol/', slug: 'kinek-szol', type: 'audiences_index', title: 'Kinek szól fixture', seoTitle: '', seoDescription: '', heroEyebrow: 'Kinek szól?', heroTitle: 'Kinek szól?', heroDescription: 'Audience listing fixture', heroAsset: '', presentation: { heroVariant: 'listing' }, status: 'published', sortOrder: 2, blocks: [
    { type: 'cards', title: 'Audience cards title', body: 'Audience cards body', sort_order: 1, status: 'published', presentation: adoptedPresentations['115'], items: cardsItems }, cta('Audience fixture CTA') ] },
  { id: 12, route: '/fixture/integraciok/', slug: 'integraciok', type: 'integrations', title: 'Integrációk fixture', seoTitle: '', seoDescription: '', heroEyebrow: 'Integrációk', heroTitle: 'Integrációk', heroDescription: 'Integrations fixture', heroAsset: '', presentation: { heroVariant: 'listing' }, status: 'published', sortOrder: 3, blocks: [
    { type: 'text', title: 'Csomópontok', body: 'Nem késznek állított ígéretek...', sort_order: 1, status: 'published', presentation: { sectionGroupKey: 'fixture-integrations-main', sectionTheme: 'gradient-light', layout: 'stack', columnPosition: 1, contentLayout: 'lead', headingScale: 'display' }, items: [] },
    { type: 'cards', title: 'Integrációs irányok', body: 'Előkészített kapcsolódási irányok: nem kész runtime integrációs állítások.', sort_order: 2, status: 'published', presentation: { sectionGroupKey: 'fixture-integrations-main', sectionTheme: 'gradient-light', layout: 'stack', columnPosition: 2 }, items: cardsItems },
    { type: 'text', title: 'Fontos', body: 'Fontos keret szöveg', sort_order: 3, status: 'published', presentation: { sectionGroupKey: 'fixture-integrations-main', sectionTheme: 'gradient-light', layout: 'stack', columnPosition: 3, surfaceVariant: 'emphasis' }, items: [] }, cta('Integrations fixture CTA') ] },
  { id: 13, route: '/fixture/arak/', slug: 'arak', type: 'pricing', title: 'Árak fixture', seoTitle: '', seoDescription: '', heroEyebrow: 'Árak', heroTitle: 'Árak', heroDescription: 'Pricing fixture', heroAsset: '', presentation: { heroVariant: 'listing' }, status: 'published', sortOrder: 4, blocks: [
    { type: 'feature-list', title: 'Mitől függhet az ár?', sort_order: 1, status: 'published', presentation: { sectionGroupKey: 'fixture-pricing-main', layout: 'grid', gridColumns: 2, columnRatio: '1:1', columnPosition: 1, surface: 'polished', headingScale: 'section' }, items: ['Moduloktól'] },
    { type: 'text', title: 'Demó alapján pontosítunk', body: 'Pricing text', sort_order: 2, status: 'published', presentation: { sectionGroupKey: 'fixture-pricing-main', layout: 'grid', gridColumns: 2, columnRatio: '1:1', columnPosition: 2, surface: 'polished', headingScale: 'section', surfaceVariant: 'gradient' }, items: [] }, cta('Pricing fixture CTA', 'pricing-cta') ] },
  { id: 14, route: '/fixture/kapcsolat/', slug: 'kapcsolat', type: 'contact', title: 'Kapcsolat fixture', seoTitle: '', seoDescription: '', heroEyebrow: 'Kapcsolat', heroTitle: 'Kapcsolat', heroDescription: 'Contact fixture', heroAsset: '', presentation: { heroVariant: 'listing' }, status: 'published', sortOrder: 5, blocks: [
    { type: 'cta', title: 'Írj nekünk', body: 'Email: contact@easylink.hu', sort_order: 1, status: 'published', presentation: { sectionGroupKey: 'fixture-contact-main', layout: 'grid', gridColumns: 2, columnRatio: '0.85:1.15', columnPosition: 1, surface: 'polished', headingScale: 'prominent', bodyWhitespace: 'preserve-lines' }, blockKey: 'fixture-contact-inline', items: [{ label: 'Email írása', url: 'mailto:contact@easylink.hu', secondaryLabel: 'Árak', secondaryUrl: '/arak/' }] },
    { type: 'feature-list', title: 'Miben segítünk?', sort_order: 2, status: 'published', presentation: { sectionGroupKey: 'fixture-contact-main', layout: 'grid', gridColumns: 2, columnRatio: '0.85:1.15', columnPosition: 2, surface: 'polished', headingScale: 'prominent' }, items: ['Egyeztetés'] }, cta('Contact fixture CTA') ] },
  { id: 15, route: '/fixture/tartalom/', slug: 'tartalom', type: 'content_page', title: 'Content page fixture', seoTitle: '', seoDescription: '', heroEyebrow: 'Tartalom', heroTitle: 'Content page fixture', heroDescription: 'Content fixture', heroAsset: '', presentation: { heroVariant: 'listing' }, status: 'published', sortOrder: 6, blocks: [{ type: 'text', title: 'Content block marker', body: 'Default content', status: 'published', items: [] }, cta('Content fixture CTA')] },
  { id: 21, route: '/fixture/megoldasaink/penzugy/', slug: 'penzugy', type: 'solution_detail', title: 'Pénzügy target', status: 'published', sortOrder: 21, blocks: [] },
  { id: 22, route: '/fixture/megoldasaink/hr/', slug: 'hr', type: 'solution_detail', title: 'HR target', status: 'published', sortOrder: 22, blocks: [] },
  { id: 23, route: '/fixture/kinek-szol/a/', slug: 'a', type: 'audience_detail', title: 'Audience target A', status: 'published', sortOrder: 23, blocks: [] },
];
const routeIndex = buildPublicRouteIndex(pages);
---
{pages.filter((page) => page.id < 20).map((page) => <article data-fixture-page={page.type}><GenericPublicPageRenderer page={page} routeIndex={routeIndex} /></article>)}
`);

const build = spawnSync('npm', ['run', 'build'], { encoding: 'utf8', stdio: 'pipe', env: { ...process.env } });
await rm(fixturePagePath, { force: true });
assert.equal(build.status, 0, `npm run build failed in generic renderer smoke\nSTDOUT:\n${build.stdout}\nSTDERR:\n${build.stderr}`);
const html = async (route) => readFile(new URL(`../dist${route}index.html`, import.meta.url), 'utf8');
const solutionsHtml = await html('/megoldasaink/');
const audiencesHtml = await html('/kinek-szol/');
const solutionDetailHtml = await html('/megoldasaink/penzugy-szamlazas/');
const audienceDetailHtml = await html('/kinek-szol/hotelek-szallashelyek/');
const integrationsHtml = await html('/integraciok/');
const pricingHtml = await html('/arak/');
const contactHtml = await html('/kapcsolat/');
const contentPageHtml = await html('/generic-public-fixture/');
const fixtureHtml = contentPageHtml;
assert.match(solutionsHtml, /listing-card/);
assert.match(audiencesHtml, /listing-card/);
for (const expectedHref of ['/megoldasaink/penzugy-szamlazas/', '/megoldasaink/hr-munkaugy/', '/kinek-szol/hotelek-szallashelyek/', '/kinek-szol/vendeglatohelyek/']) {
  const source = expectedHref.startsWith('/megoldasaink/') ? solutionsHtml : audiencesHtml;
  assert.match(source, new RegExp(`href="${expectedHref}"`), `static listing card href missing: ${expectedHref}`);
}
assert.ok(solutionDetailHtml.indexOf('content-card') < solutionDetailHtml.indexOf('related') && solutionDetailHtml.indexOf('related') < solutionDetailHtml.lastIndexOf('cta-section'));
assert.ok(audienceDetailHtml.indexOf('content-card') < audienceDetailHtml.indexOf('related') && audienceDetailHtml.indexOf('related') < audienceDetailHtml.lastIndexOf('cta-section'));
assert.equal((solutionDetailHtml.match(/class="button button-secondary"/g) || []).length >= 3, true, 'static solution detail must render related sibling links');
assert.equal((audienceDetailHtml.match(/class="button button-secondary"/g) || []).length >= 2, true, 'static audience detail must render related sibling links');
assert.match(integrationsHtml, /generic-public-section--gradient-light[\s\S]*data-section-layout="stack"/);
assert.match(integrationsHtml, /<span class="eyebrow"[^>]*>Integrációs irányok<\/span>[\s\S]*<h2[^>]*>Kapcsolódások, adatáramlás, tisztább működés\.<\/h2>/);
assert.match(pricingHtml, /generic-public-section--surface-polished[\s\S]*--public-section-columns: 1fr 1fr/);
assert.match(contactHtml, /generic-public-section--surface-polished[\s\S]*--public-section-columns: 0.85fr 1.15fr/);
assert.match(contactHtml, /data-easylink-cta="email"|data-easylink-cta="demo"|mailto:/);
assert.match(fixtureHtml, /data-fixture-page="content_page"[\s\S]*Content block marker/);
assert.ok(fixtureHtml.indexOf('listing-card') < fixtureHtml.indexOf('Lista előszó') && fixtureHtml.indexOf('Lista előszó') < fixtureHtml.indexOf('Lista videó') && fixtureHtml.indexOf('Lista videó') < fixtureHtml.indexOf('Lista AI preview') && fixtureHtml.indexOf('Lista AI preview') < fixtureHtml.indexOf('Lista network') && fixtureHtml.indexOf('Lista network') < fixtureHtml.indexOf('Solutions fixture CTA'), 'solutions listing cards/content/CTA order must stay stable');
assert.match(fixtureHtml, /generic-public-section--light[\s\S]*listing-card[\s\S]*<\/section>[\s\S]*generic-public-section--default[\s\S]*Lista előszó[\s\S]*Lista videó[\s\S]*Lista AI preview[\s\S]*Lista network/);
assert.doesNotMatch(fixtureHtml, /Nem megjelenő cards cím|Nem megjelenő cards lead|Audience cards title|Audience cards body/);
assert.match(fixtureHtml, /Csomópontok[\s\S]*Nem késznek állított ígéretek/);
assert.match(fixtureHtml, /<span class="eyebrow"[^>]*>Csomópontok<\/span>[\s\S]*<h2[^>]*>Nem késznek állított ígéretek\.\.\.<\/h2>[\s\S]*<h2[^>]*>Integrációs irányok<\/h2>[\s\S]*<p[^>]*>Előkészített kapcsolódási irányok: nem kész runtime integrációs állítások\.<\/p>[\s\S]*listing-card/);
assert.match(fixtureHtml, /content-card--layout-lead/);
assert.match(fixtureHtml, /content-card--surface-emphasis/);
assert.match(fixtureHtml, /content-card--surface-gradient/);
assert.match(fixtureHtml, /content-card--heading-section/);
assert.match(await readFile(new URL('../src/components/ContentBlocks.astro', import.meta.url), 'utf8'), /content-card--heading-prominent h2 \{ font-size: clamp\(1\.8rem, 4vw, 3rem\); \}/);
assert.match(fixtureHtml, /content-card--body-preserve-lines/);
assert.match(fixtureHtml, /content-card--heading-prominent/);
assert.match(fixtureHtml, /generic-public-section--light/);
assert.match(fixtureHtml, /--public-section-columns: 1fr 1fr/);
assert.match(fixtureHtml, /--public-section-columns: 0.85fr 1.15fr/);
assert.match(fixtureHtml, /href="mailto:contact@easylink.hu"[^>]*data-easylink-cta="email"[^>]*data-easylink-cta-id="fixture-contact-inline"[^>]*data-easylink-cta-slot="fixture-contact-inline"/);
assert.ok(fixtureHtml.indexOf('Mitől függhet az ár?') < fixtureHtml.indexOf('Demó alapján pontosítunk') && fixtureHtml.indexOf('Demó alapján pontosítunk') < fixtureHtml.indexOf('Pricing fixture CTA'), 'pricing group and CTA order must be stable');
for (const rendered of [solutionsHtml, audiencesHtml, solutionDetailHtml, audienceDetailHtml, integrationsHtml, pricingHtml, contactHtml]) {
  assert.equal((rendered.match(/<section class=\"section cta-section/g) || []).length <= 1, true, 'page CTA must not duplicate');
}

let rows = [{ id: 1, page_id: 3, block_key: 'generic-related-links:3', type: 'related-links', status: 'draft', sort_order: 800, items: JSON.stringify([{target_type:'page',target_page_id:4,title_override:''},{target_type:'page',target_page_id:5,title_override:''},{target_type:'page',target_page_id:6,title_override:''}]), title: 'Kapcsolódó oldalak', body: '', presentation: null }];
const makeConn = (status='draft') => ({ query: async (sql, params) => {
  if (sql.includes('FROM site_pages')) return [[...Array.from({length:15},(_,i)=>i+1).filter(id=>[2,3,4,5,6,7,8,9,10,11,12,13,14,15].includes(id)).map(id=>({ id, route: new Map([[3,'/megoldasaink/penzugy-szamlazas/'],[4,'/megoldasaink/hr-munkaugy/'],[5,'/megoldasaink/crm-ugyfelkezeles/'],[6,'/megoldasaink/dokumentumkezeles-adminisztracio/'],[7,'/megoldasaink/kontrolling/'],[8,'/megoldasaink/ai-asszisztens/'],[10,'/kinek-szol/hotelek-szallashelyek/'],[11,'/kinek-szol/vendeglatohelyek/'],[12,'/kinek-szol/szolgaltato-vallalkozasok/'],[2,'/megoldasaink/'],[9,'/kinek-szol/'],[13,'/integraciok/'],[14,'/arak/'],[15,'/kapcsolat/']]).get(id), type: id===2?'solutions_index':id===9?'audiences_index':id<9?'solution_detail':id<13?'audience_detail':id===13?'integrations':id===14?'pricing':'contact', status:'published', presentation: id<13 ? JSON.stringify({heroVariant:'detail'}) : null }))], null];
  if (sql.includes('WHERE id IN') && sql.includes('site_content_blocks') && params.length === 6 && !sql.includes('sort_order,presentation')) return [[{id:51,page_id:13,block_key:'/integraciok/:text:0',type:'text',status:'published',presentation:JSON.stringify({sectionGroupKey:'integrations-main',sectionTheme:'gradient-light',layout:'stack',columnPosition:1,contentLayout:'lead',headingScale:'display'}),title:'t',body:'b',items:'[]'},{id:52,page_id:13,block_key:'/integraciok/:cards:1',type:'cards',status:'published',presentation:JSON.stringify({sectionGroupKey:'integrations-main',sectionTheme:'gradient-light',layout:'stack',columnPosition:2}),title:'Integrációs irányok',body:'Előkészített kapcsolódási irányok: nem kész runtime integrációs állítások.',items:'[]'},{id:53,page_id:14,block_key:'/arak/:feature-list:0',type:'feature-list',status:'published',presentation:JSON.stringify({sectionGroupKey:'pricing-main',sectionTheme:'default',layout:'grid',gridColumns:2,columnRatio:'1:1',columnPosition:1,surface:'polished',headingScale:'section'}),title:'t',body:'b',items:'[]'},{id:117,page_id:14,block_key:'golden:20:text:Demó alapján pontosítunk',type:'text',status:'published',presentation:JSON.stringify({sectionGroupKey:'pricing-main',sectionTheme:'default',layout:'grid',gridColumns:2,columnRatio:'1:1',columnPosition:2,surface:'polished',headingScale:'section',surfaceVariant:'gradient'}),title:'t',body:'b',items:'[]'},{id:55,page_id:15,block_key:'/kapcsolat/:cta:0',type:'cta',status:'published',presentation:JSON.stringify({sectionGroupKey:'contact-main',sectionTheme:'default',layout:'grid',gridColumns:2,columnRatio:'0.85:1.15',columnPosition:1,surface:'polished',headingScale:'prominent',bodyWhitespace:'preserve-lines'}),title:'t',body:'b',items:'[]'},{id:56,page_id:15,block_key:'/kapcsolat/:feature-list:1',type:'feature-list',status:'published',presentation:JSON.stringify({sectionGroupKey:'contact-main',sectionTheme:'default',layout:'grid',gridColumns:2,columnRatio:'0.85:1.15',columnPosition:2,surface:'polished',headingScale:'prominent'}),title:'t',body:'b',items:'[]'}], null];
  if (sql.includes('WHERE id IN') && sql.includes('site_content_blocks') && params.length === 6 && sql.includes('sort_order,presentation')) return [dbLikeRows.map((row) => ({ ...row, presentation: JSON.stringify(adoptedPresentationsFromInspect[String(row.id)] || {}) })), null];
  if (sql.includes("block_key LIKE 'generic-related-links:%'")) return [[...rows.map((row) => ({ ...row, status })), ...[4,5,6,7,8,10,11,12].map(id => ({...rows[0], id, page_id:id, block_key:`generic-related-links:${id}`, status, items: JSON.stringify((new Map([[4,[3,5,6]],[5,[3,4,6]],[6,[3,4,5]],[7,[3,4,5]],[8,[3,4,5]],[10,[11,12]],[11,[10,12]],[12,[10,11]]]).get(id)).map(target_page_id=>({target_type:'page',target_page_id,title_override:''}))) }))], null];
  return [[{ title: 'Kapcsolódó oldalak', body: '', items: rows[0].items }], null];
}});
assert.equal((await inspect(makeConn('draft'))).changes.filter(c=>c.kind==='related-publish').length, 9);
assert.equal((await inspect(makeConn('published'))).changes.length, 0);
rows[0] = { ...rows[0], items: '[]' };
await assert.rejects(() => inspect(makeConn('draft')), /Conflicting existing related-links block/);

const files = ['SolutionsIndexRenderer','SolutionDetailRenderer','AudiencesIndexRenderer','AudienceDetailRenderer','IntegrationsRenderer','PricingRenderer','ContactRenderer','ContentPageRenderer'];
for (const name of files) assert.doesNotMatch(publicRenderer, new RegExp(name));
console.log('generic public renderer smoke ok');
