import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { blockContracts, blockTypeOptionsForContext } from '../src/lib/content/block-registry.mjs';
const required = ['text','feature-list','list','cards','card-grid','cta','image-text','video','faq','ai-preview','network-visual','split-text','ai-assistant-preview','integrations-strip'];
const types = blockContracts.map((entry) => entry.type);
assert.equal(new Set(types).size, types.length, 'registry types must be unique');
for (const type of required) assert.ok(types.includes(type), `${type} must be registered`);
assert.deepEqual(blockTypeOptionsForContext('home').map(([type]) => type), types, 'home context must expose registered block types deterministically');
const blocks = await readFile('src/lib/admin/render/blocks.mjs', 'utf8');
const content = await readFile('src/components/ContentBlocks.astro', 'utf8');
const validation = await readFile('src/lib/content/block-contracts.mjs', 'utf8');
for (const type of required) {
  assert.match(blocks, new RegExp(type.replace('-', '[-]')), `${type} admin/editor coverage missing`);
  assert.match(content + validation, new RegExp(type.replace('-', '[-]')), `${type} public/validator coverage missing`);
}
console.log('block registry smoke ok');
