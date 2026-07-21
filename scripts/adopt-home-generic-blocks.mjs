#!/usr/bin/env node
import { createPool } from '../src/lib/db/client.mjs';
import { HOME_INTRO_KEY, HOME_SOLUTIONS_KEY, HOME_AI_KEY, HOME_INTEGRATIONS_KEY, HOME_AUDIENCES_KEY, legacyHomeBlockToGenericBlock, classifyHomeContentBlocks } from '../src/lib/content/home-blocks.mjs';
import { parseAdoptHomeGenericArgs, assertArchiveOnlyPostcondition, runReconcileArchiveTransaction, assertNormalAdoptGate, assertNormalAdoptPostcondition } from '../src/lib/content/home-adopt-cli.mjs';

const parsedArgs = parseAdoptHomeGenericArgs(process.argv.slice(2));
const { apply, yes, status, help, reconcileIds } = parsedArgs;
if (help) { console.log(`Usage: node scripts/adopt-home-generic-blocks.mjs [--dry-run] [--apply] [--status] [--help]
       node scripts/adopt-home-generic-blocks.mjs --reconcile-extra-ids 101,102 --dry-run
       node scripts/adopt-home-generic-blocks.mjs --reconcile-extra-ids 101,102 --apply --yes

Default is dry-run. Normal apply converts only canonical legacy home blocks in legacy-clean or legacy-with-valid-manual states without publishing or deploying. Reconcile archives only explicit published extra/manual IDs after validation; it never deletes, publishes, deploys, or snapshots.`); process.exit(0); }
const mode = parsedArgs.mode;
const canonicalKeys = [HOME_INTRO_KEY, HOME_SOLUTIONS_KEY, HOME_AI_KEY, HOME_INTEGRATIONS_KEY, HOME_AUDIENCES_KEY];
const parseItems = (value) => { if (Array.isArray(value)) return value; if (!value) return []; return JSON.parse(value); };
const rowView = (b) => ({ id:b.id, block_key:b.block_key, type:b.type, title:b.title, sort_order:b.sort_order, status:b.status, role:b.role });
const classifyRows = classifyHomeContentBlocks;
function assertPreserved(before, after, keys = canonicalKeys) { for (const key of keys) { const b = before.find((r)=>r.block_key === key); const a = after.find((r)=>r.block_key === key); if (!a || a.id !== b.id || a.block_key !== b.block_key || a.type !== b.type || a.sort_order !== b.sort_order) throw new Error(`Postcondition failed for ${key}`); } }
const pool = await createPool();
const conn = await pool.getConnection();
if (reconcileIds.length && apply) { try { const result = await runReconcileArchiveTransaction(conn, { targetIds: reconcileIds, classifyRows }); console.log(JSON.stringify({ applied: true, state: result.state, archived: result.archived }, null, 2)); process.exit(0); } finally { conn.release(); await pool.end(); } }
let inTx = false;
try {
  if (apply) { await conn.beginTransaction(); inTx = true; }
  const lock = apply ? ' FOR UPDATE' : '';
  const [pages] = await conn.query(`SELECT * FROM site_pages WHERE route='/' AND type='home'${lock}`);
  if (pages.length !== 1) throw new Error(`Expected exactly one route=/ type=home page, got ${pages.length}.`);
  const page = pages[0];
  const [blocks] = await conn.query(`SELECT * FROM site_content_blocks WHERE page_id=? ORDER BY sort_order,id${lock}`, [page.id]);
  blocks.forEach((block)=>{ block.items = parseItems(block.items); });
  const current = classifyRows(blocks);
  console.log(JSON.stringify({ mode, pageId: page.id, state: current.state, blockCount: blocks.length, blocks: current.rows.map(rowView) }, null, 2));
  if (reconcileIds.length) {
    const targets = current.rows.filter((b)=>reconcileIds.includes(Number(b.id)));
    const missing = reconcileIds.filter((id)=>!targets.some((b)=>Number(b.id)===id));
    if (missing.length) throw new Error(`Explicit reconcile IDs not found on root home page: ${missing.join(',')}`);
    const invalid = targets.filter((b)=>!((b.role === 'valid manual generic middle' && b.status === 'published') || (b.role === 'manual archived' && b.status === 'archived')));
    if (invalid.length) throw new Error(`Only explicit valid manual generic middle IDs (or already archived repeat IDs) can be reconciled: ${invalid.map((b)=>`id=${b.id} role=${b.role} status=${b.status}`).join('; ')}`);
    console.log(JSON.stringify({ reconcile: { archive: targets.map(rowView), keep: current.rows.filter((b)=>!reconcileIds.includes(Number(b.id))).map(rowView), postcondition: 'explicit IDs archived; all non-target records unchanged; no inserts or deletes' } }, null, 2));
    if (!apply) process.exit(0);
    if (!yes) throw new Error('Refusing reconcile apply without --yes.');
    for (const b of targets.filter((row)=>row.status === 'published')) { const [r] = await conn.execute("UPDATE site_content_blocks SET status='archived' WHERE id=? AND page_id=? AND status='published'", [b.id, page.id]); if (r.affectedRows !== 1) throw new Error(`Archive affected ${r.affectedRows} rows for id=${b.id}`); }
    const [fresh] = await conn.query('SELECT * FROM site_content_blocks WHERE page_id=? ORDER BY sort_order,id FOR UPDATE', [page.id]); fresh.forEach((b)=>{ b.items=parseItems(b.items); });
    const post = classifyRows(fresh);
    assertArchiveOnlyPostcondition(blocks, fresh, reconcileIds);
    assertPreserved(blocks, fresh);
    await conn.commit(); inTx = false; console.log(JSON.stringify({ applied:true, state:post.state, archived:reconcileIds }, null, 2)); process.exit(0);
  }
  if (status || current.state === 'generic-clean') { if (inTx) await conn.rollback(); process.exit(0); }
  assertNormalAdoptGate(pages, current);
  const planned = canonicalKeys.map((key)=>({ before: blocks.find((b)=>b.block_key===key), after: legacyHomeBlockToGenericBlock(blocks.find((b)=>b.block_key===key)) }));
  console.log(JSON.stringify({ planned: planned.map(({ before, after }) => ({ id: before.id, block_key: before.block_key, from: before.type, to: after.type, sort_order: before.sort_order, status: before.status })) }, null, 2));
  if (!apply) process.exit(0);
  for (const { before, after } of planned) { const [r] = await conn.execute('UPDATE site_content_blocks SET type=?, title=?, body=?, items=?, sort_order=?, status=? WHERE id=? AND page_id=? AND block_key=?', [after.type, after.title, after.body ?? null, JSON.stringify(after.items || []), before.sort_order, before.status, before.id, page.id, before.block_key]); if (r.affectedRows !== 1) throw new Error(`Update affected ${r.affectedRows} rows for ${before.block_key}`); }
  const [fresh] = await conn.query('SELECT * FROM site_content_blocks WHERE page_id=? ORDER BY sort_order,id FOR UPDATE', [page.id]); fresh.forEach((b)=>{ b.items=parseItems(b.items); });
  const post = classifyRows(fresh); assertNormalAdoptPostcondition(blocks, fresh, canonicalKeys); if (!['generic-clean','generic-with-valid-manual'].includes(post.state)) throw new Error(`Postcondition state is ${post.state}`); await conn.commit(); inTx = false; console.log(JSON.stringify({ applied:true, state:post.state }, null, 2));
} catch (error) { if (inTx) await conn.rollback(); throw error; }
finally { conn.release(); await pool.end(); }
