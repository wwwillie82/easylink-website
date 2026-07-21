import assert from 'node:assert/strict';
import { pageForm } from '../src/lib/admin/render/pages.mjs';
import { homeCanonicalEditor } from '../src/lib/admin/render/home.mjs';
import { canonicalHomeBlockFixture } from '../src/lib/content/home-blocks.mjs';

const generic = canonicalHomeBlockFixture().map((b) => b.block_key === 'home:hero-meta' ? b : ({ ...b, ...({
  'home:intro': { type: 'split-text', items: [{ version: 1, heading: 'H' }] },
  'home:solutions': { type: 'cards', items: [{ version: 2, cards: [], action: null }] },
  'home:ai-assistant': { type: 'ai-assistant-preview' },
  'home:integrations': { type: 'integrations-strip' },
  'home:audiences': { type: 'cards', items: [{ version: 2, cards: [], action: null }] },
}[b.block_key] || {}) }));
const blocks = [...generic.map((b, i) => ({ ...b, id: i + 10, page_id: 1 })), { id: 90, page_id: 1, block_key: 'manual:text', type: 'text', title: 'Manual', body: 'Body', items: [], sort_order: 1, status: 'published' }];
const html = pageForm({ page: { id: 1, type: 'home', route: '/', title: 'Home', status: 'published', sort_order: 0 }, blocks, defaultCta: {}, homeEditor: { pages: [], editor_revision: 'r' }, pageTargetPages: [] });
assert(html.includes('data-admin-home-tech-meta'));
assert(html.includes('<dt>ID</dt>'));
assert(html.includes('block_key'));
assert(html.includes('szerep'));
assert(html.includes('canonical generic middle'));
assert(html.includes('valid manual generic middle'));
assert(html.includes('A főoldal további egyedi tartalmi blokkokat tartalmaz.'));
assert(!html.includes('duplikált tartalom'));
assert(!html.includes('data-home-extra-warning'));
assert(html.includes('Kis címke / eyebrow'));
assert(html.includes('Főcím / heading'));
assert(html.includes('Leírás / body'));
assert(!html.includes('data-content-blocks-layout'));
const canonicalHtml = homeCanonicalEditor({ page: { id: 1 }, blocks, homeEditor: { pages: [], editor_revision: 'r' } });
assert(canonicalHtml.includes('A főoldal további egyedi tartalmi blokkokat tartalmaz.'));
assert(!canonicalHtml.includes('duplikált tartalom'));
const partialHtml = pageForm({ page: { id: 1, type: 'home', route: '/', title: 'Home', status: 'published', sort_order: 0 }, blocks: blocks.filter((b) => b.block_key !== 'home:audiences'), defaultCta: {}, homeEditor: { pages: [], editor_revision: 'r' }, pageTargetPages: [] });
assert(partialHtml.includes('msg err'));
assert(partialHtml.includes('canonical blokkállapot javítandó'));
const nonHome = pageForm({ page: { id: 2, type: 'content_page', route: '/x', title: 'X', status: 'draft', sort_order: 1 }, blocks: [{ id: 80, page_id: 2, block_key: 'x:text', type: 'text', title: 'T', body: 'B', items: '[]', sort_order: 1, status: 'published' }], defaultCta: {}, pageTargetPages: [] });
assert(nonHome.includes('Címsor'));
assert(nonHome.includes('Törzsszöveg / bevezető'));
assert(!nonHome.includes('data-admin-home-tech-meta'));
console.log('admin home technical metadata smoke ok');
