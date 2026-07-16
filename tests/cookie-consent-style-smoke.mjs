import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const consent = await readFile('src/components/CookieConsent.astro', 'utf8');
const styleBlock = consent.match(/<style is:global>([\s\S]*?)<\/style>/)?.[1] ?? '';

assert.ok(styleBlock, 'cookie consent must use global CSS because its interactive markup is created with innerHTML');
assert.doesNotMatch(consent, /<style>\s*[\s\S]*?el-consent-banner/, 'Astro-scoped CSS cannot style dynamically injected consent markup');
assert.match(styleBlock, /#easylink-cookie-consent \.el-consent-banner/);
assert.match(styleBlock, /#easylink-cookie-consent \.el-consent-dialog/);
assert.doesNotMatch(styleBlock, /(^|\n)\s*\.el-consent-(banner|dialog|actions|category|backdrop)/, 'dynamic consent selectors must stay prefixed to the consent root');
assert.match(styleBlock, /position:\s*fixed/);
assert.match(styleBlock, /z-index:\s*2147483001/);
assert.match(styleBlock, /background:\s*#a6ff00/);
assert.match(styleBlock, /@media \(max-width:\s*700px\)/);
assert.match(consent, /class="primary" data-accept>Statisztika engedélyezése/);
assert.match(consent, /class="text" data-settings>Beállítások/);
assert.match(consent, /class="primary" data-accept>Minden elfogadása/);
assert.doesNotMatch(consent, /gtag|googletagmanager|google-analytics|GTM-/i);

console.log('cookie consent style smoke ok');
