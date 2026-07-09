import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const home = await readFile('src/pages/index.astro', 'utf8');
for (const token of ['Hero', 'ListingCards', 'AiAssistantPreview', 'IntegrationsStrip', 'CTASection']) {
  assert.match(home, new RegExp(`import ${token} from`));
  assert.match(home, new RegExp(`<${token}\\b`));
}
assert.doesNotMatch(home, /import PageHero from/);
assert.doesNotMatch(home, /import ContentBlocks from/);
assert.doesNotMatch(home, /<PageHero\b[\s\S]*<ContentBlocks\b/);

const order = ['<Header', '<Hero', 'intro-section', '<ListingCards', '<AiAssistantPreview', '<IntegrationsStrip', '<ListingCards', '<CTASection', '<Footer'];
let cursor = -1;
for (const marker of order) {
  const next = home.indexOf(marker, cursor + 1);
  assert.ok(next > cursor, `missing or out of order home marker: ${marker}`);
  cursor = next;
}

const hero = await readFile('src/components/Hero.astro', 'utf8');
for (const phrase of ['easyLink ERP', 'Cégvezetés, könnyedén.', 'Próbáld ki ingyen', 'Átlátható működés', 'hero-bg-flow-03.webp']) {
  assert.match(hero, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
assert.doesNotMatch(hero, /PageHero/);

for (const file of ['src/pages/index.astro','src/pages/arak/index.astro','src/pages/kapcsolat/index.astro','src/pages/integraciok/index.astro','src/pages/megoldasaink/index.astro','src/pages/kinek-szol/index.astro']) {
  const source = await readFile(file, 'utf8');
  assert.match(source, /getPublicPageState/);
  assert.match(source, /hiddenByDb/);
  assert.match(source, /Astro\.response\.status = 404/);
}
console.log('Public composition smoke passed: golden home composition, hero regression, explicit hidden guards.');
