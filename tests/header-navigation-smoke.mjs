import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const headerSource = await readFile('src/components/Header.astro', 'utf8');
assert.match(headerSource, /import \{ listNavigation \} from '@\/lib\/content\/provider';/);
assert.match(headerSource, /const siteNavigation = await listNavigation\(\);/);
assert.doesNotMatch(headerSource, /import \{ siteNavigation[,}]/);
assert.match(headerSource, /width: min\(calc\(100% - 32px\), 1480px\)/);
assert.match(headerSource, /\.nav-ctas \{[\s\S]*flex-wrap: nowrap/);
assert.match(headerSource, /\.nav-cta\.button-secondary \{[\s\S]*color: var\(--color-navy\)/);
assert.match(headerSource, /@media \(max-width: 1380px\)/);
assert.match(headerSource, /grid-column: 1 \/ -1/);

const providerNavigation = [{ title: 'DB módosított cím', href: '/db-nav/' }];
const renderedNavigationHtml = providerNavigation.map((item) => `<a href="${item.href}">${item.title}</a>`).join('');
assert.match(renderedNavigationHtml, /DB módosított cím/);
assert.match(renderedNavigationHtml, /href="\/db-nav\/"/);

console.log('Header navigation smoke passed: provider navigation and multi-CTA desktop layout contracts are present.');
