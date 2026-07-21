import assert from 'node:assert/strict';
import { canonicalHomeBlockFixture, homeMiddleContentBlocks } from '../src/lib/content/home-blocks.mjs';
const blocks = canonicalHomeBlockFixture().map((b)=> b.block_key === 'home:hero-meta' ? b : ({ ...b, ...({
 'home:intro': { type:'split-text', items:[{version:1, heading:b.items?.[0]?.heading, layout:'split'}] },
 'home:solutions': { type:'cards', items:[{version:2, cards:b.items.filter((i)=>i.kind==='card'), action:b.items.find((i)=>i.kind==='section-action')} ] },
 'home:ai-assistant': { type:'ai-assistant-preview' },
 'home:integrations': { type:'integrations-strip' },
 'home:audiences': { type:'cards', items:[{version:2, cards:b.items.filter((i)=>i.kind==='card'), action:null}] },
}[b.block_key] || {}) }));
const middle = homeMiddleContentBlocks({ page:{ blocks }, mode:'db-authoritative', routeIndex:{pages:[]} });
assert.deepEqual(middle.map((b)=>b.type), ['split-text','cards','ai-assistant-preview','integrations-strip','cards']);
assert.equal(middle[0].title, 'Public site előkészítés');
assert.equal(middle[0].items[0].heading, 'Nem még egy táblázat, hanem egy átlátható vezetői felület.');
assert.equal(middle[1].title, 'Megoldásaink');
assert.equal(middle[1].body, 'Egy rendszer a napi működés kulcspontjaira.');
assert.equal(middle[2].title, 'AI asszisztens');
assert.equal(middle[3].title, 'Integrációs adatáramlás');
assert.equal(middle[4].title, 'Kinek szól?');
console.log('home canonical editorial stacked smoke ok');
