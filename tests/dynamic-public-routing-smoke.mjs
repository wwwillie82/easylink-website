import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import ts from 'typescript';
import { createRequire } from 'node:module';
const nodeRequire = createRequire(import.meta.url);
import { validateRelease } from '../src/lib/admin/publish.mjs';
import { assertRootHomePage, validateRootHomeSnapshot } from '../src/lib/content/root-invariant.mjs';

function loadPublicPagesModule() {
  let source = readFileSyncText('src/lib/content/public-pages.ts');
  source = source.replace(/import[^\n]+from '@\/content\/audiences';\n/, "const publishedAudiences = [{ title: 'Hotel', slug: 'hotel', url: '/kinek-szol/hotel/' }];\n");
  source = source.replace(/import[^\n]+from '@\/content\/solutions';\n/, "const publishedSolutions = [{ title: 'CRM', slug: 'crm', url: '/megoldasaink/crm/' }];\n");
  source = source.replace(/import \{ staticPages, type SitePage \} from '\.\/static';\n/, 'const staticPages = [];\n');
  return loadTsModule(source);
}

function loadProviderModule(publicPages) {
  let source = readFileSyncText('src/lib/content/provider.ts');
  source = source.replace(/import \{ staticNavigationItems, staticPages, getStaticPageByRoute, type SitePage \} from '\.\/static';\n/, "const staticNavigationItems = [{ title: 'Static', href: '/static/', sortOrder: 1, status: 'published' }];\nconst staticPages = [{ route: '/static/', slug: 'static', type: 'content_page', title: 'Static', seoTitle: 'Static', seoDescription: '', heroEyebrow: '', heroTitle: 'Static', heroDescription: '', heroAsset: '', status: 'published', sortOrder: 1, blocks: [] }];\nconst getStaticPageByRoute = (route) => staticPages.find((page) => page.route === route && page.status === 'published');\n");
  source = source.replace(/import \{ buildPublicRouteIndex, normalizePublicRoute, publishedNonHomePages, type PublishedPublicPagesResult, type PublicContentMode \} from '\.\/public-pages';\n/, '');
  source = source.replace(/const env = \(import\.meta as unknown as \{ env\?: SourceEnv \}\)\.env \?\? \{\};/, 'const env = {};');
  return loadTsModule(source, { buildPublicRouteIndex: publicPages.buildPublicRouteIndex, normalizePublicRoute: publicPages.normalizePublicRoute, publishedNonHomePages: publicPages.publishedNonHomePages });
}

function readFileSyncText(path) {
  return nodeRequire('node:fs').readFileSync(path, 'utf8');
}

function loadTsModule(source, injected = {}) {
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  const module = { exports };
  const require = (name) => {
    if (name === '@/lib/db/repository') throw new Error('import error');
    throw new Error(`Unexpected require: ${name}`);
  };
  Function('exports', 'module', 'require', ...Object.keys(injected), js)(exports, module, require, ...Object.values(injected));
  return module.exports;
}

const publicPages = loadPublicPagesModule();
const providerModule = loadProviderModule(publicPages);

assert.doesNotThrow(() => assertRootHomePage({ id: 1, route: '/', type: 'home', title: 'Home' }, 'test'));
assert.throws(() => assertRootHomePage({ id: 2, route: '/', type: 'content_page', title: 'Wrong Root' }, 'test'), /id=2.*Wrong Root.*content_page.*route=\//);
assert.deepEqual(validateRootHomeSnapshot([{ id: 3, route: '/', type: 'home', title: 'Draft Home', status: 'draft' }]), { ok: true });
assert.equal(validateRootHomeSnapshot([]).ok, false);
assert.match(validateRootHomeSnapshot([]).error, /Hiányzó \/ route rekord/);
assert.match(validateRootHomeSnapshot([{ id: 4, route: '/masik/', type: 'home', title: 'Misplaced Home' }]).error, /Home típus csak route=\//);
assert.match(validateRootHomeSnapshot([{ id: 5, route: '/', type: 'home', title: 'Root A' }, { id: 6, route: '//', type: 'home', title: 'Root B' }]).error, /Több normalizált \/ route rekord.*Root A.*Root B/);


const pages = ['src/pages/index.astro', 'src/pages/[...slug].astro', 'src/pages/robots.txt.ts'];
for (const file of pages) assert.equal(existsSync(file), true, `${file} should remain`);
for (const removed of ['src/pages/megoldasaink/index.astro','src/pages/megoldasaink/[slug].astro','src/pages/kinek-szol/index.astro','src/pages/kinek-szol/[slug].astro','src/pages/integraciok/index.astro','src/pages/arak/index.astro','src/pages/kapcsolat/index.astro']) assert.equal(existsSync(removed), false, `${removed} should be deleted`);

let listCalls = 0;
const dbPages = [
  { route: '/', slug: 'home', type: 'home', title: 'Home', status: 'published', sortOrder: 0, blocks: [] },
  { route: '/megoldasainkok/', slug: 'megoldasainkok', type: 'solutions_index', title: 'Megoldásaink', status: 'published', sortOrder: 1, blocks: [] },
  { route: '/uzleti-megoldasok/crm-rendszer/', slug: 'crm', type: 'solution_detail', title: 'CRM', status: 'published', sortOrder: 2, blocks: [] },
  { route: '/dijak/', slug: 'dijak', type: 'pricing', title: 'Díjak', status: 'published', sortOrder: 3, blocks: [] },
  { route: '/elerhetoseg/', slug: 'elerhetoseg', type: 'contact', title: 'Elérhetőség', status: 'published', sortOrder: 4, blocks: [] },
  { route: '/draft/', slug: 'draft', type: 'content_page', title: 'Draft', status: 'draft', sortOrder: 5, blocks: [] },
];
const provider = providerModule.createPublicContentProvider({ sourceEnv: { SITE_CONTENT_SOURCE: 'db', DB_HOST: 'db', DB_NAME: 'site', DB_USER: 'site' }, dbReaderFactory: async () => ({
  async listPublishedPublicPages() { listCalls += 1; return dbPages.filter((page) => page.status === 'published'); },
  async getPageByRouteAny(route) { return dbPages.find((page) => page.route === route) ?? null; },
  async getPageByRoute(route) { return dbPages.find((page) => page.route === route && page.status === 'published') ?? null; },
  async listNavigation() { return []; },
}) });
const listed = await provider.listPublishedPublicPages();
assert.equal(listed.mode, 'db-authoritative');
assert.deepEqual(listed.pages.map((page) => page.route), ['/megoldasainkok/', '/uzleti-megoldasok/crm-rendszer/', '/dijak/', '/elerhetoseg/']);
assert.equal(listCalls, 1);
const staticPaths = listed.pages.map((page) => ({ params: { slug: publicPages.routeToStaticParam(page.route) }, props: { page, allPages: listed.pages, mode: listed.mode } }));
assert.deepEqual(staticPaths.map((path) => path.params.slug), ['megoldasainkok', 'uzleti-megoldasok/crm-rendszer', 'dijak', 'elerhetoseg']);
assert.equal(staticPaths.some((path) => path.params.slug === 'megoldasaink'), false);
const routeIndex = publicPages.buildPublicRouteIndex(staticPaths[1].props.allPages);
assert.equal(routeIndex.byRoute.get('/uzleti-megoldasok/crm-rendszer/').title, 'CRM');
assert.equal(listCalls, 1, 'route render helper must build from props allPages without another DB list');
assert.throws(() => publicPages.routeToStaticParam('/'));

await assert.rejects(() => providerModule.createPublicContentProvider({ sourceEnv: { SITE_CONTENT_SOURCE: 'db' }, dbReaderFactory: async () => { throw new Error('import boom'); } }).listPublishedPublicPages(), /import boom/);
await assert.rejects(() => providerModule.createPublicContentProvider({ sourceEnv: { SITE_CONTENT_SOURCE: 'db' }, dbReaderFactory: async () => ({ listPublishedPublicPages: async () => { throw new Error('query boom'); }, getPageByRoute: async () => null, listNavigation: async () => [] }) }).listPublishedPublicPages(), /query boom/);
await assert.rejects(() => providerModule.createPublicContentProvider({ sourceEnv: { SITE_CONTENT_SOURCE: 'db' }, dbReaderFactory: async () => ({ getPageByRoute: async () => null, listNavigation: async () => [] }) }).listPublishedPublicPages(), /listPublishedPublicPages contract/);
await assert.rejects(() => providerModule.createPublicContentProvider({ sourceEnv: { SITE_CONTENT_SOURCE: 'db' }, dbReaderFactory: async () => ({ listPublishedPublicPages: async () => [], getPageByRouteAny: async () => { throw new Error('page query boom'); }, getPageByRoute: async () => null, listNavigation: async () => [] }) }).getPublicPageState('/'), /page query boom/);
await assert.rejects(() => providerModule.createPublicContentProvider({ sourceEnv: { SITE_CONTENT_SOURCE: 'db' }, dbReaderFactory: async () => ({ listPublishedPublicPages: async () => [], getPageByRoute: async () => null, listNavigation: async () => { throw new Error('nav boom'); } }) }).listNavigation(), /nav boom/);
assert.deepEqual(await providerModule.createPublicContentProvider({ sourceEnv: { SITE_CONTENT_SOURCE: 'db' }, dbReaderFactory: async () => ({ listPublishedPublicPages: async () => [], getPageByRoute: async () => null, listNavigation: async () => [] }) }).listNavigation(), []);
assert.deepEqual(await providerModule.createPublicContentProvider({ sourceEnv: { SITE_CONTENT_SOURCE: 'auto', DB_HOST: 'db', DB_NAME: 'site', DB_USER: 'site' }, dbReaderFactory: async () => ({ listPublishedPublicPages: async () => [], getPageByRoute: async () => null, listNavigation: async () => [] }) }).listNavigation(), []);
assert.deepEqual((await providerModule.createPublicContentProvider({ sourceEnv: { SITE_CONTENT_SOURCE: 'static' } }).listNavigation()).map((item) => item.href), ['/static/']);
assert.deepEqual((await providerModule.createPublicContentProvider({ sourceEnv: { SITE_CONTENT_SOURCE: 'auto' } }).listNavigation()).map((item) => item.href), ['/static/']);
assert.deepEqual((await providerModule.createPublicContentProvider({ sourceEnv: { SITE_CONTENT_SOURCE: 'db' }, dbReaderFactory: async () => ({ listPublishedPublicPages: async () => [], getPageByRoute: async () => null, listNavigation: async () => [] }) }).listPublishedPublicPages()).pages, []);
assert.equal((await providerModule.createPublicContentProvider({ sourceEnv: { SITE_CONTENT_SOURCE: 'db' }, dbReaderFactory: async () => ({ listPublishedPublicPages: async () => [], getPageByRoute: async () => null, listNavigation: async () => [] }) }).getPublicPageState('/')).page, undefined);
assert.equal((await providerModule.createPublicContentProvider({ sourceEnv: { SITE_CONTENT_SOURCE: 'db' }, dbReaderFactory: async () => ({ listPublishedPublicPages: async () => dbPages, getPageByRouteAny: async (route) => dbPages.find((page) => page.route === route) ?? null, getPageByRoute: async (route) => dbPages.find((page) => page.route === route && page.status === 'published') ?? null, listNavigation: async () => [] }) }).getPublicPageState('/')).page.type, 'home');
assert.equal((await providerModule.createPublicContentProvider({ sourceEnv: { SITE_CONTENT_SOURCE: 'db' }, dbReaderFactory: async () => ({ listPublishedPublicPages: async () => [{ route: '/', slug: 'home', type: 'home', title: 'Home', status: 'draft', sortOrder: 0, blocks: [] }], getPageByRouteAny: async () => ({ route: '/', slug: 'home', type: 'home', title: 'Home', status: 'draft', sortOrder: 0, blocks: [] }), getPageByRoute: async () => null, listNavigation: async () => [] }) }).getPublicPageState('/')).hiddenByDb, true);
assert.deepEqual((await providerModule.createPublicContentProvider({ sourceEnv: { SITE_CONTENT_SOURCE: 'static' } }).getPublicPageState('/')).mode, 'static');
assert.deepEqual((await providerModule.createPublicContentProvider({ sourceEnv: { SITE_CONTENT_SOURCE: 'auto' } }).getPublicPageState('/')).mode, 'static');
assert.equal(await providerModule.createPublicContentProvider({ sourceEnv: { SITE_CONTENT_SOURCE: 'db' }, dbReaderFactory: async () => ({ listPublishedPublicPages: async () => [], getPageByRoute: async () => null, listNavigation: async () => [] }) }).getPageByRoute('/static/'), undefined);

assert.throws(() => publicPages.buildPublicRouteIndex([{ id: 1, route: '/dupe/', slug: 'one', type: 'content_page', title: 'First', status: 'published', sortOrder: 1, blocks: [] }, { id: 2, route: '/dupe', slug: 'two', type: 'content_page', title: 'Second', status: 'published', sortOrder: 2, blocks: [] }]), /Duplikált public route index kulcs.*First.*Second/);
assert.throws(() => publicPages.buildPublicRouteIndex([{ id: 1, route: '/a/', slug: 'crm', type: 'solution_detail', title: 'First CRM', status: 'published', sortOrder: 1, blocks: [] }, { id: 2, route: '/b/', slug: 'crm', type: 'solution_detail', title: 'Second CRM', status: 'published', sortOrder: 2, blocks: [] }]), /Duplikált public type\+slug index kulcs.*solution_detail.*crm.*First CRM.*Second CRM/);
assert.doesNotThrow(() => publicPages.buildPublicRouteIndex([{ route: '/a/', slug: 'same', type: 'solution_detail', title: 'Solution', status: 'published', sortOrder: 1, blocks: [] }, { route: '/b/', slug: 'same', type: 'audience_detail', title: 'Audience', status: 'published', sortOrder: 2, blocks: [] }]));
const cardIndex = publicPages.buildPublicRouteIndex([
  { route: '/new/crm/', slug: 'crm', type: 'solution_detail', title: 'CRM', status: 'published', sortOrder: 1, blocks: [] },
  { route: '/aud/crm/', slug: 'crm', type: 'audience_detail', title: 'Audience CRM', status: 'published', sortOrder: 2, blocks: [] },
]);
const sourcePage = { route: '/index/', slug: 'index', type: 'solutions_index', title: 'Index', status: 'published', sortOrder: 0, blocks: [] };
assert.equal(publicPages.resolveListingCards({ items: [{ title: 'CRM', url: '/new/crm/' }], detailType: 'solution_detail', index: cardIndex, sourcePage, blockLabel: 'db', mode: 'db-authoritative', source: 'db-block' })[0].href, '/new/crm/');
assert.throws(() => publicPages.resolveListingCards({ items: [{ title: 'CRM', url: '/old/crm/' }], detailType: 'solution_detail', index: cardIndex, sourcePage, blockLabel: 'db', mode: 'db-authoritative', source: 'db-block' }), /explicit URL/);
assert.throws(() => publicPages.resolveListingCards({ items: [{ title: 'CRM', url: '/wrong/crm/' }], detailType: 'solution_detail', index: cardIndex, sourcePage, blockLabel: 'db', mode: 'db-authoritative', source: 'db-block' }), /explicit URL/);
assert.equal(publicPages.resolveListingCards({ items: [{ title: 'CRM', slug: 'crm' }], detailType: 'solution_detail', index: cardIndex, sourcePage, blockLabel: 'db', mode: 'db-authoritative', source: 'db-block' })[0].href, '/new/crm/');
assert.equal(publicPages.resolveListingCards({ items: [{ title: 'CRM', url: '/megoldasaink/crm/' }], detailType: 'solution_detail', index: cardIndex, sourcePage, blockLabel: 'golden', mode: 'db-authoritative', source: 'golden' })[0].href, '/new/crm/');
assert.throws(() => publicPages.resolveListingCards({ items: [{ title: 'Wrong', url: '/aud/crm/' }], detailType: 'solution_detail', index: cardIndex, sourcePage, blockLabel: 'db', mode: 'db-authoritative', source: 'db-block' }), /explicit URL/);

const catchAll = await readFile('src/pages/[...slug].astro', 'utf8');
assert.match(catchAll, /props: \{ page, allPages: pages, mode \}/);
assert.match(catchAll, /normalizePublicRoute\(`\/\$\{Astro\.params\.slug \?\? ''\}\/`\)/);
const home = await readFile('src/pages/index.astro', 'utf8');
assert.match(home, /Hiányzó published home oldal DB authoritative módban/);
assert.match(catchAll, /buildPublicRouteIndex\(allPages\)/);
assert.doesNotMatch(catchAll, /getPublicRouteIndex/);
const registry = await readFile('src/components/page-renderers/registry.ts', 'utf8');
for (const type of ['solutions_index','solution_detail','audiences_index','audience_detail','integrations','pricing','contact','content_page']) assert.match(registry, new RegExp(`${type}:|${type}'`));
assert.doesNotMatch(registry, /home:/);
assert.match(registry, /throw new Error\(`Unsupported published public page.type/);

const release = await mkdtemp(join(tmpdir(), 'easylink-dynamic-release-'));
async function addRoute(route) { const clean = route.replace(/^\/+|\/+$/g, ''); const dir = clean ? join(release, clean) : release; await mkdir(dir, { recursive: true }); await writeFile(join(dir, 'index.html'), `<!doctype html><title>${route}</title>`); }
for (const route of ['/', '/megoldasainkok/', '/dijak/', '/elerhetoseg/', '/uzleti-megoldasok/crm-rendszer/', '/sixth-route/']) await addRoute(route);
const content = { pages: [
  { id: 1, route: '/', type: 'home', title: 'Home', status: 'published' },
  { id: 2, route: '/megoldasainkok/', type: 'solutions_index', title: 'Megoldásaink', status: 'published' },
  { id: 3, route: '/dijak/', type: 'pricing', title: 'Díjak', status: 'published' },
  { id: 4, route: '/elerhetoseg/', type: 'contact', title: 'Elérhetőség', status: 'published' },
  { id: 5, route: '/uzleti-megoldasok/crm-rendszer/', type: 'solution_detail', title: 'CRM', status: 'published' },
  { id: 6, route: '/draft-only/', type: 'content_page', title: 'Draft', status: 'draft' },
  { id: 7, route: '/sixth-route/', type: 'content_page', title: 'Sixth', status: 'published' },
] };
assert.deepEqual(await validateRelease(release, content), { ok: true });
assert.equal(existsSync(join(release, 'megoldasaink', 'index.html')), false);
assert.equal(existsSync(join(release, 'arak', 'index.html')), false);
assert.equal(existsSync(join(release, 'kapcsolat', 'index.html')), false);
const missingSixth = await mkdtemp(join(tmpdir(), 'easylink-dynamic-release-missing-'));
for (const route of ['/', '/megoldasainkok/', '/dijak/', '/elerhetoseg/', '/uzleti-megoldasok/crm-rendszer/']) { const clean = route.replace(/^\/+|\/+$/g, ''); const dir = clean ? join(missingSixth, clean) : missingSixth; await mkdir(dir, { recursive: true }); await writeFile(join(dir, 'index.html'), '<!doctype html>'); }
const missingResult = await validateRelease(missingSixth, content);
assert.equal(missingResult.ok, false);
assert.match(missingResult.error, /Sixth .*sixth-route/);
const duplicateResult = await validateRelease(release, { pages: [...content.pages, { id: 8, route: '/dijak', type: 'content_page', title: 'Dupe', status: 'published' }] });
assert.equal(duplicateResult.ok, false);
assert.match(duplicateResult.error, /Duplikált published route/);
const wrongRootRelease = await validateRelease(release, { pages: [{ id: 9, route: '/', type: 'content_page', title: 'Wrong Root', status: 'published' }] });
assert.equal(wrongRootRelease.ok, false);
assert.match(wrongRootRelease.error, /id=9.*Wrong Root.*content_page.*route=\//);
const missingRootRelease = await validateRelease(release, { pages: [{ id: 10, route: '/masik/', type: 'content_page', title: 'Other', status: 'published' }] });
assert.equal(missingRootRelease.ok, false);
assert.match(missingRootRelease.error, /Hiányzó \/ route rekord/);
const misplacedHomeRelease = await validateRelease(release, { pages: [{ id: 11, route: '/', type: 'home', title: 'Home', status: 'published' }, { id: 12, route: '/masik/', type: 'home', title: 'Misplaced Home', status: 'published' }] });
assert.equal(misplacedHomeRelease.ok, false);
assert.match(misplacedHomeRelease.error, /Home típus csak route=\//);
const duplicateRootRelease = await validateRelease(release, { pages: [{ id: 13, route: '/', type: 'home', title: 'Root A', status: 'published' }, { id: 14, route: '//', type: 'home', title: 'Root B', status: 'draft' }] });
assert.equal(duplicateRootRelease.ok, false);
assert.match(duplicateRootRelease.error, /Több normalizált \/ route rekord.*Root A.*Root B/);
const draftHomeRelease = await validateRelease(release, { pages: [{ id: 15, route: '/', type: 'home', title: 'Draft Home', status: 'draft' }] });
assert.deepEqual(draftHomeRelease, { ok: true });
const unknownResult = await validateRelease(release, { pages: [{ route: '/', type: 'home', title: 'Home', status: 'published' }, { route: '/weird/', type: 'weird', title: 'Weird', status: 'published' }] });
assert.equal(unknownResult.ok, false);
assert.match(unknownResult.error, /Unsupported published page.type/);

console.log('Dynamic public routing smoke passed: strict DB source mode, immutable path props, route helpers, card resolution and release validation.');
