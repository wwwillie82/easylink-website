import assert from 'node:assert/strict';
import { canonicalHomeBlockFixture, classifyHomeContentBlocks, validatePublishedHomeBlocksForSnapshot } from '../src/lib/content/home-blocks.mjs';
const generic = canonicalHomeBlockFixture().map((b)=> b.block_key === 'home:hero-meta' ? b : ({...b, ...({
 'home:intro': {type:'split-text', items:[{version:1,heading:'H'}]}, 'home:solutions': {type:'cards', items:[{version:2,cards:[],action:null}]}, 'home:ai-assistant': {type:'ai-assistant-preview'}, 'home:integrations': {type:'integrations-strip'}, 'home:audiences': {type:'cards', items:[{version:2,cards:[],action:null}]},
}[b.block_key]||{})}));
const blocks=[...generic,{id:90,block_key:'manual:text',type:'text',status:'published',sort_order:1},{id:91,block_key:'manual:cta',type:'cta',status:'published',sort_order:2},{id:92,block_key:'manual:video',type:'video',status:'published',sort_order:3},{id:93,block_key:'manual:faq',type:'faq',status:'published',sort_order:4}];
const c=classifyHomeContentBlocks(blocks);
assert.equal(c.state,'generic-with-valid-manual');
assert.equal(c.validManual.length,4);
assert(c.validManual.every((b)=>b.role==='valid manual generic middle'));
assert.notEqual(classifyHomeContentBlocks(generic.map((b)=>b.block_key==='home:intro'?{...b,type:'cards'}:b)).state,'generic-clean');
assert.notEqual(classifyHomeContentBlocks(generic.filter((b)=>b.block_key!=='home:intro')).state,'generic-clean');
assert.notEqual(classifyHomeContentBlocks([...generic, {...generic.find((b)=>b.block_key==='home:intro'), id:999}]).state,'generic-clean');
assert.notEqual(classifyHomeContentBlocks(generic.filter((b)=>b.block_key!=='home:hero-meta')).state,'generic-clean');
const duplicateIntroMissingAudience = [...generic.filter((b)=>b.block_key!=='home:audiences'), {...generic.find((b)=>b.block_key==='home:intro'), id:777, sort_order:55}];
assert.notEqual(classifyHomeContentBlocks(duplicateIntroMissingAudience).state,'generic-clean');
assert.equal(classifyHomeContentBlocks(generic).state,'generic-clean');
assert.equal(classifyHomeContentBlocks(blocks).state,'generic-with-valid-manual');
const rows = generic.filter((b)=>b.block_key!=='home:hero-meta').map((b,i)=>({id:i+1,page_id:1,...b,items:JSON.stringify(b.items),status:'published'}));
const errors = validatePublishedHomeBlocksForSnapshot({ pages:[{id:1,route:'/',type:'home',status:'published'}], blocks: rows });
assert(errors.some((e)=>e.code==='HOME_PUBLISHED_EXTRAS_BLOCKER'));
console.log('home classifier behavior smoke ok');
