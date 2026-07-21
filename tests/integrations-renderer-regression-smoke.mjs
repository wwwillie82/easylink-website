import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const renderer = readFileSync(new URL('../src/components/page-renderers/IntegrationsRenderer.astro', import.meta.url), 'utf8');

assert.match(renderer, /import CardsBlock from '@\/components\/CardsBlock\.astro';/);
assert.doesNotMatch(renderer, /publishedIntegrations|publicCardsFromItems|import ListingCards from/);
assert.match(renderer, /const hasNetworkContent = Boolean\(introBlock \|\| cardsBlock \|\| importantBlock\);/);
assert.match(renderer, /\{introBlock && <div class="container intro">/);
assert.match(renderer, /\{cardsBlock && <div class="container"><CardsBlock block=\{cardsBlock\} routeIndex=\{routeIndex\} presentation="standard" \/><\/div>\}/);
assert.doesNotMatch(renderer, /cards-heading|cardsBlock\.title && <h2>|cardsBlock\.body && <p>|<ListingCards items=/);
assert.match(renderer, /\{importantBlock && <div class="container"><article class="important card">/);
assert.doesNotMatch(renderer, /Fontos keret/);
assert.doesNotMatch(renderer, /A public tartalom integrációs irányokat/);

console.log('Integrations renderer regression smoke passed: the page delegates the complete cards block to the shared renderer and does not hardcode cards markup.');
