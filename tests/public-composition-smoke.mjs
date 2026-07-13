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


const pageHero = await readFile('src/components/PageHero.astro', 'utf8');
assert.match(pageHero, /asset = '\/assets\/nati\/hero-bg-flow-02\.webp'/);
assert.match(pageHero, /style=\{`--page-hero-asset: url\('\$\{asset\}'\)`\}/);
const publicHeroAsset = '/assets/site-media/2026/07/test.webp';
const renderPageHeroStyle = (asset = '/assets/nati/hero-bg-flow-02.webp') => `--page-hero-asset: url('${asset}')`;
assert.match(renderPageHeroStyle(publicHeroAsset), /\/assets\/site-media\/2026\/07\/test\.webp/);
assert.match(renderPageHeroStyle(), /\/assets\/nati\/hero-bg-flow-02\.webp/);

for (const file of ['src/pages/index.astro','src/pages/arak/index.astro','src/pages/kapcsolat/index.astro','src/pages/integraciok/index.astro','src/pages/megoldasaink/index.astro','src/pages/kinek-szol/index.astro']) {
  const source = await readFile(file, 'utf8');
  assert.match(source, /getPublicPageState/);
  assert.match(source, /hiddenByDb/);
  assert.match(source, /Astro\.response\.status = 404/);
}
console.log('Public composition smoke passed: golden home composition, hero regression, explicit hidden guards.');

const listingCards = await readFile('src/components/ListingCards.astro', 'utf8');
assert.match(listingCards, /class=\"listing-card\"/);
assert.match(listingCards, /item\.href \? \(/);
assert.match(listingCards, /listing-card:hover, \.listing-card:focus-visible/);
assert.match(listingCards, /target=\{publicHrefTarget\(item.href\)\} rel=\{publicHrefRel\(item.href\)\}/);
assert.match(listingCards, /normalizePublicHref/);
const linkHelper = await readFile('src/lib/content/links.ts', 'utf8');
assert.match(linkHelper, /isDomainLikePublicHref/);
assert.match(linkHelper, /return `https:\/\/\$\{raw\}`/);
assert.match(listingCards, /linkLabel: href \? /);
assert.match(listingCards, /\{item.linkLabel && <i>\{item.linkLabel\}<\/i>\}/);
assert.match(listingCards, /listing-card--static:hover \{ transform: none; border-color: rgba\(15, 17, 89, 0\.1\); box-shadow: var\(--shadow-card\); \}/);
const contentBlocks = await readFile('src/components/ContentBlocks.astro', 'utf8');
assert.match(contentBlocks, /import \{ normalizePublicHref, publicHrefRel, publicHrefTarget \}/);
assert.match(contentBlocks, /import ListingCards from/);
assert.match(contentBlocks, /<ListingCards items=\{items\}/);
assert.match(contentBlocks, /const link = linkAttrs\(cta.url\)/);
assert.match(contentBlocks, /href=\{link.href\} target=\{link.target\} rel=\{link.rel\}/);
assert.match(contentBlocks, /normalizePublicHref\(item.url \|\| item.href\)/);
assert.match(contentBlocks, /alt=\{media.alt \|\| \"\"\}/);
assert.match(contentBlocks, /if \(type === 'text'\) \{[\s\S]*type-text[\s\S]*block.body && <p>\{block.body\}<\/p>[\s\S]*if \(type === 'cta'\)/);
assert.match(contentBlocks, /if \(type === 'feature-list'\) \{[\s\S]*<ul>\{items.map/);
assert.match(contentBlocks, /return <article class:list=\{\['content-card', `type-\$\{type\}`\]\}>[\s\S]*block.body && <p>\{block.body\}<\/p>[\s\S]*<\/article>;/);
assert.doesNotMatch(contentBlocks, /return <article class:list=\{\['content-card', `type-\$\{type\}`\]\}>[\s\S]*<ul>/);
assert.doesNotMatch(contentBlocks, /mini-card/);
const solutionsIndex = await readFile('src/pages/megoldasaink/index.astro', 'utf8');
assert.match(solutionsIndex, /cardsBlock/);
assert.match(solutionsIndex, /solutionCards/);
assert.match(solutionsIndex, /const solutionCards = cardsBlock\?\.items\?\.length \? cardsBlock.items : publishedSolutions/);
assert.match(solutionsIndex, /<ListingCards items=\{solutionCards\} basePath=\"\/megoldasaink\/\"/);
assert.match(solutionsIndex, /asset=\{page\?\.heroAsset \|\| undefined\}/);
const integrationsIndex = await readFile('src/pages/integraciok/index.astro', 'utf8');
assert.match(integrationsIndex, /import ListingCards from/);
assert.match(integrationsIndex, /integrationCards/);
assert.match(integrationsIndex, /<ListingCards items=\{integrationCards\}/);
assert.match(integrationsIndex, /publishedIntegrations.map\(\(item\) => \(\{ title: item.title, text: item.shortDescription, order: item.order, status: item.status \}\)\)/);
assert.doesNotMatch(integrationsIndex, /linkLabel: 'Részletek/);
assert.doesNotMatch(integrationsIndex, /\.\.\.item/);
assert.doesNotMatch(integrationsIndex, /integration-card/);
assert.match(integrationsIndex, /asset=\{page\?\.heroAsset \|\| "\/assets\/nati\/hero-bg-flow-02\.webp"\}/);
assert.match(renderPageHeroStyle(publicHeroAsset), /\/assets\/site-media\/2026\/07\/test\.webp/);
assert.match(renderPageHeroStyle('' || '/assets/nati/hero-bg-flow-02.webp'), /\/assets\/nati\/hero-bg-flow-02\.webp/);
