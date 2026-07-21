#!/usr/bin/env node
import { createPool } from '../src/lib/db/client.mjs';
import { homeMiddleContentBlocks } from '../src/lib/content/home-blocks.mjs';
import { isRecognizedPageCta, pageCtaRole } from '../src/lib/content/page-cta-contract.mjs';

export const RESTORE_IDS = Object.freeze([139, 140, 141, 142, 143]);
export const RESTORE_CONTRACT = Object.freeze(new Map([[139, { block_key: 'home:intro', type: 'split-text' }], [140, { block_key: 'home:solutions', type: 'cards' }], [141, { block_key: 'home:ai-assistant', type: 'ai-assistant-preview' }], [142, { block_key: 'home:integrations', type: 'integrations-strip' }], [143, { block_key: 'home:audiences', type: 'cards' }]]));
export const ARCHIVE_IDS = Object.freeze([1, 27, 28, 29]);
export const PROTECTED_CTA_ID = 30;
export const HERO_META_KEY = 'home:hero-meta';

export function parseCli(argv = process.argv.slice(2)) {
  const known = new Set(['--status', '--dry-run', '--apply', '--yes', '--help']);
  const unknown = argv.filter((arg) => !known.has(arg));
  if (unknown.length) throw new Error(`Unknown option: ${unknown.join(', ')}`);
  if (argv.includes('--help')) return { help: true };
  const actions = ['--status', '--dry-run', '--apply'].filter((arg) => argv.includes(arg));
  if (actions.length !== 1) throw new Error('Exactly one action is required: --status, --dry-run, or --apply --yes.');
  if (argv.includes('--yes') && !argv.includes('--apply')) throw new Error('--yes is only valid with --apply.');
  if (argv.includes('--apply') && !argv.includes('--yes')) throw new Error('--apply requires --yes.');
  return { action: actions[0].slice(2), apply: argv.includes('--apply') };
}

function usage() { return `Usage: node scripts/restore-home-good-blocks.mjs (--status | --dry-run | --apply --yes)\n\nRestores the proven good root home blocks without inserts or deletes.`; }
const clone = (value) => JSON.parse(JSON.stringify(value));
const stable = (row) => JSON.stringify(row, Object.keys(row).sort());
const stableRows = (rows) => JSON.stringify(rows.map((row) => JSON.parse(stable(row))));
const byId = (rows) => new Map(rows.map((row) => [Number(row.id), clone(row)]));
function withoutManaged(row) { const next = clone(row); delete next.updated_at; return next; }
function sameRecord(a, b) { return stable(a) === stable(b); }
function assertOne(label, rows) { if (rows.length !== 1) throw new Error(`${label}: expected exactly one row, found ${rows.length}.`); return rows[0]; }
function assertAffected(result, label) { if (Number(result?.affectedRows) !== 1) throw new Error(`${label}: affectedRows must be 1, got ${result?.affectedRows ?? 'n/a'}.`); }

function validatePre(page, rows) {
  if (!page || page.route !== '/' || page.type !== 'home') throw new Error("Script may only run for route='/' AND type='home'.");
  const rowsById = byId(rows);
  for (const id of RESTORE_IDS) {
    const row = rowsById.get(id);
    if (!row || row.page_id !== page.id || row.block_key !== RESTORE_CONTRACT.get(id).block_key || row.type !== RESTORE_CONTRACT.get(id).type) throw new Error(`Missing restore block id=${id} block_key=${RESTORE_CONTRACT.get(id).block_key} type=${RESTORE_CONTRACT.get(id).type} on root home.`);
  }
  for (const id of ARCHIVE_IDS) {
    const row = rowsById.get(id);
    if (!row || row.page_id !== page.id) throw new Error(`Missing archive block id=${id} on root home.`);
  }
  const cta = rowsById.get(PROTECTED_CTA_ID);
  if (!cta || cta.page_id !== page.id || !isRecognizedPageCta(cta)) throw new Error('Protected CTA id=30 is not a recognized page CTA on root home.');
  const activeCtas = rows.filter((row) => row.status !== 'archived' && isRecognizedPageCta(row));
  if (activeCtas.length !== 1 || Number(activeCtas[0].id) !== PROTECTED_CTA_ID) throw new Error(`Expected exactly one active recognized page CTA, id=30; found ${activeCtas.map((row) => `${row.id}:${row.block_key}:${pageCtaRole(row) || ''}`).join(', ') || 'none'}.`);
  const hero = rows.filter((row) => row.block_key === HERO_META_KEY);
  assertOne('hero-meta', hero);
  return { rowsById, cta: clone(cta), ctaRole: pageCtaRole(cta) || '', hero: clone(hero[0]) };
}

function assertPlannedMiddle(page, rows, label = 'planned') {
  const middle = homeMiddleContentBlocks({ page: { ...page, blocks: rows }, routeIndex: { pages: [] } });
  const ids = middle.map((row) => Number(row.id));
  const expected = RESTORE_IDS;
  if (JSON.stringify(ids) !== JSON.stringify(expected)) {
    const extras = middle.filter((row) => !expected.includes(Number(row.id))).map((row) => ({ id: row.id, block_key: row.block_key, type: row.type, title: row.title, status: row.status, sort_order: row.sort_order }));
    if (extras.length) console.error(`${label} unexpected published generic home middle blocks:`, JSON.stringify(extras, null, 2));
    throw new Error(`${label} published middle IDs must be [${expected.join(', ')}], got [${ids.join(', ')}].`);
  }
}
function plannedRows(rows) {
  return rows.map((row) => ({ ...clone(row), status: RESTORE_IDS.includes(Number(row.id)) ? 'published' : (ARCHIVE_IDS.includes(Number(row.id)) ? 'archived' : row.status) }));
}
function assertPost(page, beforeRows, afterRows, { cta, hero }) {
  if (afterRows.length !== beforeRows.length) throw new Error('Postcondition failed: record count changed.');
  const before = byId(beforeRows), after = byId(afterRows);
  if (before.size !== after.size) throw new Error('Postcondition failed: ID set changed.');
  for (const id of before.keys()) if (!after.has(id)) throw new Error(`Postcondition failed: missing id=${id}.`);
  for (const id of RESTORE_IDS) if (after.get(id).status !== 'published') throw new Error(`Postcondition failed: id=${id} is not published.`);
  for (const id of ARCHIVE_IDS) if (after.get(id).status !== 'archived') throw new Error(`Postcondition failed: id=${id} is not archived.`);
  assertPlannedMiddle(page, afterRows, 'postcondition');
  if (!sameRecord(after.get(PROTECTED_CTA_ID), cta)) throw new Error('Postcondition failed: CTA id=30 changed.');
  const afterHero = assertOne('post hero-meta', afterRows.filter((row) => row.block_key === HERO_META_KEY));
  if (!sameRecord(afterHero, hero)) throw new Error('Postcondition failed: hero-meta changed.');
  const touched = new Set([...RESTORE_IDS, ...ARCHIVE_IDS]);
  for (const [id, pre] of before) {
    if (touched.has(id)) {
      const preComparable = withoutManaged(pre), postComparable = withoutManaged(after.get(id));
      postComparable.status = preComparable.status;
      if (!sameRecord(postComparable, preComparable)) throw new Error(`Postcondition failed: id=${id} changed outside status/updated_at.`);
    } else if (!sameRecord(after.get(id), pre)) throw new Error(`Postcondition failed: unexpected change on id=${id}.`);
  }
}

function plan(rows) {
  const map = byId(rows);
  const restore = RESTORE_IDS.filter((id) => map.get(id)?.status !== 'published');
  const archive = ARCHIVE_IDS.filter((id) => map.get(id)?.status !== 'archived');
  return { restore, archive, noOp: restore.length === 0 && archive.length === 0 };
}
function classification(row) {
  const id = Number(row.id);
  if (RESTORE_IDS.includes(id)) return 'restore-middle';
  if (ARCHIVE_IDS.includes(id)) return 'archive-duplicate';
  if (id === PROTECTED_CTA_ID && isRecognizedPageCta(row)) return 'protected-cta';
  if (row.block_key === HERO_META_KEY) return 'protected-hero-meta';
  return 'unchanged-other';
}
function printSummary(action, p, cta, ctaRole, hero, rows, planned) {
  console.log(`action: ${action}`);
  console.log(`restore list: ${RESTORE_IDS.join(', ')}`);
  console.log(`archive list: ${ARCHIVE_IDS.join(', ')}`);
  console.log(`protected CTA: ${PROTECTED_CTA_ID} (${cta.block_key}) role=${ctaRole}`);
  console.log(`protected hero-meta: ${hero.id} (${hero.block_key})`);
  console.log(`noOp: ${p.noOp}`);
  console.log(`pending restore: ${p.restore.join(', ') || '-'}`);
  console.log(`pending archive: ${p.archive.join(', ') || '-'}`);
  console.log(`planned published middle IDs: ${homeMiddleContentBlocks({ page: { blocks: planned }, routeIndex: { pages: [] } }).map((row) => row.id).join(', ')}`);
  console.log(`recognized CTA: id=${cta.id} key=${cta.block_key} role=${ctaRole}`);
  console.log(`hero-meta: id=${hero.id} key=${hero.block_key}`);
  console.table(rows.map((row) => ({ id: row.id, block_key: row.block_key, type: row.type, title: row.title, current_status: row.status, planned_status: planned.find((p) => Number(p.id) === Number(row.id))?.status || row.status, sort_order: row.sort_order, classification: classification(row) })));
}


export async function runRestore(conn, action) {
  await conn.beginTransaction();
  try {
    const [pages] = await conn.query("SELECT * FROM site_pages WHERE route='/' AND type='home' LIMIT 2 FOR UPDATE");
    const page = assertOne('root home page', pages);
    const [beforeRows] = await conn.query('SELECT * FROM site_content_blocks WHERE page_id=? ORDER BY id FOR UPDATE', [page.id]);
    const pre = clone(beforeRows);
    const guards = validatePre(page, beforeRows);
    const planned = plannedRows(beforeRows);
    assertPlannedMiddle(page, planned, 'planned');
    const p = plan(beforeRows);
    printSummary(action, p, guards.cta, guards.ctaRole, guards.hero, beforeRows, planned);
    if (action === 'apply') {
      for (const id of RESTORE_IDS) if (guards.rowsById.get(id).status !== 'published') assertAffected((await conn.execute('UPDATE site_content_blocks SET status=? WHERE id=? AND page_id=?', ['published', id, page.id]))[0], `publish id=${id}`);
      for (const id of ARCHIVE_IDS) if (guards.rowsById.get(id).status !== 'archived') assertAffected((await conn.execute('UPDATE site_content_blocks SET status=? WHERE id=? AND page_id=?', ['archived', id, page.id]))[0], `archive id=${id}`);
    }
    const [afterRows] = await conn.query('SELECT * FROM site_content_blocks WHERE page_id=? ORDER BY id FOR UPDATE', [page.id]);
    if (action === 'apply') assertPost(page, pre, afterRows, guards);
    else if (stableRows(afterRows) !== stableRows(pre)) throw new Error(`${action} unexpectedly changed selected rows.`);
    if (action === 'apply') await conn.commit(); else await conn.rollback();
  } catch (error) { await conn.rollback(); throw error; }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let cli;
  try { cli = parseCli(); if (cli.help) { console.log(usage()); process.exit(0); } }
  catch (error) { console.error(error.message); console.error(usage()); process.exit(2); }
  const pool = await createPool();
  const conn = await pool.getConnection();
  try { await runRestore(conn, cli.action); }
  finally { conn.release(); await pool.end(); }
}
