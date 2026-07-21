const KNOWN = new Set(['--dry-run','--apply','--status','--yes','--help','-h','--reconcile-extra-ids']);
export function parseReconcileIdList(value) {
  if (value === undefined) throw new Error('--reconcile-extra-ids requires a value.');
  if (String(value).trim() === '') throw new Error('--reconcile-extra-ids cannot be empty.');
  const tokens = String(value).split(',');
  const ids = [];
  const seen = new Set();
  for (const token of tokens) {
    if (token.trim() === '') throw new Error('Empty reconcile ID token.');
    if (!/^\d+$/.test(token.trim())) throw new Error(`Invalid reconcile ID: ${token}`);
    const id = Number(token.trim());
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`Invalid reconcile ID: ${token}`);
    if (seen.has(id)) throw new Error(`Duplicate reconcile ID: ${id}`);
    seen.add(id); ids.push(id);
  }
  return ids;
}
export function parseAdoptHomeGenericArgs(argv = []) {
  const args = Array.from(argv);
  let reconcileValue;
  let reconcileSeen = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!KNOWN.has(arg)) throw new Error(`Unknown option: ${arg}`);
    if (arg === '--reconcile-extra-ids') {
      if (reconcileSeen) throw new Error('--reconcile-extra-ids can only be supplied once.');
      reconcileSeen = true;
      reconcileValue = args[i + 1];
      i += 1;
      continue;
    }
  }
  const help = args.includes('--help') || args.includes('-h');
  const apply = args.includes('--apply');
  const yes = args.includes('--yes');
  const status = args.includes('--status');
  const reconcileIds = reconcileSeen ? parseReconcileIdList(reconcileValue) : [];
  if (reconcileSeen && apply && !yes) throw new Error('Reconcile apply requires --apply --yes.');
  return { help, apply, yes, status, reconcile: reconcileSeen, reconcileIds, mode: reconcileSeen ? (apply ? 'reconcile-apply' : 'reconcile-dry-run') : (apply ? 'apply' : status ? 'status' : 'dry-run') };
}
const parseItems = (value) => { if (Array.isArray(value)) return value; if (!value) return []; return JSON.parse(value); };
const comparable = (row = {}) => ({ id: Number(row.id), page_id: Number(row.page_id), block_key: row.block_key || '', type: row.type || '', title: row.title || '', body: row.body ?? null, items: JSON.stringify(parseItems(row.items)), sort_order: Number(row.sort_order ?? 0), status: row.status || '' });
export function assertArchiveOnlyPostcondition(beforeRows = [], afterRows = [], targetIds = []) {
  const targets = new Set(targetIds.map(Number));
  if (beforeRows.length !== afterRows.length) throw new Error('Postcondition failed: row count changed.');
  const afterById = new Map(afterRows.map((row) => [Number(row.id), row]));
  for (const before of beforeRows) {
    const after = afterById.get(Number(before.id));
    if (!after) throw new Error(`Postcondition failed: missing row id=${before.id}.`);
    const b = comparable(before); const a = comparable(after);
    if (targets.has(Number(before.id)) && b.status === 'published') {
      if (a.status !== 'archived') throw new Error(`Postcondition failed: target id=${before.id} was not archived.`);
      b.status = 'archived';
    }
    if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`Postcondition failed: non-status mutation for id=${before.id}.`);
  }
}

export const normalAdoptAllowedStates = Object.freeze(['legacy-clean', 'legacy-with-valid-manual']);
export function assertNormalAdoptGate(pages = [], classification = {}) {
  const problems = [];
  if (pages.length !== 1) problems.push(`expected exactly one route=/ type=home page, got ${pages.length}`);
  if (!classification.hero) problems.push('missing hero-meta');
  if (!normalAdoptAllowedStates.includes(classification.state)) problems.push(`state is ${classification.state}, expected legacy-clean or legacy-with-valid-manual`);
  if (classification.unknown?.length) problems.push(`unknown published blocks: ${classification.unknown.map((b)=>`id=${b.id} ${b.block_key} ${b.type} "${b.title}" sort=${b.sort_order}`).join('; ')}`);
  if (problems.length) throw new Error(`Refusing normal apply. ${problems.join(' | ')}`);
}
export function assertNormalAdoptPostcondition(beforeRows = [], afterRows = [], canonicalKeys = []) {
  if (beforeRows.length !== afterRows.length) throw new Error('Postcondition failed: row count changed.');
  const afterById = new Map(afterRows.map((row) => [Number(row.id), row]));
  for (const before of beforeRows) {
    const after = afterById.get(Number(before.id));
    if (!after) throw new Error(`Postcondition failed: missing row id=${before.id}.`);
    if (!canonicalKeys.includes(before.block_key) && JSON.stringify(comparable(after)) !== JSON.stringify(comparable(before))) throw new Error(`Postcondition failed: non-canonical row changed id=${before.id}.`);
  }
}
export async function runReconcileArchiveTransaction(conn, { targetIds = [], classifyRows }) {
  let inTx = false;
  try {
    await conn.beginTransaction(); inTx = true;
    const [pages] = await conn.query("SELECT * FROM site_pages WHERE route='/' AND type='home' FOR UPDATE");
    if (pages.length !== 1) throw new Error(`Expected exactly one route=/ type=home page, got ${pages.length}.`);
    const page = pages[0];
    const [blocks] = await conn.query('SELECT * FROM site_content_blocks WHERE page_id=? ORDER BY sort_order,id FOR UPDATE', [page.id]);
    blocks.forEach((block) => { block.items = parseItems(block.items); });
    const current = classifyRows(blocks);
    const targets = current.rows.filter((b) => targetIds.includes(Number(b.id)));
    const missing = targetIds.filter((id) => !targets.some((b) => Number(b.id) === id));
    if (missing.length) throw new Error(`Explicit reconcile IDs not found on root home page: ${missing.join(',')}`);
    const invalid = targets.filter((b) => !((b.role === 'valid manual generic middle' && b.status === 'published') || (b.role === 'manual archived' && b.status === 'archived')));
    if (invalid.length) throw new Error(`Only explicit valid manual generic middle IDs (or already archived repeat IDs) can be reconciled: ${invalid.map((b) => `id=${b.id} role=${b.role} status=${b.status}`).join('; ')}`);
    for (const b of targets.filter((row) => row.status === 'published')) {
      const [r] = await conn.execute("UPDATE site_content_blocks SET status='archived' WHERE id=? AND page_id=? AND status='published'", [b.id, page.id]);
      if (r.affectedRows !== 1) throw new Error(`Archive affected ${r.affectedRows} rows for id=${b.id}`);
    }
    const [fresh] = await conn.query('SELECT * FROM site_content_blocks WHERE page_id=? ORDER BY sort_order,id FOR UPDATE', [page.id]);
    fresh.forEach((block) => { block.items = parseItems(block.items); });
    assertArchiveOnlyPostcondition(blocks, fresh, targetIds);
    await conn.commit(); inTx = false;
    return { pageId: page.id, state: classifyRows(fresh).state, archived: targetIds, blocks: fresh };
  } catch (error) { if (inTx) await conn.rollback(); throw error; }
}
