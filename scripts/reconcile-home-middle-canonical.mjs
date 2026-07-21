#!/usr/bin/env node
import { createPool } from '../src/lib/db/client.mjs';
import { assertRootHomePage } from '../src/lib/content/root-invariant.mjs';

export const RECONCILE_HOME_MIDDLE_KEYS = Object.freeze(['home:intro', 'home:solutions', 'home:ai-assistant', 'home:integrations', 'home:audiences']);
const SOLUTIONS_KEY = 'home:solutions';
const HERO_META_KEY = 'home:hero-meta';

function parseCli(argv = process.argv.slice(2)) {
  const known = new Set(['--status', '--dry-run', '--apply', '--yes', '--help']);
  const unknown = argv.filter((arg) => !known.has(arg));
  if (unknown.length) throw new Error(`Ismeretlen option: ${unknown.join(', ')}`);
  if (argv.includes('--help')) return { help: true };
  if (argv.includes('--yes') && !argv.includes('--apply')) throw new Error('--yes kizárólag --apply mellett használható.');
  const actions = ['--status', '--dry-run', '--apply'].filter((arg) => argv.includes(arg));
  if (actions.length !== 1) throw new Error('Pontosan egy action szükséges: --status, --dry-run vagy --apply --yes.');
  if (argv.includes('--apply') && !argv.includes('--yes')) throw new Error('--apply csak explicit --yes mellett futtatható.');
  return { action: actions[0].slice(2), apply: argv.includes('--apply') };
}

const parseItems = (value) => typeof value === 'string' && value.trim() ? JSON.parse(value) : (Array.isArray(value) ? structuredClone(value) : []);
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function normalizeActionContract(action = {}, { legacy = false } = {}) {
  const label = String(action.label || action.title_override || action.title || '').trim();
  const href = String(action.href || action.url || '').trim();
  const pageId = action.target_page_id == null || action.target_page_id === '' ? undefined : Number(action.target_page_id);
  const targetType = action.target_type || (legacy ? 'legacy' : '');
  if (!label) return null;
  if (targetType === 'page') { if (!Number.isSafeInteger(pageId) || pageId <= 0) return null; return { target_type: 'page', target_page_id: pageId, label }; }
  if (targetType === 'legacy' && href.startsWith('/') && !href.startsWith('//')) return { target_type: 'legacy', href, label };
  if (targetType === 'external') { try { const url = new URL(href); if (url.protocol === 'http:' || url.protocol === 'https:') return { target_type: 'external', href, label }; } catch {} }
  return null;
}
function toLegacyCopiedAction(action) {
  if (action.target_type === 'page') return { kind: 'section-action', target_type: 'page', target_page_id: action.target_page_id, title_override: action.label };
  return { kind: 'section-action', target_type: action.target_type, href: action.href, title: action.label };
}
const actionComparable = (action) => JSON.stringify(action, ['target_type', 'target_page_id', 'href', 'label']);
function extractValidSectionAction(items = []) {
  const v2Item = items.find((item) => item?.version === 2 && Array.isArray(item?.cards));
  const flatActions = items.filter((item) => item?.kind === 'section-action');
  if (flatActions.length > 1) throw new Error('Több legacy flat section-action van a canonical home:solutions blokkban.');
  const v2Disabled = v2Item?.action?.enabled === false;
  const v2Action = v2Item && !v2Disabled ? normalizeActionContract(v2Item.action || {}) : null;
  const flatAction = flatActions.length === 1 ? normalizeActionContract(flatActions[0], { legacy: true }) : null;
  if (v2Item && flatActions.length === 1 && v2Action && flatAction) {
    if (actionComparable(v2Action) !== actionComparable(flatAction)) throw new Error('A cards V2 és legacy flat section-action konfliktusos a canonical home:solutions blokkban.');
    return { format: 'cards-v2', action: v2Action };
  }
  if (v2Item && flatActions.length === 1 && (v2Disabled || !v2Action) && flatAction) throw new Error('A cards V2 és legacy flat section-action konfliktusos a canonical home:solutions blokkban.');
  if (v2Action) return { format: 'cards-v2', action: v2Action };
  if (flatAction) return { format: 'legacy-flat', action: flatAction };
  const reasons = [];
  if (v2Item) reasons.push('cards V2 action hiányzik vagy tiltott');
  if (flatActions.length === 0) reasons.push('legacy flat action hiányzik');
  throw new Error(`A canonical home:solutions blokkban nincs valid másolható section-action (${reasons.join('; ')}).`);
}
function hasSectionAction(items = []) { return items.some((item) => item?.kind === 'section-action') || items.some((item) => item?.version === 2 && item?.action && item.action.enabled !== false); }
function validCopiedAction(action) { const normalized = normalizeActionContract(action, { legacy: action?.kind === 'section-action' }); return normalized ? toLegacyCopiedAction(normalized) : null; }
function copyActionToManualItems(items, action) {
  if (hasSectionAction(items)) return items;
  const copied = toLegacyCopiedAction(action);
  if (items[0]?.version === 2 && Array.isArray(items[0]?.cards)) return [{ ...items[0], action: { target_type: action.target_type, target_page_id: action.target_page_id, href: action.href || '', label: action.label } }, ...items.slice(1)];
  return [...items, copied];
}
function assertOne(name, rows) { if (rows.length !== 1) throw new Error(`${name} pontosan egy rekordot igényel, talált: ${rows.length}.`); return rows[0]; }
function assertAffected(result, label) { if (Number(result?.affectedRows) !== 1) throw new Error(`${label}: affectedRows != 1 (${result?.affectedRows ?? 'n/a'}).`); }

const stableRecord = (row) => JSON.stringify(row, Object.keys(row || {}).sort());
function recordsById(rows = []) { return new Map(rows.map((row) => [Number(row.id), structuredClone(row)])); }
function assertPostcondition({ beforeRows, afterRows, canonicalRows, manualId }) {
  if (afterRows.length !== beforeRows.length) throw new Error('Postcondition failed: rekordszám változott.');
  const before = recordsById(beforeRows);
  const after = recordsById(afterRows);
  if (before.size !== after.size) throw new Error('Postcondition failed: duplikált vagy eltérő rekord ID halmaz.');
  for (const id of before.keys()) if (!after.has(id)) throw new Error(`Postcondition failed: hiányzó rekord id=${id}.`);
  const targetIds = new Set(canonicalRows.map((row) => Number(row.id)));
  for (const [id, pre] of before.entries()) {
    const post = after.get(id);
    if (id === Number(manualId)) {
      const a = { ...pre, items: post.items, updated_at: post.updated_at };
      if (stableRecord(a) !== stableRecord(post)) throw new Error('Postcondition failed: manual Megoldásaink blokknál nem csak items/updated_at változott.');
      continue;
    }
    if (targetIds.has(id)) {
      const a = { ...pre, status: post.status, updated_at: post.updated_at };
      if (stableRecord(a) !== stableRecord(post)) throw new Error(`Postcondition failed: target rekordnál nem csak status/updated_at változott: id=${id}.`);
      if (post.status !== 'archived') throw new Error(`Postcondition failed: target rekord nem archived: id=${id}.`);
      continue;
    }
    if (stableRecord(pre) !== stableRecord(post)) throw new Error(`Postcondition failed: nem target rekord változott: id=${id}.`);
  }
  for (const key of RECONCILE_HOME_MIDDLE_KEYS) assertOne(key, afterRows.filter((row) => row.block_key === key));
}

export async function reconcileHomeMiddleCanonicalTransaction(conn, { apply = false } = {}) {
  await conn.beginTransaction();
  try {
    const [[home]] = await conn.query("SELECT * FROM site_pages WHERE route='/' AND type='home' LIMIT 1 FOR UPDATE");
    assertRootHomePage(home, 'Home middle canonical reconcile');
    const [allBlocks] = await conn.query('SELECT * FROM site_content_blocks WHERE page_id=? ORDER BY sort_order,id FOR UPDATE', [home.id]);
    const beforeRows = structuredClone(allBlocks);
    const canonicalRows = RECONCILE_HOME_MIDDLE_KEYS.map((key) => assertOne(key, allBlocks.filter((row) => row.block_key === key)));
    const manualSolutions = allBlocks.filter((row) => row.status !== 'archived' && row.block_key !== HERO_META_KEY && !RECONCILE_HOME_MIDDLE_KEYS.includes(row.block_key) && ['cards','card-grid'].includes(row.type) && String(row.title || '').trim() === 'Megoldásaink');
    const manual = assertOne('manual Megoldásaink cards blokk', manualSolutions);
    const source = extractValidSectionAction(parseItems(assertOne(SOLUTIONS_KEY, canonicalRows.filter((row) => row.block_key === SOLUTIONS_KEY)).items));
    const sourceAction = source.action;
    const beforeItems = parseItems(manual.items);
    const afterItems = sourceAction ? copyActionToManualItems(beforeItems, sourceAction) : beforeItems;
    const updateManual = !sameJson(beforeItems, afterItems);
    const archiveTargets = canonicalRows.filter((row) => row.status !== 'archived');
    const plan = { apply, home: { id: home.id, route: home.route, type: home.type }, totalBlocks: allBlocks.length, manualSolutions: { id: manual.id, block_key: manual.block_key, willUpdateItems: updateManual }, sourceAction: { format: source.format, label: sourceAction.label, target_type: sourceAction.target_type, target_page_id: sourceAction.target_page_id, href: sourceAction.href }, archive: canonicalRows.map((row) => ({ id: row.id, block_key: row.block_key, status: row.status, willArchive: row.status !== 'archived' })), noOp: !updateManual && archiveTargets.length === 0 };
    if (apply) {
      if (updateManual) assertAffected((await conn.execute('UPDATE site_content_blocks SET items=? WHERE id=? AND page_id=?', [JSON.stringify(afterItems), manual.id, home.id]))[0], 'manual Megoldásaink items update');
      for (const row of archiveTargets) assertAffected((await conn.execute('UPDATE site_content_blocks SET status=? WHERE id=? AND page_id=? AND block_key=?', ['archived', row.id, home.id, row.block_key]))[0], `archive ${row.block_key}`);
      const [freshRows] = await conn.query('SELECT * FROM site_content_blocks WHERE page_id=? ORDER BY sort_order,id FOR UPDATE', [home.id]);
      assertPostcondition({ beforeRows, afterRows: freshRows, canonicalRows, manualId: manual.id });
      await conn.commit();
    } else await conn.rollback();
    return plan;
  } catch (error) { try { await conn.rollback(); } catch {} throw error; }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const opts = parseCli();
    if (opts.help) { console.log('Usage: node scripts/reconcile-home-middle-canonical.mjs (--status|--dry-run|--apply --yes)'); process.exit(0); }
    const pool = await createPool(); const conn = await pool.getConnection();
    try { console.log(JSON.stringify(await reconcileHomeMiddleCanonicalTransaction(conn, { apply: opts.apply }), null, 2)); }
    finally { conn.release(); await pool.end(); }
  } catch (error) { console.error(error.message || error); process.exit(1); }
}
export { parseCli, parseItems, hasSectionAction, validCopiedAction, extractValidSectionAction, assertPostcondition };
