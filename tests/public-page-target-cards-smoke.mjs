import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function loadPublicPagesModule() {
  let source = readFileSync('src/lib/content/public-pages.ts', 'utf8');
  source = source.replace(/import[^\n]+from '@\/content\/audiences';\n/, 'const publishedAudiences = [];\n');
  source = source.replace(/import[^\n]+from '@\/content\/solutions';\n/, 'const publishedSolutions = [];\n');
  source = source.replace(/import \{ staticPages, type SitePage \} from '\.\/static';\n/, 'const staticPages = [];\n');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  const module = { exports };
  const require = (name) => { throw new Error(`Unexpected require: ${name}`); };
  Function('exports', 'module', 'require', js)(exports, module, require);
  return module.exports;
}

const publicPages = loadPublicPagesModule();
const pages = [
  { id: 10, route: '/megoldasaink/crm/', slug: 'crm', type: 'solution_detail', title: 'CRM', status: 'published', sortOrder: 1, blocks: [] },
  { id: 11, route: '/kinek-szol/hotelek/', slug: 'hotelek', type: 'audience_detail', title: 'Hotelek', status: 'published', sortOrder: 2, blocks: [] },
  { id: 12, route: '/megoldasaink/draft/', slug: 'draft', type: 'solution_detail', title: 'Draft', status: 'draft', sortOrder: 3, blocks: [] },
];
const index = publicPages.buildPublicRouteIndex(pages);
const sourcePage = { id: 2, route: '/megoldasaink/', slug: 'megoldasaink', type: 'solutions_index', title: 'Megoldásaink', status: 'published', sortOrder: 0, blocks: [] };
const resolve = (items, detailType = 'solution_detail') => publicPages.resolveListingCards({ items, detailType, index, sourcePage, blockLabel: 'cards', mode: 'db-authoritative', source: 'db-block' });

assert.equal(index.byId.get('10')?.route, '/megoldasaink/crm/');
const pageTarget = resolve([{ title: 'CRM', target_type: 'page', target_page_id: '10' }])[0];
assert.equal(pageTarget.href, '/megoldasaink/crm/');
assert.equal(pageTarget.url, '/megoldasaink/crm/');
assert.equal(pageTarget.slug, 'crm');
assert.throws(() => resolve([{ title: 'Hiányzó', target_type: 'page', target_page_id: 999 }]), /page target nem published oldal.*999/);
assert.throws(() => resolve([{ title: 'Draft', target_type: 'page', target_page_id: 12 }]), /page target nem published oldal.*12/);
assert.throws(() => resolve([{ title: 'Rossz típus', target_type: 'page', target_page_id: 11 }]), /page target típusa audience_detail, elvárt: solution_detail/);
assert.equal(resolve([{ title: 'CRM', url: '/megoldasaink/crm/' }])[0].href, '/megoldasaink/crm/');
assert.equal(resolve([{ title: 'CRM', slug: 'crm' }])[0].href, '/megoldasaink/crm/');

console.log('Public page-target card resolution smoke ok');
