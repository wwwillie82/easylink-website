import { fileURLToPath } from 'node:url';
import { createPool } from '../src/lib/db/client.mjs';
import { buildRouteMatchMap, planNavigationBackfillItem } from '../src/lib/content/internal-links.mjs';

const knownFlags = new Set(['--help', '-h', '--apply', '--dry-run']);

export function parseArgs(argv = process.argv.slice(2)) {
  const unknown = argv.filter((arg) => arg.startsWith('-') && !knownFlags.has(arg));
  if (unknown.length) return { ok: false, error: `Ismeretlen kapcsoló: ${unknown.join(', ')}` };
  const help = argv.includes('--help') || argv.includes('-h');
  const apply = argv.includes('--apply');
  const explicitDryRun = argv.includes('--dry-run');
  if (apply && explicitDryRun) return { ok: false, error: 'A --apply és --dry-run kapcsoló együtt nem használható.' };
  return { ok: true, help, apply, dryRun: !apply };
}

export function helpText() {
  return `Usage: node scripts/navigation-target-backfill.mjs [--dry-run | --apply]\n\nDefault mode is dry-run. Use --apply to persist safe legacy navigation target conversions.`;
}

export async function createMysqlNavigationBackfillAdapter(pool) {
  return {
    async listPages() { const [rows] = await pool.query('SELECT id, route, title, status FROM site_pages ORDER BY id'); return rows; },
    async listNavigation() { const [rows] = await pool.query('SELECT * FROM site_navigation_items ORDER BY sort_order,id'); return rows; },
    async applyUpdate(plan) { const original = plan.original || {}; const [result] = await pool.execute('UPDATE site_navigation_items SET target_type=?, target_page_id=?, title_override=? WHERE id=? AND title=? AND href=? AND target_type=? AND target_page_id <=> ? AND title_override <=> ?', [plan.update.target_type, plan.update.target_page_id, plan.update.title_override, plan.id, original.title, original.href, original.target_type || 'legacy', original.target_page_id ?? null, original.title_override ?? null]); return Number(result?.affectedRows || 0); },
  };
}

function emptySummary() { return { page: [], external: [], legacy: [], already_migrated: [], archived_skipped: [], conflict: [], error: [], applied: 0, dryRun: true }; }

export async function planNavigationBackfill(adapter) {
  const pages = await adapter.listPages();
  const nav = await adapter.listNavigation();
  const routeMatches = buildRouteMatchMap(pages);
  const summary = emptySummary();
  for (const item of nav) {
    const plan = planNavigationBackfillItem(item, routeMatches);
    summary[plan.action]?.push(plan);
  }
  return summary;
}

export async function runNavigationBackfill(adapter, { apply = false } = {}) {
  const summary = await planNavigationBackfill(adapter);
  summary.dryRun = !apply;
  if (apply) {
    for (const plan of [...summary.page, ...summary.external]) {
      const affected = await adapter.applyUpdate(plan);
      if (affected > 0) summary.applied += affected;
      else summary.conflict.push({ ...plan, reason: 'A rekord a tervezés óta megváltozott.' });
    }
  }
  return summary;
}

export function formatSummary(summary) {
  const lines = [
    `navigation target backfill: ${summary.dryRun ? 'dry-run' : 'apply'}`,
    `page targetté alakítható: ${summary.page.length}`,
    `external targetté alakítható: ${summary.external.length}`,
    `legacy marad: ${summary.legacy.length}`,
    `már migrált: ${summary.already_migrated.length}`,
    `archivált / kihagyva: ${summary.archived_skipped.length}`,
    `conflict / kihagyva: ${summary.conflict.length}`,
    `hiba: ${summary.error.length}`,
    `alkalmazott módosítás: ${summary.applied}`,
  ];
  for (const item of [...summary.legacy, ...summary.conflict, ...summary.error]) lines.push(`review nav#${item.id}: ${item.reason || 'ismeretlen ok'}`);
  return lines.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = parseArgs();
  if (!args.ok) { console.error(args.error); process.exit(2); }
  if (args.help) { console.log(helpText()); process.exit(0); }
  const pool = await createPool();
  try {
    const adapter = await createMysqlNavigationBackfillAdapter(pool);
    const summary = await runNavigationBackfill(adapter, { apply: args.apply });
    console.log(formatSummary(summary));
  } finally { await pool.end(); }
}
