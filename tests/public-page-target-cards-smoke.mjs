import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { normalizeCardsItems } from '../src/lib/content/block-contracts.mjs';

let source = readFileSync('src/lib/content/public-pages.ts', 'utf8')
  .replace(/import[^\n]+from '@\/content\/audiences';\n/, 'const publishedAudiences = [];\n')
  .replace(/import[^\n]+from '@\/content\/solutions';\n/, 'const publishedSolutions = [];\n')
  .replace(/import \{ normalizeCardsItems \} from '\.\/block-contracts\.mjs';\n/, '')
  .replace(/import \{ staticPages, type SitePage \} from '\.\/static';\n/, 'const staticPages = [];\n');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exports = {}; const module = { exports };
Function('exports','module','require','normalizeCardsItems',js)(exports,module,()=>{ throw new Error('Unexpected require'); },normalizeCardsItems);
const publicPages = module.exports;
const pages = [
  { id: 10, route: '/megoldasaink/crm/', slug: 'crm', type: 'solution_detail', title: 'CRM', status: 'published', sortOrder: 1, blocks: [] },
  { id: 11, route: '/kinek-szol/hotelek/', slug: 'hotelek', type: 'audience_detail', title: 'Hotelek', status: 'published', sortOrder: 2, blocks: [] },
  { id: 12, route: '/megoldasaink/draft/', slug: 'draft', type: 'solution_detail', title: 'Draft', status: 'draft', sortOrder: 3, blocks: [] },
];
const index = publicPages.buildPublicRouteIndex(pages);
const sourcePage = { id: 2, route: '/kinek-szol/', slug: 'kinek-szol', type: 'audiences_index', title: 'Kinek szól?', status: 'published', sortOrder: 0, blocks: [] };
const resolve = (items, detailType = 'audience_detail') => publicPages.resolveListingCards({ items, detailType, index, sourcePage, blockLabel: 'golden:10:cards:Kinek szól?', mode: 'db-authoritative', source: 'db-block' });

const v2 = [{ version: 2, variant: 'default', cards: [{ title_override: 'Hotelek', target_type: 'page', target_page_id: 11 }], action: null }];
assert.equal(resolve(v2)[0].href, '/kinek-szol/hotelek/');
assert.equal(publicPages.resolveListingCards({ items: [{ title: 'CRM', target_type: 'page', target_page_id: 10 }], detailType: 'solution_detail', index, sourcePage, blockLabel: 'cards', mode: 'db-authoritative', source: 'db-block' })[0].href, '/megoldasaink/crm/');
assert.throws(() => resolve([{ version: 2, cards: [{ title: 'Draft', target_type: 'page', target_page_id: 12 }] }]), /page target nem published oldal.*12/);
assert.throws(() => resolve([{ version: 2, cards: [{ title: 'Rossz típus', target_type: 'page', target_page_id: 10 }] }]), /page target típusa solution_detail, elvárt: audience_detail/);
assert.equal(publicPages.resolveListingCards({ items: [{ title: 'CRM', url: '/megoldasaink/crm/' }], detailType: 'solution_detail', index, sourcePage, blockLabel: 'cards', mode: 'db-authoritative', source: 'db-block' })[0].href, '/megoldasaink/crm/');
console.log('Public cards V2 page-target resolution smoke ok');
