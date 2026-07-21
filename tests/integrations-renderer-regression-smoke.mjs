import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { publicCardsFromItems } from '../src/lib/content/block-contracts.mjs';

const renderer = readFileSync(new URL('../src/components/page-renderers/IntegrationsRenderer.astro', import.meta.url), 'utf8');

assert.match(renderer, /import \{ publicCardsFromItems \} from '@\/lib\/content\/block-contracts\.mjs';/);
assert.doesNotMatch(renderer, /publishedIntegrations/);
assert.match(renderer, /const cardsVm = cardsBlock \? publicCardsFromItems\(cardsBlock\.items \?\? \[\], \{ pages: routeIndex\?\.pages \|\| \[\] \}\) : null;/);
assert.match(renderer, /\{introBlock && <div class="container intro">/);
assert.match(renderer, /\{cardsVm\?\.cards\?\.length > 0 && <div class="container"><ListingCards items=\{cardsVm\.cards\} \/><\/div>\}/);
assert.match(renderer, /\{importantBlock && <div class="container"><article class="important card">/);
assert.doesNotMatch(renderer, /Fontos keret/);
assert.doesNotMatch(renderer, /A public tartalom integrációs irányokat/);

const cards = [
  { title: 'NAV Online Számla', text: 'NAV leírás', target_type: 'legacy', href: '' },
  { title: 'Magyar bankok', text: 'Banki leírás', target_type: 'legacy', href: '' },
  { title: 'Hostware', text: 'Hostware leírás', target_type: 'legacy', href: '' },
  { title: 'Számlázz.hu', text: 'Számlázz leírás', target_type: 'legacy', href: '' },
  { title: 'Billingo', text: 'Billingo leírás', target_type: 'legacy', href: '' },
  { title: 'Cégjelző', text: 'Cégjelző leírás', target_type: 'legacy', href: '' }
];
const vm = publicCardsFromItems([{ version: 2, variant: 'default', cards, action: null }]);
assert.equal(vm.cards.length, 6);
assert.deepEqual(vm.cards.map((card) => card.title), cards.map((card) => card.title));
assert.deepEqual(vm.cards.map((card) => card.text), cards.map((card) => card.text));

console.log('Integrations renderer regression smoke passed: cards V2 is normalized and absent important content is not hardcoded.');
