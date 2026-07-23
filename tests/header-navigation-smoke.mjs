import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildPublicNavigationTree } from '../src/lib/content/navigation-hierarchy.mjs';

const headerSource = await readFile('src/components/Header.astro', 'utf8');
assert.match(headerSource, /import \{ listNavigation \} from '@\/lib\/content\/provider';/);
assert.match(headerSource, /const siteNavigation = await listNavigation\(\);/);
assert.doesNotMatch(headerSource, /legacy smoke/);
assert.doesNotMatch(headerSource, /href="#"/);
assert.match(headerSource, /<details class="nav-group">/);
assert.match(headerSource, /<summary>\{item\.title\}<\/summary>/);
assert.match(headerSource, /nav-group nav-group--nested/);
assert.match(headerSource, /<a href=\{leaf\.href\}>\{leaf\.title\}<\/a>/);
assert.match(headerSource, /Escape/);
assert.match(headerSource, /flex-direction: column/);
assert.match(headerSource, /outline: 3px solid/);
assert.match(headerSource, /width: min\(calc\(100% - 32px\), 1480px\)/);
assert.match(headerSource, /\.nav-ctas \{[\s\S]*flex-wrap: nowrap/);
assert.match(headerSource, /\.nav-cta\.button-secondary \{[\s\S]*color: var\(--color-navy\)/);
assert.match(headerSource, /@media \(max-width: 1380px\)/);

const tree = buildPublicNavigationTree([
  { id: 1, title: 'Group', target_type: 'group', status: 'published', sort_order: 1 },
  { id: 2, parent_id: 1, title: 'Nested', target_type: 'group', status: 'published', sort_order: 1 },
  { id: 3, parent_id: 2, title: 'Leaf', href: '/leaf/', target_type: 'legacy', status: 'published', sort_order: 1 },
]);
assert.equal(tree[0].href, undefined, 'group is not an anchor/link');
assert.equal(tree[0].children[0].href, undefined, 'second-level group is not an anchor/link');
assert.equal(tree[0].children[0].children[0].href, '/leaf/', 'leaf remains a real link');

console.log('Header navigation smoke passed: hierarchy disclosure, mobile accordion and multi-CTA contracts are present.');
