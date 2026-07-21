import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cardsBlock = readFileSync(new URL('../src/components/CardsBlock.astro', import.meta.url), 'utf8');
const contentBlocks = readFileSync(new URL('../src/components/ContentBlocks.astro', import.meta.url), 'utf8');
const integrations = readFileSync(new URL('../src/components/page-renderers/IntegrationsRenderer.astro', import.meta.url), 'utf8');
const adminBlocks = readFileSync(new URL('../src/lib/admin/render/blocks.mjs', import.meta.url), 'utf8');

assert.match(cardsBlock, /import ListingCards from '@\/components\/ListingCards\.astro';/);
assert.match(cardsBlock, /publicCardsFromItems\(Array\.isArray\(block\?\.items\) \? block\.items : \[\], \{ pages: routeIndex\?\.pages \|\| \[\] \}\)/);
assert.match(cardsBlock, /\{block\.title && <h2>\{block\.title\}<\/h2>\}/);
assert.match(cardsBlock, /\{block\.body && <p>\{block\.body\}<\/p>\}/);
assert.match(cardsBlock, /\{block\.title && <span class="eyebrow">\{block\.title\}<\/span>\}/);
assert.match(cardsBlock, /\{block\.body && <h2>\{block\.body\}<\/h2>\}/);
assert.match(cardsBlock, /<ListingCards items=\{cardsVm\.cards\} \/>/);
assert.match(cardsBlock, /cardsVm\.action\?\.href/);
assert.doesNotMatch(cardsBlock, /block\.title \|\||block\.body \|\|/);

assert.match(contentBlocks, /import CardsBlock from '@\/components\/CardsBlock\.astro';/);
assert.match(contentBlocks, /<CardsBlock block=\{block\} routeIndex=\{routeIndex\} presentation=\{isHomeContext \? 'home' : 'standard'\} \/>/);
assert.match(contentBlocks, /return <CardsBlock block=\{block\} routeIndex=\{routeIndex\} presentation="standard" \/>/);
assert.doesNotMatch(contentBlocks, /import ListingCards from|publicCardsFromItems|<ListingCards items=/);

assert.match(integrations, /import CardsBlock from '@\/components\/CardsBlock\.astro';/);
assert.match(integrations, /<CardsBlock block=\{cardsBlock\} routeIndex=\{routeIndex\} presentation="standard" \/>/);
assert.doesNotMatch(integrations, /cards-heading|import ListingCards from|publicCardsFromItems|<ListingCards items=/);

assert.match(adminBlocks, /<label data-panel="common">\$\{titleLabel\}<input name="title" value="\$\{esc\(b\.title\)\}"><\/label>/);
assert.match(adminBlocks, /<label data-panel="common">\$\{bodyLabel\}<textarea name="body">\$\{esc\(b\.body\)\}<\/textarea><\/label>/);
assert.doesNotMatch(adminBlocks, /input name="title"[^>]*required|textarea name="body"[^>]*required/);

console.log('Cards block renderer smoke passed: one shared component renders optional heading/body, cards and action across generic and integrations paths.');
