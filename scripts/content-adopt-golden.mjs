#!/usr/bin/env node
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { getDatabaseConfig, createPool } from '../src/lib/db/client.mjs';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const APPLY_GROUPS = new Set(['solutions', 'audiences']);
const PROTECTED_GROUPS = new Set(['integrations', 'pricing', 'contact', 'home']);
const RISK_RE = /telex|placeholder|teszt|test|lorem|dummy|kártya|kartya/i;

function usage() {
  return `Golden content adopt/backfill dry-run\n\nUsage:\n  node scripts/content-adopt-golden.mjs [--dry-run] [--apply --yes] [--group solutions|audiences|integrations|pricing|contact|all] [--route /path/]\n\nDefaults to --dry-run. Apply is allowed only for solutions/audiences and requires --yes.\n`;
}

export function parseArgs(argv = process.argv.slice(2)) {
  const args = { dryRun: true, apply: false, yes: false, group: 'all', route: '', help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--dry-run') { args.dryRun = true; args.apply = false; }
    else if (a === '--apply') { args.apply = true; args.dryRun = false; }
    else if (a === '--yes') args.yes = true;
    else if (a === '--group') args.group = argv[++i] || '';
    else if (a === '--route') args.route = normalizeRoute(argv[++i] || '');
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!['solutions','audiences','integrations','pricing','contact','home','all'].includes(args.group)) throw new Error(`Invalid --group: ${args.group}`);
  if (args.apply && !args.yes) throw new Error('--apply requires --yes. Refusing to modify DB.');
  if (args.apply && !args.route) throw new Error('Apply requires an explicit --route in this first release.');
  return args;
}

const normalizeRoute = (route) => {
  if (!route) return '';
  const withStart = route.startsWith('/') ? route : `/${route}`;
  return withStart.endsWith('/') ? withStart : `${withStart}/`;
};

async function loadTsExport(relativePath, exportName) {
  const file = path.join(ROOT, relativePath);
  const source = await readFile(file, 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false } }).outputText;
  const mod = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  return mod[exportName];
}

const cloneItems = (items) => items === undefined ? undefined : JSON.parse(JSON.stringify(items));
const targetBlock = (block, index) => ({ type: block.type, title: block.title, body: block.body, items: cloneItems(block.items), sort_order: (index + 1) * 10, status: 'published' });

function pageFromItem(item, section, type, group) {
  const route = `/${section}/${item.slug}/`;
  return {
    group,
    route,
    applyAllowed: true,
    requiresApproval: false,
    page: {
      title: item.title,
      slug: item.slug,
      type,
      seoTitle: item.seoTitle,
      seoDescription: item.seoDescription,
      heroEyebrow: section === 'megoldasaink' ? 'Megoldásaink' : 'Kinek szól?',
      heroTitle: item.heroTitle,
      heroDescription: item.heroDescription,
      heroAsset: item.media?.path || '',
    },
    blocks: item.blocks.map(targetBlock),
  };
}

function integrationsManifest(integrations) {
  return {
    group: 'integrations', route: '/integraciok/', applyAllowed: false, requiresApproval: true,
    page: { title: 'Integrációk', slug: 'integraciok', type: 'integrations', seoTitle: 'Integrációk | Easylink', seoDescription: 'Integrációs irányok és adatkapcsolatok.', heroEyebrow: 'Integrációk', heroTitle: 'Kapcsolódások, adatáramlás, tisztább működés.', heroDescription: 'Az Easylink célja, hogy a fontos üzleti adatok összekapcsolhatók legyenek.', heroAsset: '/assets/nati/hero-bg-flow-01.webp' },
    blocks: [
      { type: 'text', title: 'Csomópontok', body: 'Nem késznek állított ígéretek, hanem tisztán tagolt integrációs irányok.', sort_order: 10, status: 'published' },
      { type: 'cards', title: 'Integrációs irányok', body: 'Előkészített kapcsolódási irányok: nem kész runtime integrációs állítások.', items: integrations.map((i) => ({ title: i.title, text: i.shortDescription })), sort_order: 20, status: 'published' },
      { type: 'text', title: 'Fontos keret', body: 'A public tartalom integrációs irányokat és előkészített kapcsolódásokat mutat be; kész éles kapcsolatot csak bizonyított implementáció után kommunikálunk.', sort_order: 30, status: 'published' },
    ],
  };
}

const pricingManifest = () => ({
  group: 'pricing', route: '/arak/', applyAllowed: false, requiresApproval: true,
  page: { title: 'Árak', slug: 'arak', type: 'pricing', seoTitle: 'Árak | Easylink', seoDescription: 'Easylink árazási irányok.', heroEyebrow: 'Árak', heroTitle: 'Árazás, ami a működésedhez igazodik.', heroDescription: 'Az Easylink bevezetés modulokra, integrációs igényre és ügyviteli folyamatokra szabható.', heroAsset: '/assets/nati/hero-bg-flow-02.webp' },
  blocks: [
    { type: 'feature-list', title: 'Mitől függhet az ár?', items: ['Választott moduloktól: pénzügy, CRM, dokumentumkezelés, kontrolling vagy AI irány.', 'Cégmérettől, felhasználói köröktől és adminisztrációs összetettségtől.', 'Előkészített vagy később bizonyított integrációktól.', 'Bevezetési, adat-előkészítési és támogatási igényektől.'], sort_order: 10, status: 'published' },
    { type: 'text', title: 'Demó alapján pontosítunk', body: 'A public oldalon nem közlünk csomagárat. Demó során a modulokat, a cégméretet és az integrációs előkészítést együtt mérjük fel.', sort_order: 20, status: 'published' },
    { type: 'cta', title: 'Kérj demót, és beszéljük át a modulokat.', body: 'A pontos ajánlat a választott funkcióktól, cégmérettől és integrációs igényektől függ.', items: [{ label: 'Demót kérek', url: '/kapcsolat/' }], sort_order: 30, status: 'published' },
  ],
});

const contactManifest = () => ({
  group: 'contact', route: '/kapcsolat/', applyAllowed: false, requiresApproval: true,
  page: { title: 'Kapcsolat', slug: 'kapcsolat', type: 'contact', seoTitle: 'Kapcsolat | Easylink', seoDescription: 'Kapcsolatfelvétel Easylink bevezetéshez.', heroEyebrow: 'Kapcsolat', heroTitle: 'Kapcsolódjunk össze.', heroDescription: 'Kérj bemutatót vagy egyeztetést az Easylink bevezetési lehetőségeiről.', heroAsset: '/assets/nati/hero-bg-flow-03.webp' },
  blocks: [
    { type: 'cta', title: 'Kapcsolat', body: 'Email: hello@easylink.hu', items: [{ label: 'Demót kérek', url: 'https://deploy.easylink.hu' }], sort_order: 10, status: 'published' },
    { type: 'feature-list', title: 'Miben tudunk segíteni?', items: ['Megnézzük, mely modulok illenek a jelenlegi működésedhez.', 'Átbeszéljük a hotel/szálláshely, vendéglátó vagy szolgáltatói fókuszt.', 'Összegyűjtjük, milyen integrációs irányokat érdemes előkészíteni.'], sort_order: 20, status: 'published' },
  ],
});

const homeManifest = () => ({
  group: 'home', route: '/', applyAllowed: false, requiresApproval: true,
  page: { title: 'Easylink', slug: 'home', type: 'home', seoTitle: 'Easylink | Ügyviteli rendszer KKV-knak', seoDescription: 'Modern Easylink public site ügyviteli, integrációs és AI asszisztens iránnyal.', heroEyebrow: 'Easylink ügyvitel + AI', heroTitle: 'easyLink ERP', heroDescription: 'Felejtsd el a táblázatokat! Olyan ügyviteli rendszert adunk a kezedbe, amivel egyetlen, átlátható felületen irányíthatod a számlázást, az adminisztrációt és az ügyfélnyilvántartást.', heroAsset: '/assets/nati/hero-bg-flow-03.webp' },
  blocks: [],
  note: 'Home golden layout komponált Astro layout marad; első körben nincs automatikus backfill.',
});

export async function buildGoldenManifest() {
  const [solutions, audiences, integrations] = await Promise.all([
    loadTsExport('src/content/solutions.ts', 'solutions'),
    loadTsExport('src/content/audiences.ts', 'audiences'),
    loadTsExport('src/content/integrations.ts', 'integrations'),
  ]);
  return [
    ...solutions.filter((i) => i.status === 'published').sort((a,b)=>a.order-b.order).map((i) => pageFromItem(i, 'megoldasaink', 'solution_detail', 'solutions')),
    ...audiences.filter((i) => i.status === 'published').sort((a,b)=>a.order-b.order).map((i) => pageFromItem(i, 'kinek-szol', 'audience_detail', 'audiences')),
    integrationsManifest(integrations.filter((i) => i.status === 'published').sort((a,b)=>a.order-b.order)),
    pricingManifest(),
    contactManifest(),
    homeManifest(),
  ];
}

const canonical = (value) => JSON.stringify(value ?? null);
const preview = (value) => typeof value === 'string' ? value.slice(0, 120) : canonical(value).slice(0, 120);
const blockMatches = (block, target) => block.type === target.type && block.title === target.title && (block.body ?? undefined) === (target.body ?? undefined) && canonical(parseItems(block.items)) === canonical(target.items);
const sameShape = (block, target) => block.type === target.type && block.title === target.title;
const parseItems = (items) => {
  if (Array.isArray(items)) return items;
  if (typeof items === 'string' && items.trim()) { try { return JSON.parse(items); } catch { return items; } }
  return undefined;
};
const isRiskyBlock = (block) => RISK_RE.test(`${block.title || ''}\n${block.body || ''}\n${preview(block.items || '')}`);

export async function diffRoute(entry, db) {
  const page = await db.getPageByRoute(entry.route);
  const blocks = page ? await db.listBlocks(page.id) : [];
  const used = new Set();
  const actions = [];
  const risks = [];
  const publishedBlocks = blocks.filter((block) => block.status === 'published');
  const nonPublishedBlocks = blocks.filter((block) => block.status !== 'published');
  if (!page) actions.push({ action: 'missing-page', route: entry.route });
  for (const block of blocks) {
    if (block.status !== 'published') risks.push({ blockId: block.id, reason: 'non-published block ignored for matching', risky: isRiskyBlock(block), title: block.title, status: block.status, preview: preview(block.body || block.items || '') });
    else if (isRiskyBlock(block)) risks.push({ blockId: block.id, reason: 'dangerous/test placeholder marker', title: block.title, status: block.status, preview: preview(block.body || block.items || '') });
  }
  for (const target of entry.blocks) {
    const exact = publishedBlocks.find((b) => !used.has(b.id) && blockMatches(b, target));
    if (exact) { used.add(exact.id); actions.push({ action: 'keep', blockId: exact.id, targetTitle: target.title }); continue; }
    const shaped = publishedBlocks.find((b) => !used.has(b.id) && sameShape(b, target));
    if (shaped) { used.add(shaped.id); actions.push({ action: 'update', blockId: shaped.id, target }); continue; }
    actions.push({ action: 'insert', target, reason: nonPublishedBlocks.some((b) => sameShape(b, target)) ? 'non-published matching block ignored' : undefined });
  }
  for (const block of publishedBlocks) if (!used.has(block.id)) actions.push({ action: 'archive', blockId: block.id, reason: isRiskyBlock(block) ? 'dangerous/test placeholder marker' : 'extra block not in golden manifest' });
  return { route: entry.route, group: entry.group, applyAllowed: entry.applyAllowed, requiresApproval: entry.requiresApproval, page: page ? { id: page.id, status: page.status, type: page.type, title: page.title } : null, existingBlockIds: blocks.map((b) => b.id), actions, risks };
}

export async function diffManifest(manifest, db, { group = 'all', route = '' } = {}) {
  const selected = manifest.filter((e) => (group === 'all' || e.group === group) && (!route || e.route === route));
  return Promise.all(selected.map((entry) => diffRoute(entry, db)));
}

async function withTransaction(db, fn) {
  if (db.transaction) return db.transaction(fn);
  return fn(db);
}

export async function applyRoute(entry, db) {
  if (!entry.applyAllowed || PROTECTED_GROUPS.has(entry.group)) throw new Error(`Apply requires manual approval and is disabled for group: ${entry.group}`);
  if (!APPLY_GROUPS.has(entry.group)) throw new Error(`Apply is only enabled for solutions/audiences, got: ${entry.group}`);
  return withTransaction(db, async (tx) => {
    const page = await tx.getPageByRoute(entry.route);
    if (!page) throw new Error(`Cannot apply without existing DB page: ${entry.route}`);
    if (tx.createAuditSnapshot) await tx.createAuditSnapshot(`golden-adopt-before:${entry.route}`);
    await tx.updatePageFields(page.id, entry.page);
    const current = await tx.listBlocks(page.id);
    const diff = await diffRoute(entry, { getPageByRoute: async () => page, listBlocks: async () => current });
    for (const action of diff.actions) {
      if (action.action === 'update') await tx.updateBlock(action.blockId, action.target);
      if (action.action === 'insert') await tx.insertBlock(page.id, action.target);
      if (action.action === 'archive') await tx.archiveBlock(action.blockId);
    }
    return await diffRoute(entry, tx);
  });
}

export async function applyManifest(manifest, db, { group = 'all', route = '' } = {}) {
  if (!route) throw new Error('Apply requires an explicit --route in this first release.');
  const selected = manifest.filter((e) => (group === 'all' || e.group === group) && e.route === route);
  return Promise.all(selected.map((entry) => applyRoute(entry, db)));
}

export function formatDiff(diffs) {
  return diffs.map((d) => {
    const lines = [`\nRoute: ${d.route}`, `  group: ${d.group}`, `  db page: ${d.page ? `id=${d.page.id} status=${d.page.status} type=${d.page.type}` : 'missing'}`, `  existing blocks: ${d.existingBlockIds.join(', ') || '-'}`, `  apply: ${d.applyAllowed ? 'allowed' : 'approval-required'}`];
    for (const risk of d.risks) lines.push(`  risk: block ${risk.blockId} ${risk.reason} (${risk.title}) ${risk.preview}`);
    for (const a of d.actions) lines.push(`  ${a.action}: ${a.blockId ? `block ${a.blockId}` : ''}${a.target ? ` -> ${a.target.type} "${a.target.title}"` : ''}${a.reason ? ` (${a.reason})` : ''}`.trimEnd());
    return lines.join('\n');
  }).join('\n');
}

export function createMysqlDbAdapter(pool) {
  const adapterFor = (conn) => ({
    async getPageByRoute(route) { const [rows] = await conn.query('SELECT * FROM site_pages WHERE route=? LIMIT 1', [route]); return rows[0] || null; },
    async listBlocks(pageId) { const [rows] = await conn.query('SELECT * FROM site_content_blocks WHERE page_id=? ORDER BY sort_order,id', [pageId]); return rows; },
    async updatePageFields(id, page) { await conn.execute('UPDATE site_pages SET title=?, seo_title=?, seo_description=?, hero_eyebrow=?, hero_title=?, hero_description=?, hero_asset=? WHERE id=?', [page.title, page.seoTitle, page.seoDescription, page.heroEyebrow, page.heroTitle, page.heroDescription, page.heroAsset, id]); },
    async updateBlock(id, b) { await conn.execute('UPDATE site_content_blocks SET type=?, title=?, body=?, items=?, sort_order=?, status=? WHERE id=?', [b.type, b.title, b.body ?? null, b.items === undefined ? null : JSON.stringify(b.items), b.sort_order, b.status, id]); },
    async insertBlock(pageId, b) { await conn.execute('INSERT INTO site_content_blocks (page_id, block_key, type, title, body, items, sort_order, status) VALUES (?,?,?,?,?,?,?,?)', [pageId, `golden:${b.sort_order}:${b.type}:${b.title}`, b.type, b.title, b.body ?? null, b.items === undefined ? null : JSON.stringify(b.items), b.sort_order, b.status]); },
    async archiveBlock(id) { await conn.execute('UPDATE site_content_blocks SET status=? WHERE id=?', ['archived', id]); },
    async createAuditSnapshot(label) { const [pages] = await conn.query('SELECT * FROM site_pages ORDER BY id'); const [blocks] = await conn.query('SELECT * FROM site_content_blocks ORDER BY id'); const [navigation] = await conn.query('SELECT * FROM site_navigation_items ORDER BY id'); const [settings] = await conn.query('SELECT * FROM site_settings ORDER BY `key`'); const [media] = await conn.query('SELECT * FROM site_media_assets ORDER BY id'); const content = JSON.stringify({ label, source: 'content-adopt-golden', pages, blocks, navigation, settings, media }); const hash = crypto.createHash('sha256').update(content).digest('hex'); await conn.execute('INSERT INTO site_publish_snapshots (label, content_json, content_hash, status, is_current) VALUES (?,?,?,?,?)', [label, content, hash, 'success', 0]); },
    async transaction(fn) { const c = await pool.getConnection(); try { await c.beginTransaction(); const result = await fn(adapterFor(c)); await c.commit(); return result; } catch (error) { await c.rollback(); throw error; } finally { c.release(); } },
  });
  return adapterFor(pool);
}

async function main() {
  const args = parseArgs();
  if (args.help) { console.log(usage()); return; }
  const manifest = await buildGoldenManifest();
  const selected = manifest.filter((e) => (args.group === 'all' || e.group === args.group) && (!args.route || e.route === args.route));
  if (selected.length === 0) throw new Error('No manifest entries matched the selected group/route.');
  if (args.apply && selected.some((e) => !e.applyAllowed || !APPLY_GROUPS.has(e.group))) throw new Error('Apply is disabled for integrations/pricing/contact/home. Select only --group solutions or --group audiences, or an allowed route.');
  const hasConfig = Boolean(getDatabaseConfig(process.env));
  if (!hasConfig) {
    console.log(JSON.stringify({ mode: args.apply ? 'apply' : 'dry-run', db: 'unavailable-no-config', entries: selected }, null, 2));
    if (args.apply) throw new Error('DB config is required for apply.');
    return;
  }
  const pool = await createPool();
  try {
    const db = createMysqlDbAdapter(pool);
    if (args.apply) console.log(formatDiff(await applyManifest(selected, db, args)));
    else console.log(formatDiff(await diffManifest(selected, db, args)));
  } finally { await pool.end?.(); }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
