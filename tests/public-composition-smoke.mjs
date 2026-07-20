import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const home = await readFile('src/pages/index.astro', 'utf8');
for (const token of ['Hero', 'ListingCards', 'AiAssistantPreview', 'IntegrationsStrip', 'CTASection']) {
  assert.match(home, new RegExp(`import ${token} from`));
  assert.match(home, new RegExp(`<${token}\\b`));
}
assert.doesNotMatch(home, /import PageHero from/);
assert.doesNotMatch(home, /import ContentBlocks from/);
assert.doesNotMatch(home, /<PageHero\b[\s\S]*<ContentBlocks\b/);
assert.doesNotMatch(home, /basePath="\/megoldasaink\/"|basePath="\/kinek-szol\/"|href="\/megoldasaink\/"/);
assert.match(home, /getPublicRouteIndex/);
assert.match(home, /resolveListingCards/);
assert.match(home, /href=\{solutionsIndexPage\.route\}/);
const order = ['<Header', '<Hero', 'intro-section', '<ListingCards', '<AiAssistantPreview', '<IntegrationsStrip', '<ListingCards', '<CTASection', '<Footer'];
let cursor = -1;
for (const marker of order) {
  const next = home.indexOf(marker, cursor + 1);
  assert.ok(next > cursor, `missing or out of order home marker: ${marker}`);
  cursor = next;
}

const hero = await readFile('src/components/Hero.astro', 'utf8');
for (const phrase of ['easyLink ERP', 'Cégvezetés, könnyedén.', 'Próbáld ki ingyen', 'Átlátható működés', 'hero-bg-flow-03.webp']) assert.match(hero, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
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
assert.doesNotMatch(pageHero, /\.page-hero::before \{[^}]*background-size: var\(--page-hero-bg-size\)/);
assert.match(pageHero, /background-position: center, var\(--page-hero-bg-position\)/);
assert.match(pageHero, /background-repeat: no-repeat, no-repeat;/);
assert.match(pageHero, /@media[\s\S]*background-position: center, var\(--page-hero-bg-position-mobile\)/);
assert.doesNotMatch(pageHero, /@media[\s\S]*background-repeat:\s*repeat/);
assert.match(pageHero, /weak:/);
assert.match(pageHero, /strong:/);
const extractClampStart = (name, key) => {
  const pattern = key ? String.raw`const ${name} = \{[^}]*${key}: 'clamp\((\d+)px` : String.raw`const ${name} = variant === 'detail' \? 'clamp\(\d+px, [^']+' : 'clamp\((\d+)px`;
  const match = pageHero.match(new RegExp(pattern));
  assert.ok(match, `${name}.${key || 'normal'} clamp mapping missing`);
  return Number(match[1]);
};
const extractPxMapping = (name, key) => {
  const match = pageHero.match(new RegExp(String.raw`const ${name} = \{[^}]*${key}: '(\d+)px'`));
  assert.ok(match, `${name}.${key} px mapping missing`);
  return Number(match[1]);
};
const listingMin = ['compact', 'normal', 'tall', 'xlarge'].map((key) => extractPxMapping('listingHeightMin', key));
const listingMinMobile = ['compact', 'normal', 'tall', 'xlarge'].map((key) => extractPxMapping('listingHeightMinMobile', key));
const detailMin = ['compact', 'normal', 'tall', 'xlarge'].map((key) => extractPxMapping('detailHeightMin', key));
const detailMinMobile = ['compact', 'normal', 'tall', 'xlarge'].map((key) => extractPxMapping('detailHeightMinMobile', key));
for (const values of [listingMin, listingMinMobile, detailMin, detailMinMobile]) assert.ok(values[0] < values[1] && values[1] < values[2] && values[2] < values[3], `min-height mapping must increase: ${values.join(',')}`);
assert.ok(extractPxMapping('detailHeightMin', 'normal') < extractPxMapping('listingHeightMin', 'normal'), 'detail normal min-height must be smaller than listing normal min-height');
const desktopPadding = ['compact', 'normal', 'tall', 'xlarge'].map((key) => key === 'normal' ? extractClampStart('normalPadding', '') : extractClampStart('heightPadding', key));
const mobilePadding = ['compact', 'normal', 'tall', 'xlarge'].map((key) => key === 'normal' ? extractClampStart('normalPaddingMobile', '') : extractClampStart('heightPaddingMobile', key));
for (const values of [desktopPadding, mobilePadding]) assert.ok(values[0] < values[1] && values[1] < values[2] && values[2] < values[3], `height padding mapping must increase: ${values.join(',')}`);
assert.match(pageHero, /const normalPadding = variant === 'detail' \? 'clamp\(28px, 3\.6vw, 46px\)' : 'clamp\(36px, 4\.4vw, 58px\)'/);
assert.match(pageHero, /const normalPaddingMobile = variant === 'detail' \? 'clamp\(24px, 4vw, 40px\)' : 'clamp\(36px, 4\.4vw, 58px\)'/);
assert.match(pageHero, /heightMin = variant === 'detail' \? detailHeightMin : listingHeightMin/);
assert.match(pageHero, /heightMinMobile = variant === 'detail' \? detailHeightMinMobile : listingHeightMinMobile/);
assert.match(pageHero, /--page-hero-padding-mobile/);
assert.match(pageHero, /--page-hero-min-height/);
assert.match(pageHero, /--page-hero-min-height-mobile/);
assert.match(pageHero, /\.page-hero \{[^}]*min-height: var\(--page-hero-min-height\)/);
assert.match(pageHero, /@media[\s\S]*\.page-hero \{[^}]*min-height: var\(--page-hero-min-height-mobile\)[^}]*padding: var\(--page-hero-padding-mobile\) 0;/);
assert.doesNotMatch(pageHero, /@media[\s\S]*\.page-hero \{ padding: 36px 0 40px; \}/);
assert.match(pageHero, /<div class="container page-hero-grid">/);
assert.match(pageHero, /\.page-hero-grid \{[^}]*display: grid/);
assert.doesNotMatch(pageHero, /\.page-hero-grid \{[^}]*width: 100%/);
assert.match(pageHero, /--page-hero-detail-overlay-opacity/);
assert.match(pageHero, /detailOverlayOpacity = String\(Math\.round\(Number\(overlayOpacity\) \* 0\.8/);
assert.doesNotMatch(pageHero, /calc\(var\(--page-hero-overlay-opacity\) \* 0\.8\)/);
assert.match(renderPageHeroStyle(publicHeroAsset), /\/assets\/site-media\/2026\/07\/test\.webp/);
assert.match(renderPageHeroStyle(publicHeroAsset, 25, 75), /25% 75%/);

const catchAll = await readFile('src/pages/[...slug].astro', 'utf8');
assert.match(catchAll, /listPublishedPublicPages/);
assert.match(catchAll, /PublicPageRenderer/);
assert.doesNotMatch(catchAll, /getPublicPageRenderer/);
assert.match(catchAll, /buildPublicRouteIndex\(allPages\)/);
assert.doesNotMatch(catchAll, /getPublicRouteIndex/);
assert.doesNotMatch(catchAll, /page\.type !== 'content_page'/);
assert.doesNotMatch(catchAll, /Astro\.redirect\('\/404'\)/);
for (const removed of ['src/pages/arak/index.astro','src/pages/kapcsolat/index.astro','src/pages/integraciok/index.astro','src/pages/megoldasaink/index.astro','src/pages/megoldasaink/[slug].astro','src/pages/kinek-szol/index.astro','src/pages/kinek-szol/[slug].astro']) assert.equal(existsSync(removed), false, `${removed} must be removed`);

const listingCards = await readFile('src/components/ListingCards.astro', 'utf8');
assert.match(listingCards, /class="listing-card"/);
assert.match(listingCards, /item\.href \? \(/);
assert.match(listingCards, /listing-card:hover, \.listing-card:focus-visible/);
assert.match(listingCards, /target=\{publicHrefTarget\(item.href\)\} rel=\{publicHrefRel\(item.href\)\}/);
assert.match(listingCards, /normalizePublicHref/);
assert.match(listingCards, /linkLabel: href \? /);
assert.match(listingCards, /\{item.linkLabel && <i>\{item.linkLabel\}<\/i>\}/);
assert.match(listingCards, /listing-card--static:hover \{ transform: none; border-color: rgba\(15, 17, 89, 0\.1\); box-shadow: var\(--shadow-card\); \}/);
const linkHelper = await readFile('src/lib/content/links.ts', 'utf8');
assert.match(linkHelper, /isDomainLikePublicHref/);
assert.match(linkHelper, /return `https:\/\/\$\{raw\}`/);

const contentBlocks = await readFile('src/components/ContentBlocks.astro', 'utf8');
assert.match(contentBlocks, /import \{ normalizePublicHref, publicHrefRel, publicHrefTarget \}/);
assert.match(contentBlocks, /import ListingCards from/);
assert.match(contentBlocks, /<ListingCards items=\{items\}/);
assert.match(contentBlocks, /const link = linkAttrs\(cta.url\)/);
assert.match(contentBlocks, /href=\{link.href\} target=\{link.target\} rel=\{link.rel\}/);
assert.match(contentBlocks, /normalizePublicHref\(item.url \|\| item.href\)/);
assert.match(contentBlocks, /alt=\{media.alt \|\| ""\}/);
assert.match(contentBlocks, /if \(type === 'text'\) \{[\s\S]*type-text[\s\S]*block.body && <p>\{block.body\}<\/p>[\s\S]*if \(type === 'cta'\)/);
assert.match(contentBlocks, /if \(type === 'feature-list'\) \{[\s\S]*<ul>\{items.map/);
assert.match(contentBlocks, /return <article class:list=\{\['content-card', `type-\$\{type\}`\]\}>[\s\S]*block.body && <p>\{block.body\}<\/p>[\s\S]*items.length > 0 && <ul>\{items.map/);
assert.doesNotMatch(contentBlocks, /mini-card/);

const registry = await readFile('src/components/page-renderers/registry.ts', 'utf8');
for (const type of ['solutions_index','solution_detail','audiences_index','audience_detail','integrations','pricing','contact','content_page']) assert.match(registry, new RegExp(type));
assert.doesNotMatch(registry, /home:/);
assert.match(registry, /export function isSupportedPublicPageType/);
assert.match(registry, /unsupportedPublicPageTypeError/);
assert.match(registry, /Unsupported published public page\.type/);
assert.doesNotMatch(registry, /\.astro/);
const dispatcher = await readFile('src/components/page-renderers/PublicPageRenderer.astro', 'utf8');
for (const renderer of ['ContentPageRenderer','SolutionsIndexRenderer','SolutionDetailRenderer','AudiencesIndexRenderer','AudienceDetailRenderer','IntegrationsRenderer','PricingRenderer','ContactRenderer']) assert.match(dispatcher, new RegExp(`import ${renderer} from './${renderer}\\.astro'`));
for (const type of ['solutions_index','solution_detail','audiences_index','audience_detail','integrations','pricing','contact','content_page']) assert.match(dispatcher, new RegExp(`${type}:`));
assert.doesNotMatch(dispatcher, /home:/);
assert.match(dispatcher, /if \(!isSupportedPublicPageType\(page\.type\)\) throw unsupportedPublicPageTypeError\(page\.type\)/);
assert.match(dispatcher, /<Renderer page=\{page\} routeIndex=\{routeIndex\} mode=\{mode\} \/>/);
async function collectTsFiles(dir) { const out = []; for (const entry of await readdir(dir, { withFileTypes: true })) { const file = `${dir}/${entry.name}`; if (entry.isDirectory()) out.push(...await collectTsFiles(file)); else if (entry.isFile() && file.endsWith('.ts')) out.push(file); } return out; }
const tsSources = await Promise.all((await collectTsFiles('src')).map(async (file) => [file, await readFile(file, 'utf8')]));
for (const [file, source] of tsSources) assert.doesNotMatch(source, /from ['\"][^'\"]+\.astro['\"]/, `${file} must not import Astro components from TypeScript`);

const solutionsIndex = await readFile('src/components/page-renderers/SolutionsIndexRenderer.astro', 'utf8');
assert.match(solutionsIndex, /findRoleBlock\(page\?\.blocks, 'golden-cards'/);
assert.match(solutionsIndex, /const rawSolutionCards = cardsBlock\?\.items\?\.length \? cardsBlock.items : publishedSolutions/);
assert.match(solutionsIndex, /source: cardsBlock\?\.items\?\.length \? 'db-block' : 'golden'/);
assert.match(solutionsIndex, /<ListingCards items=\{solutionCards\}/);
assert.doesNotMatch(solutionsIndex, /basePath="\/megoldasaink\/"/);
const audiencesIndex = await readFile('src/components/page-renderers/AudiencesIndexRenderer.astro', 'utf8');
assert.match(audiencesIndex, /findRoleBlock\(page\?\.blocks, 'golden-cards'/);
assert.match(audiencesIndex, /const rawAudienceCards = cardsBlock\?\.items\?\.length \? cardsBlock.items : publishedAudiences/);
assert.match(audiencesIndex, /source: cardsBlock\?\.items\?\.length \? 'db-block' : 'golden'/);
assert.doesNotMatch(audiencesIndex, /basePath="\/kinek-szol\/"/);
for (const file of ['src/components/page-renderers/SolutionDetailRenderer.astro','src/components/page-renderers/AudienceDetailRenderer.astro']) {
  const source = await readFile(file, 'utf8');
  assert.match(source, /<PageHero\b[\s\S]*variant="detail"/);
  const cb = source.indexOf('<ContentBlocks');
  const related = source.indexOf('<RelatedLinks');
  const cta = source.indexOf('<CTASection');
  assert.ok(cb > -1 && related > cb && cta > related, `${file} detail order must be ContentBlocks -> RelatedLinks -> CTASection`);
  assert.match(source, /relatedPages\(routeIndex, page,/);
}
const pricingIndex = await readFile('src/components/page-renderers/PricingRenderer.astro', 'utf8');
assert.match(pricingIndex, /findRoleBlock\(page\?\.blocks, 'pricing-features'/);
assert.match(pricingIndex, /findRoleBlock\(page\?\.blocks, 'pricing-explainer'/);
assert.match(pricingIndex, /resolvePageCtaBlock\(page\?\.blocks, \{ role: 'pricing-cta' \}\)/);
assert.match(pricingIndex, /<CTASection block=\{ctaBlock\}/);
assert.match(pricingIndex, /priceFeatures = featureBlock\?\.items\?\.length \? featureBlock.items :/);
const contactIndex = await readFile('src/components/page-renderers/ContactRenderer.astro', 'utf8');
assert.match(contactIndex, /findRoleBlock\(page\?\.blocks, 'contact-main'/);
assert.match(contactIndex, /findRoleBlock\(page\?\.blocks, 'contact-features'/);
assert.match(contactIndex, /helpItems = featureBlock\?\.items\?\.length \? featureBlock.items :/);
assert.match(contactIndex, /safeContactIntro\(ctaBlock\?\.body\)/);
assert.match(contactIndex, /data-easylink-cta="demo"/);
const integrationsIndex = await readFile('src/components/page-renderers/IntegrationsRenderer.astro', 'utf8');
assert.match(integrationsIndex, /publishedIntegrations.map\(\(item\) => \(\{ title: item.title, text: item.shortDescription, order: item.order, status: item.status \}\)\)/);
assert.match(integrationsIndex, /findRoleBlock\(page\?\.blocks, 'integrations-intro'/);
assert.match(integrationsIndex, /findRoleBlock\(page\?\.blocks, 'integrations-important'/);
assert.match(integrationsIndex, /importantBlock\?\.title \?\? 'Fontos keret'/);
assert.match(integrationsIndex, /const remainingBlocks = withoutBlocks/);
assert.match(integrationsIndex, /<ContentBlocks blocks=\{remainingBlocks\}/);
assert.match(integrationsIndex, /<CTASection block=\{ctaSectionBlock\}/);
for (const token of ['asset={page?.heroAsset || "/assets/nati/hero-bg-flow-02.webp"}', 'height={page?.heroHeight}', 'imageFit={page?.heroImageFit}', 'overlayStrength={page?.heroOverlayStrength}', 'imageScale={page?.heroImageScale}']) {
  assert.match(integrationsIndex, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
assert.doesNotMatch(integrationsIndex, /integration-card/);
assert.doesNotMatch(integrationsIndex, /linkLabel:\s*'Részletek'/);
assert.doesNotMatch(integrationsIndex, /\.\.\.item/);
assert.match(integrationsIndex, /publishedIntegrations.map\(\(item\) => \(\{ title: item.title, text: item.shortDescription, order: item.order, status: item.status \}\)\)/);

console.log('Public composition smoke passed: detailed home, hero, listing, content block, renderer and dynamic routing contracts.');
