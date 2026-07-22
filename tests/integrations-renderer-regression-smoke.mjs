import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const generic = readFileSync(new URL('../src/components/page-renderers/GenericPublicPageRenderer.astro', import.meta.url), 'utf8');
const section = readFileSync(new URL('../src/components/PublicSection.astro', import.meta.url), 'utf8');
assert.match(generic, /composePublicSections/);
assert.match(section, /<ContentBlocks blocks=\{blocks\} routeIndex=\{routeIndex\} layout="fragment" \/>/);
assert.doesNotMatch(generic + section, /publishedIntegrations|publicCardsFromItems|import ListingCards from|integrations-intro|integrations-important/);
console.log('Integrations generic renderer regression smoke passed.');
