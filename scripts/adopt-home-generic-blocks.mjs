#!/usr/bin/env node
import { createPool } from '../src/lib/db/client.mjs';
import { HOME_INTRO_KEY, HOME_SOLUTIONS_KEY, HOME_AI_KEY, HOME_INTEGRATIONS_KEY, HOME_AUDIENCES_KEY, HOME_HERO_META_KEY, legacyHomeBlockToGenericBlock } from '../src/lib/content/home-blocks.mjs';

const args = new Set(process.argv.slice(2));
const help = args.has('--help') || args.has('-h');
const apply = args.has('--apply');
const status = args.has('--status');
if (help) { console.log(`Usage: node scripts/adopt-home-generic-blocks.mjs [--dry-run] [--apply] [--status]\n\nDefault is --dry-run. Converts current route=/ type=home middle canonical blocks to generic block contracts without publishing or deploying; it also does not create snapshots.`); process.exit(0); }
const mode = apply ? 'apply' : status ? 'status' : 'dry-run';
const legacyKeys = [HOME_INTRO_KEY, HOME_SOLUTIONS_KEY, HOME_AI_KEY, HOME_INTEGRATIONS_KEY, HOME_AUDIENCES_KEY];
const expectedTypes = new Map([[HOME_INTRO_KEY,'text'],[HOME_SOLUTIONS_KEY,'cards'],[HOME_AI_KEY,'ai-preview'],[HOME_INTEGRATIONS_KEY,'network-visual'],[HOME_AUDIENCES_KEY,'cards']]);
const genericTypes = new Map([[HOME_INTRO_KEY,'split-text'],[HOME_SOLUTIONS_KEY,'cards'],[HOME_AI_KEY,'ai-assistant-preview'],[HOME_INTEGRATIONS_KEY,'integrations-strip'],[HOME_AUDIENCES_KEY,'cards']]);
const parseItems = (value) => { if (Array.isArray(value)) return value; if (!value) return []; return JSON.parse(value); };
function classify(blocks) {
  const byKey = new Map(blocks.map((b)=>[b.block_key,b]));
  const missing = [HOME_HERO_META_KEY, ...legacyKeys].filter((key)=>!byKey.has(key));
  if (missing.length) return { state: 'unknown', reason: `missing: ${missing.join(', ')}` };
  const legacy = legacyKeys.every((key)=>byKey.get(key).type === expectedTypes.get(key) && !(parseItems(byKey.get(key).items)[0]?.version === 2 && key !== HOME_AI_KEY && key !== HOME_INTEGRATIONS_KEY));
  const generic = legacyKeys.every((key)=>byKey.get(key).type === genericTypes.get(key) && (key !== HOME_INTRO_KEY || parseItems(byKey.get(key).items)[0]?.version === 1));
  if (legacy) return { state: 'legacy' };
  if (generic) return { state: 'generic' };
  return { state: 'partial', reason: legacyKeys.map((key)=>`${key}:${byKey.get(key)?.type}`).join(', ') };
}
function assertPreserved(before, after) {
  for (const key of legacyKeys) {
    const b = before.find((row)=>row.block_key === key);
    const a = after.find((row)=>row.block_key === key);
    if (!a || a.id !== b.id || a.block_key !== b.block_key || a.sort_order !== b.sort_order || a.status !== b.status) throw new Error(`Postcondition failed for ${key}`);
  }
}
const pool = await createPool();
const conn = await pool.getConnection();
let inTx = false;
try {
  if (apply) { await conn.beginTransaction(); inTx = true; }
  const lock = apply ? ' FOR UPDATE' : '';
  const [pages] = await conn.query(`SELECT * FROM site_pages WHERE route='/' AND type='home' LIMIT 1${lock}`);
  const page = pages[0];
  if (!page) throw new Error('No route=/ type=home page found.');
  const [blocks] = await conn.query(`SELECT * FROM site_content_blocks WHERE page_id=? ORDER BY sort_order,id${lock}`, [page.id]);
  blocks.forEach((block)=>{ block.items = parseItems(block.items); });
  const current = classify(blocks);
  console.log(JSON.stringify({ mode, pageId: page.id, state: current.state, blockCount: blocks.length, reason: current.reason || null }, null, 2));
  if (status || current.state === 'generic') { if (inTx) await conn.rollback(); process.exit(0); }
  if (current.state !== 'legacy') throw new Error(`Refusing to adopt non-legacy state: ${current.reason || current.state}`);
  const planned = legacyKeys.map((key)=>({ before: blocks.find((b)=>b.block_key===key), after: legacyHomeBlockToGenericBlock(blocks.find((b)=>b.block_key===key)) }));
  console.log(JSON.stringify({ planned: planned.map(({ before, after }) => ({ id: before.id, block_key: before.block_key, from: before.type, to: after.type, sort_order: before.sort_order, status: before.status })) }, null, 2));
  if (!apply) process.exit(0);
  for (const { before, after } of planned) {
    const [result] = await conn.execute('UPDATE site_content_blocks SET type=?, title=?, body=?, items=?, sort_order=?, status=? WHERE id=? AND page_id=? AND block_key=?', [after.type, after.title, after.body ?? null, JSON.stringify(after.items || []), before.sort_order, before.status, before.id, page.id, before.block_key]);
    if (result.affectedRows !== 1) throw new Error(`Update affected ${result.affectedRows} rows for ${before.block_key}`);
  }
  const [fresh] = await conn.query('SELECT id,block_key,type,sort_order,status,items FROM site_content_blocks WHERE page_id=? ORDER BY sort_order,id FOR UPDATE', [page.id]);
  const post = classify(fresh);
  if (post.state !== 'generic') throw new Error(`Postcondition state is ${post.state}`);
  assertPreserved(blocks, fresh);
  await conn.commit(); inTx = false;
  console.log(JSON.stringify({ applied: true, state: post.state, blocks: fresh.filter((b)=>legacyKeys.includes(b.block_key)).map(({id,block_key,type,sort_order,status})=>({id,block_key,type,sort_order,status})) }, null, 2));
} catch (error) { if (inTx) await conn.rollback(); throw error; }
finally { conn.release(); await pool.end(); }
