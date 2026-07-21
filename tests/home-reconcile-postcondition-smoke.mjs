import assert from 'node:assert/strict';
import { assertArchiveOnlyPostcondition } from '../src/lib/content/home-adopt-cli.mjs';
const rows = [
 {id:1,page_id:1,block_key:'home:intro',type:'split-text',title:'T',body:'B',items:[{a:1}],sort_order:10,status:'published'},
 {id:2,page_id:1,block_key:'manual',type:'text',title:'M',body:'MB',items:[],sort_order:1,status:'published'},
];
assert.doesNotThrow(()=>assertArchiveOnlyPostcondition(rows, [rows[0], {...rows[1], status:'archived'}], [2]));
assert.doesNotThrow(()=>assertArchiveOnlyPostcondition([{...rows[1], status:'archived'}], [{...rows[1], status:'archived'}], [2]));
assert.throws(()=>assertArchiveOnlyPostcondition(rows, [rows[0]], [2]), /row count/);
assert.throws(()=>assertArchiveOnlyPostcondition(rows, [{...rows[0], title:'X'}, {...rows[1], status:'archived'}], [2]), /non-status/);
assert.throws(()=>assertArchiveOnlyPostcondition(rows, [rows[0], {...rows[1], title:'X', status:'archived'}], [2]), /non-status/);
assert.throws(()=>assertArchiveOnlyPostcondition(rows, [rows[0], rows[1]], [2]), /was not archived/);
console.log('home reconcile postcondition smoke ok');
