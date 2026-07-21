#!/usr/bin/env node
import { createPool } from '../src/lib/db/client.mjs';

export const RESTORE_TEXTS = Object.freeze({
  'Pénzügy és számlázás': 'Számlák, fizetési státuszok és pénzügyi teendők egy átlátható vezetői nézetben.',
  'HR és Munkaügy': 'Csapatadatok, munkaügyi dokumentumok és adminisztratív teendők rendezettebb kezelése.',
  'CRM és ügyfélkezelés': 'Ügyfelek, előzmények, dokumentumok és következő lépések tiszta üzleti nézetben.'
});
const BLOCK_ID = 140;
const BLOCK_KEY = 'home:solutions';
const BLOCK_TYPE = 'cards';

function help() { return `Usage: node scripts/restore-home-solutions-card-texts.mjs --status|--dry-run|--apply --yes\n\nRestores missing text_override values for block id=140 (root home home:solutions cards block).\n`; }
export function parseArgs(argv = process.argv.slice(2)) {
  const known = new Set(['--status', '--dry-run', '--apply', '--yes', '--help']);
  const unknown = argv.filter((arg) => !known.has(arg));
  if (unknown.length) throw new Error(`Unknown option: ${unknown.join(', ')}`);
  if (argv.includes('--help')) return { help: true };
  if (argv.includes('--yes') && !argv.includes('--apply')) throw new Error('--yes is only valid with --apply.');
  const modes = ['--status', '--dry-run', '--apply'].filter((arg) => argv.includes(arg));
  if (modes.length !== 1) throw new Error('Choose exactly one mode: --status, --dry-run, or --apply --yes.');
  if (argv.includes('--apply') && !argv.includes('--yes')) throw new Error('--apply requires --yes.');
  return { mode: modes[0].slice(2), apply: argv.includes('--apply') };
}
const parseItems = (value) => typeof value === 'string' ? JSON.parse(value || '[]') : structuredClone(value || []);
const titleOf = (card) => String((String(card?.title_override ?? '').trim() ? card.title_override : '') || card?.title || '').trim();
const textOf = (card) => String((String(card?.text_override ?? '').trim() ? card.text_override : '') || card?.text || '').trim();
function getV2(items) { return items.find((item) => item?.version === 2 && Array.isArray(item.cards)); }
export function planRestore(block, rootHomePage) {
  if (!rootHomePage || rootHomePage.route !== '/' || rootHomePage.type !== 'home') throw new Error('Refusing to run without the root home page (route=/, type=home).');
  if (!block || Number(block.id) !== BLOCK_ID || Number(block.page_id) !== Number(rootHomePage.id) || block.block_key !== BLOCK_KEY || block.type !== BLOCK_TYPE) throw new Error('Refusing to handle a block outside block id=140 root home home:solutions cards scope.');
  const items = parseItems(block.items);
  const v2 = getV2(items);
  if (!v2) throw new Error('Expected cards V2 contract.');
  const wanted = Object.keys(RESTORE_TEXTS);
  const matches = v2.cards.filter((card) => wanted.includes(titleOf(card)));
  if (matches.length !== 3) throw new Error(`Expected exactly three matching cards, found ${matches.length}.`);
  const seen = new Set();
  for (const card of matches) { const title = titleOf(card); if (seen.has(title)) throw new Error(`Duplicate card title: ${title}`); seen.add(title); }
  for (const title of wanted) if (!seen.has(title)) throw new Error(`Missing card title: ${title}`);
  let changes = 0;
  const nextItems = items.map((item) => item === v2 ? { ...item, cards: item.cards.map((card) => {
    const title = titleOf(card); if (!wanted.includes(title) || textOf(card)) return card;
    changes += 1; return { ...card, text_override: RESTORE_TEXTS[title] };
  }) } : item);
  return { changes, noOp: changes === 0, items, nextItems, expected: RESTORE_TEXTS };
}
async function fetchRootHomePage(db) {
  const [rows] = await db.query("SELECT id, route, type FROM site_pages WHERE route='/' AND type='home' LIMIT 1");
  if (rows.length !== 1) throw new Error(`Expected one root home page (route=/, type=home), found ${rows.length}.`);
  return rows[0];
}
async function fetchBlock(db, rootHomePage) {
  const [rows] = await db.query('SELECT * FROM site_content_blocks WHERE id=? AND page_id=? AND block_key=? AND type=? FOR UPDATE', [BLOCK_ID, rootHomePage.id, BLOCK_KEY, BLOCK_TYPE]);
  if (rows.length !== 1) throw new Error(`Expected one scoped block id=140 home:solutions cards record, found ${rows.length}.`);
  return rows[0];
}
function assertVerified(block, rootHomePage) {
  const verify = planRestore(block, rootHomePage);
  if (verify.changes !== 0) throw new Error('Post-apply verification failed: restored text is still missing.');
  return verify;
}
export async function runRestore(db, { apply = false, mode = apply ? 'apply' : 'dry-run' } = {}) {
  await db.beginTransaction?.();
  try {
    const rootHomePage = await fetchRootHomePage(db);
    const block = await fetchBlock(db, rootHomePage);
    const plan = planRestore(block, rootHomePage);
    if (apply && !plan.noOp) {
      const [result] = await db.execute('UPDATE site_content_blocks SET items=? WHERE id=? AND page_id=? AND block_key=? AND type=?', [JSON.stringify(plan.nextItems), BLOCK_ID, rootHomePage.id, BLOCK_KEY, BLOCK_TYPE]);
      if (Number(result?.affectedRows) !== 1) throw new Error(`Expected affectedRows=1 for block id=140 update, got ${result?.affectedRows ?? 'n/a'}.`);
    }
    const after = apply ? await fetchBlock(db, rootHomePage) : { ...block, items: JSON.stringify(plan.nextItems) };
    assertVerified(after, rootHomePage);
    if (apply) await db.commit?.(); else await db.rollback?.();
    return { ok: true, mode, changes: plan.changes, noOp: plan.noOp, blockId: BLOCK_ID, pageId: Number(rootHomePage.id), titles: Object.keys(RESTORE_TEXTS) };
  } catch (error) { await db.rollback?.(); throw error; }
}
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs();
    if (args.help) { console.log(help()); process.exit(0); }
    const pool = await createPool(); const conn = await pool.getConnection();
    try { console.log(JSON.stringify(await runRestore(conn, { apply: args.apply, mode: args.mode }), null, 2)); }
    finally { conn.release(); await pool.end(); }
  } catch (error) { console.error(error.message); process.exit(1); }
}
