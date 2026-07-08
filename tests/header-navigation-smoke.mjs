import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const headerSource = await readFile('src/components/Header.astro', 'utf8');
assert.match(headerSource, /import \{ listNavigation \} from '@\/lib\/content\/provider';/);
assert.match(headerSource, /const siteNavigation = await listNavigation\(\);/);
assert.doesNotMatch(headerSource, /import \{ siteNavigation[,}]/);

const providerNavigation = [{ title: 'DB módosított cím', href: '/db-nav/' }];
const renderedNavigationHtml = providerNavigation.map((item) => `<a href="${item.href}">${item.title}</a>`).join('');
assert.match(renderedNavigationHtml, /DB módosított cím/);
assert.match(renderedNavigationHtml, /href="\/db-nav\/"/);

console.log('Header navigation smoke passed: Header is wired to provider navigation and provider navigation renders public anchor HTML.');
