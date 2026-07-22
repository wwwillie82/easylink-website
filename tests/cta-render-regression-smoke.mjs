import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { pageCtaRoles, resolvePageCtaBlock, withoutPageCtaBlocks, isRecognizedPageCta, normalizePageCtaBlock, resolvePageCta } from '../src/lib/content/page-cta-contract.mjs';

const defaults = { eyebrow: 'Kapcsolódjunk', title: 'Default', description: 'Default body', primaryLabel: 'Default primary', primaryUrl: '/default/', secondaryLabel: 'Próbáld ki ingyen', secondaryUrl: 'https://deploy.easylink.hu' };
const pricing = { blockKey: '/arak/:cta:2', type: 'cta', title: 'Árak CTA', body: 'Árak body', items: [{ presentationRole: 'pricing-cta', label: 'Demót kérek', url: '/kapcsolat/' }] };
const canonical = { blockKey: 'golden:cta-section', type: 'cta', title: 'Generic CTA', body: 'Generic body', items: [{ presentationRole: 'cta-section', label: 'Demót kérek', url: '/kapcsolat/', secondaryLabel: 'Próba', secondaryUrl: '/proba/' }] };
const home = { blockKey: '/:cta:4', type: 'cta', title: 'Home CTA', body: 'Home body', items: [{ label: 'Demót kérek', url: '/kapcsolat/' }] };
const inline = { blockKey: 'manual:inline', type: 'cta', title: 'Inline CTA', body: 'Inline body', items: [{ label: 'Tovább', url: '/x/' }] };

// Public settings contract: DB defaultCta must flow through the single public settings reader.
const ts = await import('typescript');
const settingsSource = (await readFile('src/lib/content/settings.ts', 'utf8'))
  .replace("from '@/lib/admin/settings.mjs'", `from '${pathToFileURL('src/lib/admin/settings.mjs').href}'`)
  .replace("from '@/lib/content/video.mjs'", `from '${pathToFileURL('src/lib/content/video.mjs').href}'`);
const settingsJs = ts.default.transpileModule(settingsSource, { compilerOptions: { module: ts.default.ModuleKind.ES2022, target: ts.default.ScriptTarget.ES2022, verbatimModuleSyntax: false } }).outputText;
const settingsMod = await import(`data:text/javascript;base64,${Buffer.from(settingsJs).toString('base64')}`);
const dbDefaultCta = { eyebrow: 'DB eyebrow', title: 'DB title', description: 'DB body', primaryLabel: 'Demót kérnék', primaryUrl: '/db-demo/', secondaryLabel: 'Próbáld ki ingyenesen', secondaryUrl: '/db-trial/' };
const publicSettings = await settingsMod.readPublicSiteSettingsFromPool({
  async query(sql, params) {
    if (/site_settings/.test(sql)) return [[{ key: 'defaultCta', value: JSON.stringify(dbDefaultCta) }], null];
    return [[], null];
  },
});
assert.equal(publicSettings.defaultCta.primaryLabel, 'Demót kérnék');
assert.equal(publicSettings.defaultCta.secondaryLabel, 'Próbáld ki ingyenesen');
const fallbackSettings = settingsMod.publicFallback();
assert.equal(fallbackSettings.defaultCta.primaryLabel, 'Demót kérek');
const normalizedWithDbLabels = normalizePageCtaBlock({ ...pricing, items: [{ presentationRole: 'pricing-cta', label: '', url: '   ', secondaryLabel: ' ', secondaryUrl: null, custom: 'keep' }] }, publicSettings.defaultCta);
assert.equal(normalizedWithDbLabels.items[0].secondaryLabel, 'Próbáld ki ingyenesen');
assert.equal(normalizedWithDbLabels.items[0].secondaryUrl, '/db-trial/');
assert.equal(normalizedWithDbLabels.items[0].label, 'Demót kérnék');
assert.equal(normalizedWithDbLabels.items[0].url, '/db-demo/');
assert.equal(normalizedWithDbLabels.items[0].custom, 'keep');

assert.equal(resolvePageCtaBlock([pricing], { role: 'pricing-cta' }), pricing, 'pricing-cta block must be found by the page CTA resolver');
assert.deepEqual(withoutPageCtaBlocks([pricing, inline]), [inline], 'consumed pricing CTA must not remain for ContentBlocks');
assert.equal(normalizePageCtaBlock(pricing, defaults).items[0].secondaryLabel, defaults.secondaryLabel, 'pricing special merge must add secondary label');
assert.equal(normalizePageCtaBlock(pricing, defaults).items[0].secondaryUrl, defaults.secondaryUrl, 'pricing special merge must add secondary URL');
assert.equal(resolvePageCtaBlock([canonical], { role: 'cta-section' }), canonical, 'canonical cta-section must resolve as page CTA');
const normalizedHome = normalizePageCtaBlock(home, defaults);
assert.equal(normalizedHome.items[0].secondaryLabel, defaults.secondaryLabel, 'home legacy CTA merge must add secondary label');
assert.deepEqual(pageCtaRoles(normalizedHome), ['home-legacy-cta'], 'home normalization must not add cta-section identity');
assert.equal(resolvePageCtaBlock([home], { role: 'home-legacy-cta' }), home, 'home /:cta:4 legacy CTA must resolve as page CTA');
assert.throws(() => resolvePageCtaBlock([pricing, canonical], { role: 'pricing-cta' }), (error) => error?.code === 'CTA_INTEGRITY_ERROR', 'conflicting page CTAs must throw a controlled CTA_INTEGRITY_ERROR');
assert.equal(resolvePageCtaBlock([pricing, inline], { role: 'pricing-cta' }), pricing, 'manual inline CTA must not conflict with pricing CTA');
assert.equal(resolvePageCtaBlock([canonical, inline], { role: 'cta-section' }), canonical, 'manual inline CTA must not conflict with canonical CTA');
assert.deepEqual(pageCtaRoles(pricing), ['pricing-cta'], 'pricing CTA role must remain pricing-cta');
assert.deepEqual(pageCtaRoles(canonical), ['cta-section'], 'canonical CTA role must remain cta-section');
assert.equal(resolvePageCtaBlock([home], { role: 'home-legacy-cta' }), home, 'single home CTA must pass global integrity');
assert.throws(() => resolvePageCtaBlock([{ blockKey: 'golden:cta-section', type: 'cta', items: [{ presentationRole: 'pricing-cta' }] }]), (error) => error?.code === 'CTA_INTEGRITY_ERROR', 'single block with multiple page CTA roles must fail integrity');
assert.equal(isRecognizedPageCta(inline), false, 'arbitrary manual type=cta must remain a generic inline CTA candidate');
for (const block of [canonical, pricing, home]) assert.equal(isRecognizedPageCta(block), true, `${block.blockKey} must be blocked from generic ContentBlocks CTA rendering`);
assert.equal(resolvePageCtaBlock([canonical]), canonical, 'canonical cta-section must resolve generically');
assert.equal(resolvePageCtaBlock([pricing]), pricing, 'pricing-cta must resolve generically');
assert.equal(resolvePageCtaBlock([]), undefined, 'missing page CTA keeps CTASection default behavior available');
assert.throws(() => resolvePageCtaBlock([canonical, pricing]), (error) => error?.code === 'CTA_INTEGRITY_ERROR', 'canonical + pricing CTA conflict must remain fail-closed');

const genericSource = await readFile('src/components/page-renderers/GenericPublicPageRenderer.astro', 'utf8');
assert.match(genericSource, /resolvePageCtaBlock\(page\?\.blocks\)/, 'Generic renderer must use the common page CTA resolver without page-type role branching');
assert.match(genericSource, /<CTASection block=\{ctaSectionBlock\}/, 'Generic renderer must render page CTA through CTASection');
assert.match(genericSource, /composePublicSections\(page\?\.blocks \|\| \[\]\)/, 'Generic renderer must keep CTA out of composed content sections');

const homeSource = await readFile('src/pages/index.astro', 'utf8');
assert.match(homeSource, /resolvePageCtaBlock\(homePage\?\.blocks, \{ role: 'home-legacy-cta' \}\)/, 'home page must use the /:cta:4 legacy page CTA resolver');
assert.match(homeSource, /<Hero[\s\S]*<ContentBlocks[\s\S]*<CTASection/, 'home component order must be Hero -> ContentBlocks -> CTASection');

const contentBlocks = await readFile('src/components/ContentBlocks.astro', 'utf8');
assert.match(contentBlocks, /const visibleBlocks = blocks\.filter\(\(block\) => !isRecognizedPageCta\(block\)\)/, 'ContentBlocks must defensively skip recognized page CTAs');
assert.match(contentBlocks, /content-card type-cta/, 'ContentBlocks must still support arbitrary manual inline type=cta cards');

const modeDefaults = { eyebrow: 'GLOBAL EYEBROW', title: 'GLOBAL CTA TITLE', description: 'GLOBAL BODY', primaryLabel: 'GLOBAL PRIMARY', primaryUrl: '/global/', secondaryLabel: 'GLOBAL SECONDARY', secondaryUrl: '/global-secondary/' };
const localBlock = { blockKey: 'golden:cta-section', type: 'cta', title: 'LOCAL CTA TITLE', body: 'LOCAL BODY', items: [{ presentationRole: 'cta-section', ctaMode: 'custom', eyebrow: 'LOCAL EYEBROW', label: 'LOCAL PRIMARY', url: '/local/', secondaryLabel: 'LOCAL SECONDARY', secondaryUrl: '/local-secondary/' }] };
assert.equal(resolvePageCta(null, modeDefaults).mode, 'global', 'missing CTA block resolves as global');
assert.equal(resolvePageCta(null, modeDefaults).content.title, 'GLOBAL CTA TITLE', 'missing CTA block renders global content');
assert.equal(resolvePageCta({ ...localBlock, items: [{ ...localBlock.items[0], ctaMode: 'global' }] }, modeDefaults).content.title, 'GLOBAL CTA TITLE', 'global mode ignores local title');
assert.equal(resolvePageCta(localBlock, modeDefaults).content.title, 'LOCAL CTA TITLE', 'custom mode uses local title');
assert.equal(resolvePageCta({ ...localBlock, items: [{ ...localBlock.items[0], ctaMode: 'hidden' }] }, modeDefaults).shouldRender, false, 'hidden mode does not render');
assert.throws(() => resolvePageCta({ ...localBlock, items: [{ ...localBlock.items[0], ctaMode: 'bogus' }] }, modeDefaults), (error) => error?.code === 'CTA_INTEGRITY_ERROR', 'explicit invalid mode fails integrity');
assert.equal(resolvePageCta({ ...localBlock, items: [{ ...localBlock.items[0], ctaMode: undefined }] }, modeDefaults).mode, 'global', 'legacy missing mode is global');
assert.doesNotMatch(homeSource, /normalizePageCtaBlock/, 'home must pass raw CTA block without pre-normalizing');
assert.doesNotMatch(genericSource, /normalizePageCtaBlock/, 'generic renderer must pass raw CTA block without pre-normalizing');

console.log('CTA render regression smoke passed');
