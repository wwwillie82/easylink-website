import assert from 'node:assert/strict';
import { runReconcileArchiveTransaction } from '../src/lib/content/home-adopt-cli.mjs';
import { classifyHomeContentBlocks } from '../src/lib/content/home-blocks.mjs';
const baseRows = () => [
 {id:1,page_id:1,block_key:'home:hero-meta',type:'hero-meta',title:'H',body:null,items:'[]',sort_order:0,status:'published'},
 {id:2,page_id:1,block_key:'home:intro',type:'split-text',title:'I',body:'B',items:'[{"version":1,"heading":"H"}]',sort_order:10,status:'published'},
 {id:3,page_id:1,block_key:'home:solutions',type:'cards',title:'S',body:'B',items:'[{"version":2,"cards":[],"action":null}]',sort_order:20,status:'published'},
 {id:4,page_id:1,block_key:'home:ai-assistant',type:'ai-assistant-preview',title:'A',body:'B',items:'[]',sort_order:30,status:'published'},
 {id:5,page_id:1,block_key:'home:integrations',type:'integrations-strip',title:'N',body:'B',items:'[]',sort_order:40,status:'published'},
 {id:6,page_id:1,block_key:'home:audiences',type:'cards',title:'Au',body:'B',items:'[{"version":2,"cards":[],"action":null}]',sort_order:50,status:'published'},
 {id:7,page_id:1,block_key:'manual:a',type:'text',title:'M',body:'B',items:'[]',sort_order:1,status:'published'},
 {id:8,page_id:1,block_key:'manual:b',type:'video',title:'V',body:'B',items:'[]',sort_order:2,status:'published'},
];
function mockConn({ affected = [1], mutateFresh } = {}) { const rows = baseRows(); const calls=[]; return { calls, async beginTransaction(){calls.push('begin');}, async commit(){calls.push('commit');}, async rollback(){calls.push('rollback');}, async query(sql,args){calls.push(sql); if(sql.startsWith('SELECT * FROM site_pages')) return [[{id:1,route:'/',type:'home'}]]; if(sql.startsWith('SELECT * FROM site_content_blocks')) { const out=rows.map((r)=>({...r})); return [mutateFresh ? mutateFresh(out, calls) : out]; } return [[]]; }, async execute(sql,args){calls.push(sql); const row=rows.find((r)=>r.id===args[0]); const result={affectedRows: affected.shift() ?? 1}; if(result.affectedRows===1&&row) row.status='archived'; return [result]; } }; }
let conn = mockConn();
await runReconcileArchiveTransaction(conn, { targetIds:[7], classifyRows: classifyHomeContentBlocks });
assert(conn.calls.includes('commit'));
conn = mockConn({ affected:[0] });
await assert.rejects(()=>runReconcileArchiveTransaction(conn,{targetIds:[7], classifyRows: classifyHomeContentBlocks}), /affected 0/);
assert(conn.calls.includes('rollback'));
conn = mockConn({ affected:[1,0] });
await assert.rejects(()=>runReconcileArchiveTransaction(conn,{targetIds:[7,8], classifyRows: classifyHomeContentBlocks}), /affected 0/);
assert(conn.calls.includes('rollback'));
conn = mockConn({ mutateFresh:(rows,calls)=> calls.filter((c)=>String(c).startsWith('SELECT * FROM site_content_blocks')).length>1 ? rows.map((r)=>r.id===1?{...r,title:'BAD'}:r) : rows });
await assert.rejects(()=>runReconcileArchiveTransaction(conn,{targetIds:[7], classifyRows: classifyHomeContentBlocks}), /non-status/);
assert(conn.calls.includes('rollback'));
conn = mockConn({ mutateFresh:(rows,calls)=> calls.filter((c)=>String(c).startsWith('SELECT * FROM site_content_blocks')).length>1 ? rows.map((r)=>r.id===7?{...r,title:'BAD',status:'archived'}:r) : rows });
await assert.rejects(()=>runReconcileArchiveTransaction(conn,{targetIds:[7], classifyRows: classifyHomeContentBlocks}), /non-status/);
conn = mockConn({ mutateFresh:(rows)=>rows.map((r)=>r.id===7?{...r,status:'archived'}:r) });
await runReconcileArchiveTransaction(conn, { targetIds:[7], classifyRows: classifyHomeContentBlocks });
console.log('home reconcile transaction smoke ok');
