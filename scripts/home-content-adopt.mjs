#!/usr/bin/env node
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { createPool } from '../src/lib/db/client.mjs';
import { HOME_AI_KEY, HOME_AUDIENCES_KEY, HOME_HERO_META_KEY, HOME_INTEGRATIONS_KEY, HOME_INTRO_KEY, HOME_LEGACY_CTA_KEY, HOME_SOLUTIONS_KEY, homeIntroText, validateInitialHomeAdoptBlocks } from '../src/lib/content/home-blocks.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clone = (value) => JSON.parse(JSON.stringify(value));

export function parseArgs(argv = process.argv.slice(2)) {
  const args = { apply: false, yes: false, json: false, help: false };
  for (const arg of argv) {
    if (arg === '--apply') args.apply = true;
    else if (arg === '--yes') args.yes = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--dry-run') args.apply = false;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (args.apply && !args.yes) throw new Error('--apply requires --yes. Refusing to modify DB.');
  return args;
}

export function helpText() { return `Usage: node scripts/home-content-adopt.mjs [--dry-run] [--apply --yes] [--json]\n\nMigrates the current home hardcoded content into canonical PR-A4 home blocks. Dry-run is default. Apply does not publish or deploy.`; }

async function loadTsExport(relativePath, exportName) {
  const file = path.join(ROOT, relativePath);
  const source = await readFile(file, 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false } }).outputText;
  const mod = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  return mod[exportName];
}

function pageByRoute(pages, route) { return pages.find((page) => page.route === route); }
function publishedSolutionsIndexPage(pages) {
  const matches = pages.filter((page) => page.type === 'solutions_index' && page.status === 'published');
  if (matches.length === 0) throw new Error('Missing required published page for home adopt: exactly one published solutions_index');
  if (matches.length > 1) throw new Error(`Ambiguous published solutions_index pages for home adopt: ${matches.map((page) => page.id).join(',')}`);
  return matches[0];
}
function detailPage(pages, type, slug) { return pages.find((page) => page.type === type && page.slug === slug && page.status === 'published'); }
function requirePage(page, label) { if (!page?.id) throw new Error(`Missing required published page for home adopt: ${label}`); return page; }

export async function buildHomeCanonicalBlocks(pages) {
  const [solutions, audiences] = await Promise.all([loadTsExport('src/content/solutions.ts', 'solutions'), loadTsExport('src/content/audiences.ts', 'audiences')]);
  const publishedSolutions = solutions.filter((item) => item.status === 'published').sort((a, b) => a.order - b.order);
  const publishedAudiences = audiences.filter((item) => item.status === 'published').sort((a, b) => a.order - b.order);
  const solutionsIndex = publishedSolutionsIndexPage(pages);
  const blocks = [
    { block_key: HOME_HERO_META_KEY, type: 'hero-meta', title: 'Cégvezetés, könnyedén.', body: '', items: [
      { title: 'Átlátható működés', text: 'Valós idejű adatok, tiszta kép.' },
      { title: 'Időmegtakarítás', text: 'Automatizált folyamatok, kevesebb manuális munka.' },
      { title: 'Biztonság & megbízhatóság', text: 'Magyarországi háttér, stabil rendszer.' },
    ], sort_order: 0, status: 'published' },
    { block_key: HOME_INTRO_KEY, type: 'text', title: 'Public site előkészítés', body: homeIntroText, items: [{ heading: 'Nem még egy táblázat, hanem egy átlátható vezetői felület.' }], sort_order: 10, status: 'published' },
    { block_key: HOME_SOLUTIONS_KEY, type: 'cards', title: 'Megoldásaink', body: 'Egy rendszer a napi működés kulcspontjaira.', items: [
      ...publishedSolutions.slice(0, 3).map((item) => { const page = requirePage(detailPage(pages, 'solution_detail', item.slug), `solution_detail:${item.slug}`); return { kind: 'card', target_type: 'page', target_page_id: page.id, title_override: null, text_override: item.shortDescription, linkLabel: 'Részletek →', badge: item.order }; }),
      { kind: 'section-action', target_type: 'page', target_page_id: solutionsIndex.id, title_override: 'Összes megoldás' },
    ], sort_order: 20, status: 'published' },
    { block_key: HOME_AI_KEY, type: 'ai-preview', title: 'AI asszisztens', body: 'Az AI blokk a háttérben látható adatáramlásra épít: pénzügy, CRM és adminisztráció adatai vezetői szintű válaszokká rendeződhetnek.', items: [
      { kind: 'heading', text: 'Kérdezz, és a rendszered válaszol.' },
      { kind: 'source', title: 'NAV' }, { kind: 'source', title: 'CRM' }, { kind: 'source', title: 'Banki státusz' }, { kind: 'source', title: 'Admin' },
      { kind: 'message', role: 'user', text: 'Mely ügyek igényelnek vezetői figyelmet ezen a héten?' },
      { kind: 'message', role: 'assistant', title: 'Javaslat', text: '3 pénzügyi és 2 adminisztratív pontnál érdemes utánkövetést előkészíteni.' },
    ], sort_order: 30, status: 'published' },
    { block_key: HOME_INTEGRATIONS_KEY, type: 'network-visual', title: 'Integrációs adatáramlás', body: 'A blokk nem kész runtime integrációkat állít, hanem a későbbi adatkapcsolatok üzleti térképét mutatja.', items: [
      { kind: 'heading', text: 'Kapcsolódási irányok csomópontokként.' },
      { kind: 'node', id: 'nav-online-szamla', label: 'NAV Online Számla' },
      { kind: 'node', id: 'magyar-bankok-psd2-aggreg8', label: 'Magyar bankok / PSD2 / Aggreg8' },
      { kind: 'node', id: 'hostware', label: 'Hostware' },
      { kind: 'node', id: 'szamlazz-hu', label: 'Számlázz.hu' },
      { kind: 'node', id: 'billingo', label: 'Billingo' },
      { kind: 'node', id: 'cegjelzo', label: 'Cégjelző' },
    ], sort_order: 40, status: 'published' },
    { block_key: HOME_AUDIENCES_KEY, type: 'cards', title: 'Kinek szól?', body: 'Hoteleknek, vendéglátóhelyeknek és szolgáltató vállalkozásoknak.', items: publishedAudiences.map((item) => { const page = requirePage(detailPage(pages, 'audience_detail', item.slug), `audience_detail:${item.slug}`); return { kind: 'card', target_type: 'page', target_page_id: page.id, title_override: null, text_override: item.shortDescription, linkLabel: 'Részletek →', badge: item.order }; }), sort_order: 50, status: 'published' },
  ];
  const errors = validateInitialHomeAdoptBlocks(blocks, { pages });
  if (errors.length) throw new Error(`Generated home adopt manifest invalid: ${JSON.stringify(errors)}`);
  return blocks;
}

const canonical = (value) => JSON.stringify(value ?? null);
const parseItems = (items) => {
  if (Array.isArray(items)) return items;
  if (typeof items === 'string' && items.trim()) return JSON.parse(items);
  return [];
};
function sameBlock(block, target) { return block.type === target.type && block.title === target.title && String(block.body ?? '') === String(target.body ?? '') && canonical(parseItems(block.items)) === canonical(target.items) && Number(block.sort_order) === Number(target.sort_order) && block.status === target.status; }
function planHomeAdopt({ homePage, blocks, targets }) {
  if (!homePage || homePage.route !== '/' || homePage.type !== 'home') throw new Error('Home adopt kizárólag route=/ type=home oldalra fut.');
  const actions = [];
  const byKey = new Map(blocks.map((block) => [block.block_key, block]));
  for (const block of blocks) {
    if (block.block_key === HOME_LEGACY_CTA_KEY) actions.push({ action: 'protected-cta', blockId: block.id, block_key: block.block_key, status: block.status });
  }
  for (const target of targets) {
    const existing = byKey.get(target.block_key);
    if (!existing) { actions.push({ action: 'insert', target }); continue; }
    if (existing.status !== 'published') { actions.push({ action: 'keep-hidden', blockId: existing.id, block_key: existing.block_key, status: existing.status }); continue; }
    if (sameBlock(existing, target)) { actions.push({ action: 'keep', blockId: existing.id, block_key: existing.block_key }); continue; }
    actions.push({ action: 'conflict', blockId: existing.id, block_key: existing.block_key, status: existing.status, reason: 'existing canonical block differs' });
  }
  return actions;
}

export function diffHomeAdopt(input) { return planHomeAdopt(input); }

function hasConflict(actions) { return actions.some((action) => action.action === 'conflict' || action.action === 'keep-hidden'); }
async function createAuditSnapshot(conn) { const [pages] = await conn.query('SELECT * FROM site_pages ORDER BY id'); const [blocks] = await conn.query('SELECT * FROM site_content_blocks ORDER BY id'); const [navigation] = await conn.query('SELECT * FROM site_navigation_items ORDER BY id'); const [settings] = await conn.query('SELECT * FROM site_settings ORDER BY `key`'); const [media] = await conn.query('SELECT * FROM site_media_assets ORDER BY id'); const content = JSON.stringify({ label: 'home-adopt-before:/', source: 'home-content-adopt', pages, blocks, navigation, settings, media }); const hash = crypto.createHash('sha256').update(content).digest('hex'); await conn.execute('INSERT INTO site_publish_snapshots (label, content_json, content_hash, status, is_current) VALUES (?,?,?,?,?)', ['home-adopt-before:/', content, hash, 'success', 0]); }

export async function runHomeAdopt(db, { apply = false } = {}) {
  const pages = await db.listPages();
  const homePage = requirePage(pageByRoute(pages, '/'), 'home');
  const blocks = await db.listBlocks(homePage.id);
  const targets = await buildHomeCanonicalBlocks(pages);
  const actions = planHomeAdopt({ homePage, blocks, targets });
  if (!apply) return { ok: !hasConflict(actions), dryRun: true, actions };
  if (hasConflict(actions)) return { ok: false, dryRun: false, actions, error: 'Home adopt conflict; no changes applied.' };
  const inserts = actions.filter((entry) => entry.action === 'insert');
  if (inserts.length === 0) return { ok: true, dryRun: false, actions, noOp: true };
  await db.transaction(async (tx) => {
    await tx.createAuditSnapshot();
    for (const action of inserts) await tx.insertBlock(homePage.id, action.target);
  });
  return { ok: true, dryRun: false, actions, noOp: false };
}

function adapterFor(conn) { return {
  async listPages() { const [rows] = await conn.query('SELECT * FROM site_pages ORDER BY id'); return rows; },
  async listBlocks(pageId) { const [rows] = await conn.query('SELECT * FROM site_content_blocks WHERE page_id=? ORDER BY sort_order,id', [pageId]); return rows; },
  async insertBlock(pageId, block) { await conn.execute('INSERT INTO site_content_blocks (page_id, block_key, type, title, body, items, sort_order, status) VALUES (?,?,?,?,?,?,?,?)', [pageId, block.block_key, block.type, block.title, block.body ?? null, JSON.stringify(block.items), block.sort_order, block.status]); },
  async createAuditSnapshot() { await createAuditSnapshot(conn); },
  async transaction(fn) { const c = await conn.getConnection(); try { await c.beginTransaction(); const result = await fn(adapterFor(c)); await c.commit(); return result; } catch (error) { await c.rollback(); throw error; } finally { c.release(); } },
}; }

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const args = parseArgs();
    if (args.help) { console.log(helpText()); process.exit(0); }
    const pool = await createPool();
    try {
      const result = await runHomeAdopt(adapterFor(pool), { apply: args.apply });
      if (args.json) console.log(JSON.stringify(result, null, 2));
      else {
        console.log(`Home content adopt ${args.apply ? 'apply' : 'dry-run'}: ${result.ok ? 'ok' : 'blocked'}`);
        for (const action of result.actions) console.log(`${action.action}: ${action.block_key || action.target?.block_key}${action.reason ? ` (${action.reason})` : ''}`);
        if (result.error) console.error(result.error);
      }
      process.exit(result.ok ? 0 : 1);
    } finally { await pool.end(); }
  } catch (error) { console.error(error.message || error); process.exit(1); }
}
