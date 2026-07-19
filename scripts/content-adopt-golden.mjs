#!/usr/bin/env node
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { getDatabaseConfig, createPool } from '../src/lib/db/client.mjs';
import { canonicalCtaBlockFromDefault, isCanonicalCtaSection, assertSingleCanonicalCta, mergePricingCtaDefaults, isPricingCta } from '../src/lib/content/cta-contract.mjs';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const APPLY_GROUPS = new Set(['solutions', 'audiences', 'integrations', 'pricing', 'contact']);
const HOME_GROUP = 'home';
const RISK_RE = /telex|placeholder|teszt|test|lorem|dummy|kártya|kartya/i;

function usage() {
  return `Golden content adopt/backfill dry-run\n\nUsage:\n  node scripts/content-adopt-golden.mjs [--dry-run] [--apply --yes] [--group solutions|audiences|integrations|pricing|contact|all] [--route /path/]\n\nDefaults to --dry-run. Apply requires --yes and an explicit --route. Home remains dry-run only.\n`;
}

export function parseArgs(argv = process.argv.slice(2)) {
  const args = { dryRun: true, apply: false, yes: false, group: 'all', route: '', help: false, ctaDefaults: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--dry-run') { args.dryRun = true; args.apply = false; }
    else if (a === '--apply') { args.apply = true; args.dryRun = false; }
    else if (a === '--yes') args.yes = true;
    else if (a === '--group') args.group = argv[++i] || '';
    else if (a === '--route') args.route = normalizeRoute(argv[++i] || '');
    else if (a === '--cta-defaults') args.ctaDefaults = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!['solutions','audiences','integrations','pricing','contact','home','all'].includes(args.group)) throw new Error(`Invalid --group: ${args.group}`);
  if (args.apply && !args.yes) throw new Error('--apply requires --yes. Refusing to modify DB.');
  if (args.apply && !args.route && !args.ctaDefaults) throw new Error('Apply requires an explicit --route unless --cta-defaults is used.');
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
const targetBlock = (block, index) => ({ block_key: `golden:content:${index + 1}:${block.type}`, type: block.type, title: block.title, body: block.body, items: cloneItems(block.items), sort_order: (index + 1) * 10, status: 'published' });

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

function indexCards(items, section) {
  return items.map((item) => ({
    title: item.title,
    text: item.shortDescription,
    url: `/${section}/${item.slug}/`,
    linkLabel: 'Részletek →',
    order: item.order,
  }));
}

function solutionsIndexManifest(solutions) {
  return {
    group: 'solutions', route: '/megoldasaink/', applyAllowed: true, requiresApproval: true,
    page: { title: 'Megoldásaink', slug: 'megoldasaink', type: 'solutions_index', seoTitle: 'Megoldásaink | Easylink', seoDescription: 'Easylink ügyviteli megoldások.', heroEyebrow: 'Megoldásaink', heroTitle: 'Egy rendszer a napi működés kulcspontjaira.', heroDescription: 'Válaszd ki, melyik működési területet szeretnéd átláthatóbbá tenni: pénzügy, HR, CRM, dokumentumkezelés, kontrolling vagy AI támogatás.', heroAsset: '/assets/nati/hero-bg-flow-01.webp' },
    blocks: [
      { block_key: '/megoldasaink/:cards:0', type: 'cards', title: 'Megoldásaink', body: 'Válaszd ki, melyik működési területet szeretnéd átláthatóbbá tenni: pénzügy, HR, CRM, dokumentumkezelés, kontrolling vagy AI támogatás.', items: indexCards(solutions, 'megoldasaink'), sort_order: 10, status: 'published' },
    ],
  };
}

function audiencesIndexManifest(audiences) {
  return {
    group: 'audiences', route: '/kinek-szol/', applyAllowed: true, requiresApproval: true,
    page: { title: 'Kinek szól?', slug: 'kinek-szol', type: 'audiences_index', seoTitle: 'Kinek szól? | Easylink', seoDescription: 'Easylink célcsoportok.', heroEyebrow: 'Kinek szól?', heroTitle: 'Ügyvitel a vállalkozásod működéséhez igazítva.', heroDescription: 'Az Easylink különböző működési modellekhez igazítható: szálláshelyeknek, vendéglátóhelyeknek és szolgáltató vállalkozásoknak.', heroAsset: '/assets/nati/hero-bg-flow-02.webp' },
    blocks: [
      { block_key: '/kinek-szol/:cards:0', type: 'cards', title: 'Kinek szól?', body: 'Az Easylink különböző működési modellekhez igazítható: szálláshelyeknek, vendéglátóhelyeknek és szolgáltató vállalkozásoknak.', items: indexCards(audiences, 'kinek-szol'), sort_order: 10, status: 'published' },
    ],
  };
}

function integrationsManifest(integrations) {
  return {
    group: 'integrations', route: '/integraciok/', applyAllowed: true, requiresApproval: true,
    page: { title: 'Integrációk', slug: 'integraciok', type: 'integrations', seoTitle: 'Integrációk | Easylink', seoDescription: 'Integrációs irányok és adatkapcsolatok.', heroEyebrow: 'Integrációk', heroTitle: 'Kapcsolódások, adatáramlás, tisztább működés.', heroDescription: 'Az Easylink célja, hogy a fontos üzleti adatok összekapcsolhatók legyenek.', heroAsset: '/assets/nati/hero-bg-flow-01.webp' },
    blocks: [
      { block_key: '/integraciok/:text:0', type: 'text', title: 'Csomópontok', body: 'Nem késznek állított ígéretek, hanem tisztán tagolt integrációs irányok.', sort_order: 10, status: 'published' },
      { block_key: '/integraciok/:cards:1', type: 'cards', title: 'Integrációs irányok', body: 'Előkészített kapcsolódási irányok: nem kész runtime integrációs állítások.', items: integrations.map((i) => ({ title: i.title, text: i.shortDescription })), sort_order: 20, status: 'published' },
      { block_key: '/integraciok/:text:2', type: 'text', title: 'Fontos keret', body: 'A public tartalom integrációs irányokat és előkészített kapcsolódásokat mutat be; kész éles kapcsolatot csak bizonyított implementáció után kommunikálunk.', sort_order: 30, status: 'published' },
    ],
  };
}

const pricingManifest = () => ({
  group: 'pricing', route: '/arak/', applyAllowed: true, requiresApproval: true,
  page: { title: 'Árak', slug: 'arak', type: 'pricing', seoTitle: 'Árak | Easylink', seoDescription: 'Easylink árazási irányok.', heroEyebrow: 'Árak', heroTitle: 'Árazás, ami a működésedhez igazodik.', heroDescription: 'Az Easylink bevezetés modulokra, integrációs igényre és ügyviteli folyamatokra szabható.', heroAsset: '/assets/nati/hero-bg-flow-02.webp' },
  blocks: [
    { block_key: '/arak/:feature-list:0', type: 'feature-list', title: 'Mitől függhet az ár?', items: ['Választott moduloktól: pénzügy, CRM, dokumentumkezelés, kontrolling vagy AI irány.', 'Cégmérettől, felhasználói köröktől és adminisztrációs összetettségtől.', 'Előkészített vagy később bizonyított integrációktól.', 'Bevezetési, adat-előkészítési és támogatási igényektől.'], sort_order: 10, status: 'published' },
    { block_key: '/arak/:text:1', type: 'text', title: 'Demó alapján pontosítunk', body: 'A public oldalon nem közlünk konkrét díjat. Demó során a modulokat, a cégméretet és az integrációs előkészítést együtt mérjük fel.', sort_order: 20, status: 'published' },
    { block_key: '/arak/:cta:2', type: 'cta', title: 'Kérj demót, és beszéljük át a modulokat.', body: 'A pontos ajánlat a választott funkcióktól, cégmérettől és integrációs igényektől függ.', items: [{ eyebrow: 'Következő lépés', label: 'Demót kérek', url: '/kapcsolat/', secondaryLabel: 'Próbáld ki ingyen', secondaryUrl: defaultDeployUrl(), presentationRole: 'pricing-cta' }], sort_order: 30, status: 'published' },
  ],
});

const contactManifest = () => ({
  group: 'contact', route: '/kapcsolat/', applyAllowed: true, requiresApproval: true,
  page: { title: 'Kapcsolat', slug: 'kapcsolat', type: 'contact', seoTitle: 'Kapcsolat | Easylink', seoDescription: 'Kapcsolatfelvétel Easylink bevezetéshez.', heroEyebrow: 'Kapcsolat', heroTitle: 'Kapcsolódjunk össze.', heroDescription: 'Kérj bemutatót vagy egyeztetést az Easylink bevezetési lehetőségeiről.', heroAsset: '/assets/nati/hero-bg-flow-03.webp' },
  blocks: [
    { block_key: '/kapcsolat/:cta:0', type: 'cta', title: 'Kapcsolat', body: 'Írj nekünk, vagy kérj demót az alábbi kapcsolati adatokon.', items: [{ label: 'Írj nekünk' }], sort_order: 10, status: 'published' },
    { block_key: '/kapcsolat/:feature-list:1', type: 'feature-list', title: 'Miben tudunk segíteni?', items: ['Megnézzük, mely modulok illenek a jelenlegi működésedhez.', 'Átbeszéljük a hotel/szálláshely, vendéglátó vagy szolgáltatói fókuszt.', 'Összegyűjtjük, milyen integrációs irányokat érdemes előkészíteni.'], sort_order: 20, status: 'published' },
  ],
});

const homeManifest = () => ({
  group: 'home', route: '/', applyAllowed: false, requiresApproval: true,
  page: { title: 'Easylink', slug: 'home', type: 'home', seoTitle: 'Easylink | Ügyviteli rendszer KKV-knak', seoDescription: 'Modern Easylink public site ügyviteli, integrációs és AI asszisztens iránnyal.', heroEyebrow: 'Easylink ügyvitel + AI', heroTitle: 'easyLink ERP', heroDescription: 'Felejtsd el a táblázatokat! Olyan ügyviteli rendszert adunk a kezedbe, amivel egyetlen, átlátható felületen irányíthatod a számlázást, az adminisztrációt és az ügyfélnyilvántartást.', heroAsset: '/assets/nati/hero-bg-flow-03.webp' },
  blocks: [],
  note: 'Home golden layout komponált Astro layout, kézi döntést igényel; első körben nincs automatikus backfill/apply.',
});

export async function buildGoldenManifest() {
  const [solutions, audiences, integrations] = await Promise.all([
    loadTsExport('src/content/solutions.ts', 'solutions'),
    loadTsExport('src/content/audiences.ts', 'audiences'),
    loadTsExport('src/content/integrations.ts', 'integrations'),
  ]);
  return [
    solutionsIndexManifest(solutions.filter((i) => i.status === 'published').sort((a,b)=>a.order-b.order)),
    ...solutions.filter((i) => i.status === 'published').sort((a,b)=>a.order-b.order).map((i) => pageFromItem(i, 'megoldasaink', 'solution_detail', 'solutions')),
    audiencesIndexManifest(audiences.filter((i) => i.status === 'published').sort((a,b)=>a.order-b.order)),
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
const sameBlockKey = (block, target) => target.block_key && block.block_key === target.block_key;
const sameShape = (block, target) => block.type === target.type && block.title === target.title;
const parseItems = (items) => {
  if (Array.isArray(items)) return items;
  if (typeof items === 'string' && items.trim()) { try { return JSON.parse(items); } catch { return items; } }
  return undefined;
};
const pricingCtaHasRequiredFields = (block) => {
  const first = parseItems(block?.items)?.[0];
  return Boolean(first && typeof first === 'object' && isPricingCta(block) && ['eyebrow','label','url','secondaryLabel','secondaryUrl'].every((key) => Object.prototype.hasOwnProperty.call(first, key)));
};
function isCtaSectionBlock(block) { return isCanonicalCtaSection(block); }
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
    const keyed = publishedBlocks.find((b) => !used.has(b.id) && sameBlockKey(b, target));
    if (keyed) { used.add(keyed.id); actions.push(target.block_key === '/arak/:cta:2' && pricingCtaHasRequiredFields(keyed) ? { action: 'keep', blockId: keyed.id, targetTitle: target.title } : { action: 'update', blockId: keyed.id, target }); continue; }
    const shaped = publishedBlocks.find((b) => !used.has(b.id) && sameShape(b, target));
    if (shaped) { used.add(shaped.id); actions.push(target.block_key === '/arak/:cta:2' && pricingCtaHasRequiredFields(shaped) ? { action: 'keep', blockId: shaped.id, targetTitle: target.title } : { action: 'update', blockId: shaped.id, target }); continue; }
    actions.push({ action: 'insert', target, reason: nonPublishedBlocks.some((b) => sameBlockKey(b, target) || sameShape(b, target)) ? 'non-published matching block ignored' : undefined });
  }
  for (const block of publishedBlocks) { if (isCtaSectionBlock(block)) { used.add(block.id); actions.push({ action: 'keep-supplemental', blockId: block.id, targetTitle: block.title }); continue; } if (!used.has(block.id)) actions.push({ action: 'archive', blockId: block.id, reason: isRiskyBlock(block) ? 'dangerous/test placeholder marker' : 'extra block not in golden manifest' }); }
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


const defaultDeployUrl = () => process.env.PUBLIC_DEPLOY_URL || 'https://deploy.easylink.hu';


export async function diffCtaDefaults(db) {
  const pages = (await db.listNonHomePages()).filter((page) => page.status !== 'archived' && page.type !== 'pricing' && page.route !== '/arak/');
  const settings = db.getDefaultCta ? await db.getDefaultCta() : undefined;
  const diffs = [];
  for (const page of pages) {
    const blocks = await db.listBlocks(page.id);
    const canonical = assertSingleCanonicalCta(blocks);
    if (!canonical) diffs.push({ route: page.route, page: { id: page.id, type: page.type, status: page.status }, action: 'insert', target: canonicalCtaBlockFromDefault(settings) });
    else if (canonical.status === 'archived') diffs.push({ route: page.route, page: { id: page.id, type: page.type, status: page.status }, action: 'suppressed-archived', blockId: canonical.id });
    else diffs.push({ route: page.route, page: { id: page.id, type: page.type, status: page.status }, action: 'keep', blockId: canonical.id });
  }
  return diffs;
}

export async function applyCtaDefaults(db) {
  return withTransaction(db, async (tx) => {
    if (tx.createAuditSnapshot) await tx.createAuditSnapshot('cta-defaults-adopt-before:all-non-home');
    const diffs = await diffCtaDefaults(tx);
    for (const diff of diffs) if (diff.action === 'insert') await tx.insertBlock(diff.page.id, diff.target);
    return diffCtaDefaults(tx);
  });
}

export function formatCtaDiff(diffs) {
  return diffs.map((d) => `\nRoute: ${d.route}\n  db page: id=${d.page.id} status=${d.page.status} type=${d.page.type}\n  ${d.action}${d.target ? ` -> ${d.target.type} "${d.target.title}" block_key=${d.target.block_key}` : ''}`).join('\n');
}


function mergeMissingCtaFields(existingBlock, target) {
  if (target?.block_key !== '/arak/:cta:2') return target;
  const existingItems = parseItems(existingBlock?.items);
  const current = Array.isArray(existingItems) && existingItems[0] && typeof existingItems[0] === 'object' ? existingItems[0] : {};
  const desired = target.items?.[0] || {};
  return { ...target, ...mergePricingCtaDefaults(existingBlock, target), block_key: target.block_key, type: target.type, title: existingBlock?.title ?? target.title, body: existingBlock?.body ?? target.body, sort_order: existingBlock?.sort_order ?? target.sort_order, status: existingBlock?.status ?? target.status };
}

export async function applyRoute(entry, db) {
  if (!entry.applyAllowed || entry.group === HOME_GROUP) throw new Error(`Apply requires manual approval and is disabled for group: ${entry.group}`);
  if (!APPLY_GROUPS.has(entry.group)) throw new Error(`Apply is not enabled for group: ${entry.group}`);
  return withTransaction(db, async (tx) => {
    const page = await tx.getPageByRoute(entry.route);
    if (!page) throw new Error(`Cannot apply without existing DB page: ${entry.route}`);
    if (tx.createAuditSnapshot) await tx.createAuditSnapshot(`golden-adopt-before:${entry.route}`);
    await tx.updatePageFields(page.id, entry.page);
    const current = await tx.listBlocks(page.id);
    const diff = await diffRoute(entry, { getPageByRoute: async () => page, listBlocks: async () => current });
    for (const action of diff.actions) {
      if (action.action === 'update') await tx.updateBlock(action.blockId, mergeMissingCtaFields(current.find((b) => b.id === action.blockId), action.target));
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
    async listNonHomePages() { const [rows] = await conn.query("SELECT * FROM site_pages WHERE route<>? AND type<>? AND status<>? ORDER BY sort_order,id", ['/', 'home', 'archived']); return rows; },
    async getDefaultCta() { const [rows] = await conn.query('SELECT `value` FROM site_settings WHERE `key`=? LIMIT 1', ['defaultCta']); const row = rows[0]; return row ? (typeof row.value === 'string' ? JSON.parse(row.value) : row.value) : undefined; },
    async listBlocks(pageId) { const [rows] = await conn.query('SELECT * FROM site_content_blocks WHERE page_id=? ORDER BY sort_order,id', [pageId]); return rows; },
    async updatePageFields(id, page) { await conn.execute('UPDATE site_pages SET title=?, seo_title=?, seo_description=?, hero_eyebrow=?, hero_title=?, hero_description=?, hero_asset=? WHERE id=?', [page.title, page.seoTitle, page.seoDescription, page.heroEyebrow, page.heroTitle, page.heroDescription, page.heroAsset, id]); },
    async updateBlock(id, b) { await conn.execute('UPDATE site_content_blocks SET type=?, title=?, body=?, items=?, sort_order=?, status=? WHERE id=?', [b.type, b.title, b.body ?? null, b.items === undefined ? null : JSON.stringify(b.items), b.sort_order, b.status, id]); },
    async insertBlock(pageId, b) { await conn.execute('INSERT INTO site_content_blocks (page_id, block_key, type, title, body, items, sort_order, status) VALUES (?,?,?,?,?,?,?,?)', [pageId, b.block_key || `golden:${b.sort_order}:${b.type}:${b.title}`, b.type, b.title, b.body ?? null, b.items === undefined ? null : JSON.stringify(b.items), b.sort_order, b.status]); },
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
  if (!args.ctaDefaults && args.apply && selected.some((e) => !e.applyAllowed || !APPLY_GROUPS.has(e.group) || e.group === HOME_GROUP)) throw new Error('Apply is disabled for home. Select an explicitly allowed --route.');
  const hasConfig = Boolean(getDatabaseConfig(process.env));
  if (!hasConfig) {
    console.log(JSON.stringify({ mode: args.apply ? 'apply' : 'dry-run', db: 'unavailable-no-config', entries: selected }, null, 2));
    if (args.apply) throw new Error('DB config is required for apply.');
    return;
  }
  const pool = await createPool();
  try {
    const db = createMysqlDbAdapter(pool);
    if (args.ctaDefaults) console.log(formatCtaDiff(args.apply ? await applyCtaDefaults(db) : await diffCtaDefaults(db)));
    else if (args.apply) console.log(formatDiff(await applyManifest(selected, db, args)));
    else console.log(formatDiff(await diffManifest(selected, db, args)));
  } finally { await pool.end?.(); }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
