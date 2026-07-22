import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const home = await readFile('src/pages/index.astro', 'utf8');
for (const token of ['Hero', 'ContentBlocks', 'CTASection']) {
  assert.match(home, new RegExp(`import ${token} from`));
  assert.ok(home.includes(`<${token}`));
}
assert.doesNotMatch(home, /import PageHero from/);
assert.doesNotMatch(home, /import HomeRenderer from/);
assert.doesNotMatch(home, /publishedSolutions|publishedAudiences|resolveListingCards/);
assert.doesNotMatch(home, /basePath="\/megoldasaink\/"|basePath="\/kinek-szol\/"|href="\/megoldasaink\/"/);
assert.match(home, /getPublicRouteIndex/);
assert.match(home, /homeMiddleContentBlocks/);
assert.doesNotMatch(home, /normalizeHomePage/);
const order = ['<Header', '<Hero', '<ContentBlocks', '<CTASection', '<Footer'];
let cursor = -1;
for (const marker of order) {
  const next = home.indexOf(marker, cursor + 1);
  assert.ok(next > cursor, `missing or out of order home marker: ${marker}`);
  cursor = next;
}
const genericContentBlocks = await readFile('src/components/ContentBlocks.astro', 'utf8');
for (const token of ['CardsBlock', 'AiAssistantPreviewBlock', 'IntegrationsStripBlock']) {
  assert.match(genericContentBlocks, new RegExp(token));
}

const hero = await readFile('src/components/Hero.astro', 'utf8');
for (const phrase of ['heroCta.secondaryLabel', 'VideoMedia']) assert.match(hero, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.doesNotMatch(hero, /Easylink ügyvitel \+ AI|easyLink ERP|Felejtsd el a táblázatokat|hero-bg-flow-03\.webp/);
assert.doesNotMatch(hero, /PageHero/);
const repositorySource = await readFile('src/lib/db/repository.ts', 'utf8');
assert.match(repositorySource, /heroTitle: row\.type === 'home' \? \(row\.hero_title \?\? ''\) : \(row\.hero_title \?\? row\.title\)/);
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
assert.match(listingCards, /target=\{publicHrefTarget\(item\.href\)\} rel=\{publicHrefRel\(item\.href\)\}/);
assert.match(listingCards, /normalizePublicHref/);
assert.match(listingCards, /linkLabel: href \? /);
assert.match(listingCards, /\{item\.linkLabel && <i>\{item\.linkLabel\}<\/i>\}/);
assert.match(listingCards, /listing-card--static:hover \{ transform: none; border-color: rgba\(15, 17, 89, 0\.1\); box-shadow: var\(--shadow-card\); \}/);
const linkHelper = await readFile('src/lib/content/links.ts', 'utf8');
assert.match(linkHelper, /isDomainLikePublicHref/);
assert.match(linkHelper, /return `https:\/\/\$\{raw\}`/);

const contentBlocks = await readFile('src/components/ContentBlocks.astro', 'utf8');
assert.match(contentBlocks, /import \{ normalizePublicHref, publicHrefRel, publicHrefTarget \}/);
assert.match(contentBlocks, /import CardsBlock from/);
assert.match(contentBlocks, /<CardsBlock block=\{block\} routeIndex=\{routeIndex\}/);
assert.doesNotMatch(contentBlocks, /import ListingCards from|publicCardsFromItems|<ListingCards items=/);
assert.match(contentBlocks, /const link = linkAttrs\(cta\.url\)/);
assert.match(contentBlocks, /href=\{link\.href\} target=\{link\.target\} rel=\{link\.rel\}/);
assert.match(contentBlocks, /normalizePublicHref\(item\.url \|\| item\.href\)/);
assert.match(contentBlocks, /alt=\{media\.alt \|\| ""\}/);
assert.match(contentBlocks, /if \(type === 'text'\) \{[\s\S]*type-text[\s\S]*block\.body && <p>\{block\.body\}<\/p>[\s\S]*if \(type === 'cta'\)/);
assert.match(contentBlocks, /if \(type === 'feature-list'\) \{[\s\S]*<ul>\{items\.map/);
assert.match(contentBlocks, /return <article class:list=\{\['content-card', `type-\$\{type\}`\]\}>[\s\S]*block\.body && <p>\{block\.body\}<\/p>[\s\S]*items\.length > 0 && <ul>\{items\.map/);
assert.doesNotMatch(contentBlocks, /mini-card/);

const registry = await readFile('src/components/page-renderers/registry.ts', 'utf8');
for (const type of ['solutions_index','solution_detail','audiences_index','audience_detail','integrations','pricing','contact','content_page']) assert.match(registry, new RegExp(type));
assert.doesNotMatch(registry, /home:/);
assert.match(registry, /export function isSupportedPublicPageType/);
assert.match(registry, /unsupportedPublicPageTypeError/);
assert.match(registry, /Unsupported published public page\.type/);
assert.doesNotMatch(registry, /\.astro/);
const dispatcher = await readFile('src/components/page-renderers/PublicPageRenderer.astro', 'utf8');
assert.match(dispatcher, /GenericPublicPageRenderer/);
assert.doesNotMatch(dispatcher, /ContentPageRenderer|SolutionsIndexRenderer|SolutionDetailRenderer|AudiencesIndexRenderer|AudienceDetailRenderer|IntegrationsRenderer|PricingRenderer|ContactRenderer/);
assert.doesNotMatch(dispatcher, /solutions_index:|solution_detail:|audiences_index:|audience_detail:|integrations:|pricing:|contact:|content_page:/);
assert.doesNotMatch(dispatcher, /home:/);
assert.match(dispatcher, /if \(!isSupportedPublicPageType\(page\.type\)\) throw unsupportedPublicPageTypeError\(page\.type\)/);
assert.match(dispatcher, /<GenericPublicPageRenderer page=\{page\} routeIndex=\{routeIndex\} mode=\{mode\} \/>/);
async function collectTsFiles(dir) { const out = []; for (const entry of await readdir(dir, { withFileTypes: true })) { const file = `${dir}/${entry.name}`; if (entry.isDirectory()) out.push(...await collectTsFiles(file)); else if (entry.isFile() && file.endsWith('.ts')) out.push(file); } return out; }
const tsSources = await Promise.all((await collectTsFiles('src')).map(async (file) => [file, await readFile(file, 'utf8')]));
for (const [file, source] of tsSources) assert.doesNotMatch(source, /from ['"][^'"]+\.astro['"]/, `${file} must not import Astro components from TypeScript`);

const genericRenderer = await readFile('src/components/page-renderers/GenericPublicPageRenderer.astro', 'utf8');
const publicSection = await readFile('src/components/PublicSection.astro', 'utf8');
const composer = await readFile('src/lib/content/section-composition.mjs', 'utf8');
assert.match(genericRenderer, /<PageHero[\s\S]*variant=\{heroVariant\}/);
assert.match(genericRenderer, /composePublicSections\(page\?\.blocks \|\| \[\]\)/);
assert.match(genericRenderer, /<CTASection block=\{ctaSectionBlock\}/);
assert.match(publicSection, /<RelatedLinks/);
assert.match(publicSection, /<ContentBlocks blocks=\{blocks\} routeIndex=\{routeIndex\} layout="fragment" \/>/);
assert.match(composer, /sectionGroupKey/);
assert.match(composer, /safeColumnRatio/);
assert.doesNotMatch(genericRenderer + publicSection + composer, /relatedPages\(|resolveListingCards\(|pricing-features|contact-main|integrations-intro/);


console.log('Public composition smoke passed: detailed home, hero, listing, content block, renderer and dynamic routing contracts.');
