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
for (const token of ['heroAsset', 'heroHeight', 'heroImageFit', 'heroImagePositionX', 'heroImagePositionY', 'heroImagePositionMobileX', 'heroImagePositionMobileY', 'heroOverlayStrength', 'heroImageScale']) {
  assert.match(home, new RegExp(token));
  assert.match(hero, new RegExp(token));
}
assert.match(hero, /style=\{styleVars\}/);
assert.match(hero, /--home-hero-bg-size/);
assert.match(hero, /if \(fit === 'stretch'\) return '100% 100%'/);


const pageHero = await readFile('src/components/PageHero.astro', 'utf8');
assert.match(pageHero, /asset = '\/assets\/nati\/hero-bg-flow-02\.webp'/);
assert.match(pageHero, /style=\{styleVars\}/);
const publicHeroAsset = '/assets/site-media/2026/07/test.webp';
const renderPageHeroStyle = (asset = '/assets/nati/hero-bg-flow-02.webp', x = 66, y = 50, scale = 100) => `--page-hero-asset: url('${asset}'); --page-hero-bg-position: ${x}% ${y}%; --page-hero-image-scale: ${scale}`;
assert.match(pageHero, /--page-hero-bg-size/);
assert.match(pageHero, /--page-hero-bg-position/);
assert.match(pageHero, /--page-hero-bg-position-mobile/);
assert.match(pageHero, /imageScale = 100/);
assert.match(pageHero, /clampScale = \(value\) => Number\.isInteger\(Number\(value\)\) \? Math\.min\(200, Math\.max\(50, Number\(value\)\)\) : 100/);
assert.match(pageHero, /if \(fit === 'stretch'\) return '100% 100%'/);
assert.match(pageHero, /if \(scale === 100\) return bgSize\[fit\]/);
assert.match(pageHero, /`\$\{scale\}% auto`/);
assert.match(pageHero, /--page-hero-overlay-left/);
assert.match(pageHero, /cover: 'cover'/);
assert.match(pageHero, /contain: 'contain'/);
assert.match(pageHero, /stretch: '100% 100%'/);
assert.doesNotMatch(pageHero, /imageScale[^;]*style/i);
assert.match(pageHero, /background-size: cover, var\(--page-hero-bg-size\)/);
assert.match(pageHero, /background-position: center, var\(--page-hero-bg-position\)/);
assert.match(pageHero, /background-repeat: no-repeat, no-repeat;/);
assert.match(pageHero, /@media[\s\S]*background-position: center, var\(--page-hero-bg-position-mobile\)/);
assert.doesNotMatch(pageHero, /background-size: var\(--page-hero-bg-size\)/);
assert.doesNotMatch(pageHero, /@media[\s\S]*background-repeat:\s*repeat/);
assert.match(pageHero, /weak:/);
assert.match(pageHero, /strong:/);

const extractPxMapping = (name, key) => {
  const match = pageHero.match(new RegExp(String.raw`const ${name} = \{[^}]*${key}: '(\d+)px'`));
  assert.ok(match, `${name}.${key} px mapping missing`);
  return Number(match[1]);
};
const listingMin = ['compact', 'normal', 'tall', 'xlarge'].map((key) => extractPxMapping('listingHeightMin', key));
const listingMinMobile = ['compact', 'normal', 'tall', 'xlarge'].map((key) => extractPxMapping('listingHeightMinMobile', key));
const detailMin = ['compact', 'normal', 'tall', 'xlarge'].map((key) => extractPxMapping('detailHeightMin', key));
const detailMinMobile = ['compact', 'normal', 'tall', 'xlarge'].map((key) => extractPxMapping('detailHeightMinMobile', key));
for (const values of [listingMin, listingMinMobile, detailMin, detailMinMobile]) {
  assert.ok(values[0] < values[1] && values[1] < values[2] && values[2] < values[3], `min-height mapping must increase: ${values.join(',')}`);
}
assert.notEqual(extractPxMapping('listingHeightMin', 'normal'), extractPxMapping('detailHeightMin', 'normal'));
assert.ok(extractPxMapping('detailHeightMin', 'normal') < extractPxMapping('listingHeightMin', 'normal'));
assert.match(pageHero, /heightMin = variant === 'detail' \? detailHeightMin : listingHeightMin/);
assert.match(pageHero, /heightMinMobile = variant === 'detail' \? detailHeightMinMobile : listingHeightMinMobile/);

const extractClampStart = (name, key) => {
  const match = pageHero.match(new RegExp(String.raw`${name} = \{[^}]*${key}: 'clamp\((\d+)px,`));
  assert.ok(match, `${name}.${key} clamp mapping missing`);
  return Number(match[1]);
};
const compactPadding = extractClampStart('heightPadding', 'compact');
const tallPadding = extractClampStart('heightPadding', 'tall');
const xlargePadding = extractClampStart('heightPadding', 'xlarge');
assert.match(pageHero, /normalPadding = variant === 'detail' \? 'clamp\(28px, 3\.6vw, 46px\)' : 'clamp\(36px, 4\.4vw, 58px\)'/);
assert.ok(compactPadding < 36, 'compact hero padding must be lower than normal default');
assert.ok(tallPadding > 36, 'tall hero padding must be higher than normal default');
assert.ok(xlargePadding > tallPadding, 'xlarge hero padding must be higher than tall');
assert.match(pageHero, /--page-hero-padding-mobile/);
assert.match(pageHero, /--page-hero-min-height/);
assert.match(pageHero, /--page-hero-min-height-mobile/);
assert.match(pageHero, /\.page-hero \{[^}]*min-height: var\(--page-hero-min-height\)/);
assert.match(pageHero, /@media[\s\S]*\.page-hero \{[^}]*min-height: var\(--page-hero-min-height-mobile\)[^}]*padding: var\(--page-hero-padding-mobile\) 0;/);
assert.match(pageHero, /<div class=\"container page-hero-grid\">/);
assert.doesNotMatch(pageHero, /\.page-hero-grid \{[^}]*width: 100%/);
assert.match(pageHero, /\.page-hero-grid \{[^}]*display: grid/);
assert.doesNotMatch(pageHero, /@media[\s\S]*\.page-hero \{ padding: 36px 0 40px; \}/);
assert.match(pageHero, /--page-hero-detail-overlay-opacity/);
assert.match(pageHero, /detailOverlayOpacity = String\(Math\.round\(Number\(overlayOpacity\) \* 0\.8/);
assert.doesNotMatch(pageHero, /calc\(var\(--page-hero-overlay-opacity\) \* 0\.8\)/);
assert.match(renderPageHeroStyle(publicHeroAsset), /\/assets\/site-media\/2026\/07\/test\.webp/);
assert.match(renderPageHeroStyle(publicHeroAsset, 25, 75), /25% 75%/);
assert.match(renderPageHeroStyle(), /\/assets\/nati\/hero-bg-flow-02\.webp/);

for (const file of ['src/pages/index.astro','src/pages/arak/index.astro','src/pages/kapcsolat/index.astro','src/pages/integraciok/index.astro','src/pages/megoldasaink/index.astro','src/pages/kinek-szol/index.astro']) {
  const source = await readFile(file, 'utf8');
  assert.match(source, /getPublicPageState/);
  assert.match(source, /hiddenByDb/);
  assert.match(source, /Astro\.response\.status = 404/);
}

for (const file of ['src/pages/arak/index.astro','src/pages/kapcsolat/index.astro','src/pages/integraciok/index.astro','src/pages/megoldasaink/index.astro','src/pages/kinek-szol/index.astro']) {
  const source = await readFile(file, 'utf8');
  assert.match(source, /<PageHero\b/);
  assert.doesNotMatch(source, /variant="detail"/);
}
for (const file of ['src/pages/megoldasaink/[slug].astro','src/pages/kinek-szol/[slug].astro']) {
  const source = await readFile(file, 'utf8');
  assert.match(source, /<PageHero\b[\s\S]*variant="detail"/);
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
assert.doesNotMatch(solutionsIndex, /<ListingCards items=\{publishedSolutions\}/);
const audiencesIndex = await readFile('src/pages/kinek-szol/index.astro', 'utf8');
assert.match(audiencesIndex, /const cardsBlock = page\?\.blocks\?\.find/);
assert.match(audiencesIndex, /const audienceCards = cardsBlock\?\.items\?\.length \? cardsBlock.items : publishedAudiences/);
assert.match(audiencesIndex, /<ListingCards items=\{audienceCards\} basePath="\/kinek-szol\/"/);
const pricingIndex = await readFile('src/pages/arak/index.astro', 'utf8');
assert.match(pricingIndex, /const featureBlock = page\?\.blocks\?\.find/);
assert.match(pricingIndex, /const textBlock = page\?\.blocks\?\.find/);
assert.match(pricingIndex, /const ctaBlock = page\?\.blocks\?\.find/);
assert.match(pricingIndex, /priceFeatures = featureBlock\?\.items\?\.length \? featureBlock.items :/);
const contactIndex = await readFile('src/pages/kapcsolat/index.astro', 'utf8');
assert.match(contactIndex, /const ctaBlock = page\?\.blocks\?\.find/);
assert.match(contactIndex, /const featureBlock = page\?\.blocks\?\.find/);
assert.match(contactIndex, /helpItems = featureBlock\?\.items\?\.length \? featureBlock.items :/);
assert.match(solutionsIndex, /asset=\{page\?\.heroAsset \|\| undefined\}/);
assert.match(solutionsIndex, /height=\{page\?\.heroHeight\}/);
assert.match(solutionsIndex, /imageFit=\{page\?\.heroImageFit\}/);
assert.match(solutionsIndex, /overlayStrength=\{page\?\.heroOverlayStrength\}/);
assert.match(solutionsIndex, /imageScale=\{page\?\.heroImageScale\}/);
const integrationsIndex = await readFile('src/pages/integraciok/index.astro', 'utf8');
assert.match(integrationsIndex, /import ListingCards from/);
assert.match(integrationsIndex, /integrationCards/);
assert.match(integrationsIndex, /<ListingCards items=\{integrationCards\}/);
assert.match(integrationsIndex, /const introBlock = textBlocks\.find/);
assert.match(integrationsIndex, /const importantBlock = textBlocks\.find/);
assert.match(integrationsIndex, /importantBlock\?\.title \?\? 'Fontos keret'/);
assert.match(integrationsIndex, /publishedIntegrations.map\(\(item\) => \(\{ title: item.title, text: item.shortDescription, order: item.order, status: item.status \}\)\)/);
assert.doesNotMatch(integrationsIndex, /linkLabel: 'Részletek/);
assert.doesNotMatch(integrationsIndex, /\.\.\.item/);
assert.doesNotMatch(integrationsIndex, /integration-card/);
assert.match(integrationsIndex, /asset=\{page\?\.heroAsset \|\| "\/assets\/nati\/hero-bg-flow-02\.webp"\}/);
assert.match(integrationsIndex, /height=\{page\?\.heroHeight\}/);
assert.match(integrationsIndex, /imageFit=\{page\?\.heroImageFit\}/);
assert.match(integrationsIndex, /overlayStrength=\{page\?\.heroOverlayStrength\}/);
assert.match(integrationsIndex, /imageScale=\{page\?\.heroImageScale\}/);
assert.match(renderPageHeroStyle(publicHeroAsset), /\/assets\/site-media\/2026\/07\/test\.webp/);
assert.match(renderPageHeroStyle('' || '/assets/nati/hero-bg-flow-02.webp'), /\/assets\/nati\/hero-bg-flow-02\.webp/);
