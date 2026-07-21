import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createPublishService, contentHash, ensureWebrootPermissions, stableJson } from '../src/lib/admin/publish.mjs';
import { PUBLIC_SMOKE_METADATA_PATH } from '../src/lib/content/smoke-metadata.mjs';
import { publishPanel } from '../src/lib/admin/render.mjs';


const workflow = await readFile('.github/workflows/deploy-site-dev.yml', 'utf8');
assert.doesNotMatch(workflow, /name:\s*Deploy dist to site-dev/);
assert.doesNotMatch(workflow, /rsync[\s\S]{0,220}dist\/[\s\S]{0,220}\$\{SITE_DEV_WEBROOT\}/);
assert.match(workflow, /SITE_DEV_ENV_FILE:\s*\/var\/www\/clients\/client1\/web172\/private\/site-admin\.env/);
assert.match(workflow, /SITE_ADMIN_ENV_FILE="\$SITE_DEV_ENV_FILE"\s*\\[\s\S]*SITE_CONTENT_SOURCE=db\s*\\[\s\S]*SITE_PUBLISH_REPO_DIR="\$SITE_DEV_SOURCE_ROOT"\s*\\[\s\S]*SITE_PUBLISH_WEBROOT="\$SITE_DEV_WEBROOT"\s*\\[\s\S]*SITE_PUBLISH_RELEASES_DIR="\$SITE_DEV_PRIVATE\/releases"\s*\\[\s\S]*npm run admin:publish/);
const adminPublishSource = await readFile('scripts/admin-publish.mjs', 'utf8');
assert.match(adminPublishSource, /process\.env\.SITE_ADMIN_ENV_FILE/);
assert.match(adminPublishSource, /required: true/);
assert.match(adminPublishSource, /process\.env\[match\[1\]\] !== undefined/);

const homeBlockRows = [
  { id: 10, page_id: 1, block_key: 'home:hero-meta', type: 'hero-meta', title: 'Hero meta', body: '', items: JSON.stringify([{ title: 'Gyorsabb döntés', text: 'Átlátható adatok.' }]), sort_order: 0, status: 'published' },
  { id: 11, page_id: 1, block_key: 'manual:solutions', type: 'cards', title: 'Megoldásaink', body: 'Egy rendszer a napi működés kulcspontjaira.', items: JSON.stringify([{ version: 2, cards: [
    { target_type: 'page', target_page_id: 3, text_override: 'Pénzügy text', linkLabel: 'Részletek →', badge: 1 },
    { target_type: 'page', target_page_id: 4, text_override: 'HR text', linkLabel: 'Részletek →', badge: 2 },
    { target_type: 'page', target_page_id: 5, text_override: 'CRM text', linkLabel: 'Részletek →', badge: 3 },
  ], action: { target_type: 'page', target_page_id: 2, label: 'Összes megoldás' } }]), sort_order: 20, status: 'published' },
  { id: 12, page_id: 1, block_key: 'manual:audiences', type: 'cards', title: 'Kinek szól?', body: 'Hoteleknek, vendéglátóhelyeknek és szolgáltató vállalkozásoknak.', items: JSON.stringify([{ version: 2, cards: [
    { target_type: 'page', target_page_id: 21, text_override: 'Hotel text', linkLabel: 'Részletek →', badge: 1 },
    { target_type: 'page', target_page_id: 22, text_override: 'Vendéglátó text', linkLabel: 'Részletek →', badge: 2 },
    { target_type: 'page', target_page_id: 23, text_override: 'Szolgáltató text', linkLabel: 'Részletek →', badge: 3 },
  ] }]), sort_order: 30, status: 'published' },
];
const content = { navigation: [{ id: 1, title: 'A' }], pages: [
  { id: 1, route: '/', type: 'home', title: 'Home', status: 'published', hero_eyebrow: 'Home eyebrow', hero_title: 'Home title', hero_description: 'Home desc', hero_asset: '/assets/site-media/2026/07/kep-a1b2c3d4.png' },
  { id: 2, route: '/megoldasaink/', type: 'solutions_index', title: 'Megoldásaink', status: 'published' },
  { id: 3, route: '/megoldasaink/penzugy-szamlazas/', type: 'solution_detail', title: 'Pénzügy', status: 'published', seo_description: 'Pénzügy seo' },
  { id: 4, route: '/megoldasaink/hr-munkaugy/', type: 'solution_detail', title: 'HR', status: 'published', seo_description: 'HR seo' },
  { id: 5, route: '/megoldasaink/crm-ugyfelkezeles/', type: 'solution_detail', title: 'CRM', status: 'published', seo_description: 'CRM seo' },
  { id: 21, route: '/kinek-szol/hotelek-szallashelyek/', type: 'audience_detail', title: 'Hotelek', status: 'published', seo_description: 'Hotel seo' },
  { id: 22, route: '/kinek-szol/vendeglatohelyek/', type: 'audience_detail', title: 'Vendéglátó', status: 'published', seo_description: 'Vendéglátó seo' },
  { id: 23, route: '/kinek-szol/szolgaltato-vallalkozasok/', type: 'audience_detail', title: 'Szolgáltató', status: 'published', seo_description: 'Szolgáltató seo' },
  { id: 30, route: '/arak/', type: 'pricing', title: 'Árak', status: 'published' },
], blocks: homeBlockRows, settings: [{ key: 'legalDocuments', value: JSON.stringify({ termsPdfPath: '/assets/site-media/2026/07/terms-a1b2c3d4.pdf' }) }], media: [
  { path: '/assets/site-media/2026/07/kep-a1b2c3d4.png', status: 'active', type: 'image/png' },
  { path: '/assets/site-media/2026/07/video-a1b2c3d4.mp4', status: 'active', processing_status: 'ready', type: 'video/mp4' },
  { path: '/assets/site-media/2026/07/terms-a1b2c3d4.pdf', status: 'active', processing_status: 'ready', type: 'application/pdf' },
  { path: '/assets/site-media/2026/07/processing-a1b2c3d4.mp4', status: 'active', processing_status: 'processing', type: 'video/mp4' },
  { path: '/assets/site-media/2026/07/failed-a1b2c3d4.mp4', status: 'active', processing_status: 'failed', type: 'video/mp4' },
  { path: '/assets/site-media/2026/07/archived-a1b2c3d4.mp4', status: 'archived', processing_status: 'ready', type: 'video/mp4' },
  { path: '/assets/site-media/2026/07/archived-doc-a1b2c3d4.pdf', status: 'archived', processing_status: 'ready', type: 'application/pdf' },
] };
assert.equal(stableJson({ b: 1, a: 2 }), stableJson({ a: 2, b: 1 }));
assert.equal(contentHash(content), contentHash(structuredClone(content)));

const snapshots = [];
let nextId = 1;
let deployed = 0;
const mediaStorage = await mkdtemp(join(tmpdir(), 'easylink-publish-media-'));
await mkdir(join(mediaStorage, '2026', '07'), { recursive: true });
await writeFile(join(mediaStorage, '2026', '07', 'kep-a1b2c3d4.png'), 'media');
await writeFile(join(mediaStorage, '2026', '07', 'video-a1b2c3d4.mp4'), 'mp4');
await writeFile(join(mediaStorage, '2026', '07', 'terms-a1b2c3d4.pdf'), '%PDF-1.7');
await writeFile(join(mediaStorage, '2026', '07', 'processing-a1b2c3d4.mp4'), 'processing');
await writeFile(join(mediaStorage, '2026', '07', 'failed-a1b2c3d4.mp4'), 'failed');
await writeFile(join(mediaStorage, '2026', '07', 'archived-a1b2c3d4.mp4'), 'archived');
await writeFile(join(mediaStorage, '2026', '07', 'archived-doc-a1b2c3d4.pdf'), '%PDF-1.7');
await writeFile(join(mediaStorage, '2026', '07', 'orphan-a1b2c3d4.mp4'), 'orphan');
const repo = {
  async exportContentSnapshot() { return structuredClone(content); },
  async createPublishSnapshot(s) { snapshots.push({ id: nextId, ...s }); return nextId++; },
  async markPublishStarted(id) { snapshots.find((s) => s.id === id).build_started_at = true; },
  async markPublishFinished(id, p) { Object.assign(snapshots.find((s) => s.id === id), p, { is_current: p.status === 'success' ? 1 : 0 }); },
  async prunePublishSnapshots(limit) { const success = snapshots.filter((s) => s.status === 'success'); for (const old of success.slice(0, Math.max(0, success.length - limit))) snapshots.splice(snapshots.indexOf(old), 1); },
};
async function writeValidRelease(releasePath) {
  for (const page of content.pages.filter((entry) => entry.status === undefined || entry.status === 'published')) {
    const routePath = page.route === '/' ? '' : page.route.replace(/^\//, '').replace(/\/$/, '');
    await mkdir(join(releasePath, routePath), { recursive: true });
    await writeFile(join(releasePath, routePath, 'index.html'), `<!doctype html><title>${page.title}</title>`);
  }
}
let deployedRelease = '';
const service = createPublishService({ repo, env: { SITE_MEDIA_STORAGE_DIR: mediaStorage }, build: async ({ releasePath }) => { await writeValidRelease(releasePath); return { ok: true, log: 'built' }; }, deploy: async ({ releasePath }) => { deployed += 1; deployedRelease = releasePath; return { ok: true, log: 'deployed' }; } });
let result = await service.publish({ adminId: 1 });
assert.equal(result.ok, true);
assert.equal(deployed, 1);
assert.equal(existsSync(join(deployedRelease, 'assets', 'site-media', '2026', '07', 'kep-a1b2c3d4.png')), true);
assert.equal(existsSync(join(deployedRelease, 'assets', 'site-media', '2026', '07', 'video-a1b2c3d4.mp4')), true);
assert.equal(existsSync(join(deployedRelease, 'assets', 'site-media', '2026', '07', 'terms-a1b2c3d4.pdf')), true);
assert.equal(snapshots.at(-1).content_json.settings.length, 1);
assert.equal(snapshots.at(-1).content_json.media.some((m) => m.type === 'application/pdf'), true);
assert.equal(existsSync(join(deployedRelease, 'assets', 'site-media', '2026', '07', 'processing-a1b2c3d4.mp4')), false);
assert.equal(existsSync(join(deployedRelease, 'assets', 'site-media', '2026', '07', 'failed-a1b2c3d4.mp4')), false);
assert.equal(existsSync(join(deployedRelease, 'assets', 'site-media', '2026', '07', 'archived-a1b2c3d4.mp4')), false);
assert.equal(existsSync(join(deployedRelease, 'assets', 'site-media', '2026', '07', 'archived-doc-a1b2c3d4.pdf')), false);
assert.equal(existsSync(join(deployedRelease, 'assets', 'site-media', '2026', '07', 'orphan-a1b2c3d4.mp4')), false);
const smokeMetadata = JSON.parse(await readFile(join(deployedRelease, PUBLIC_SMOKE_METADATA_PATH.replace(/^\//, '')), 'utf8'));
assert.equal(smokeMetadata.source, 'admin-publish-snapshot');
assert.deepEqual(Object.keys(smokeMetadata).sort(), ['defaultCta', 'pages', 'source', 'version']);
assert.deepEqual(Object.keys(smokeMetadata.pages[0]).sort(), ['ctaBlock', 'ctaRole', 'route', 'type']);
assert.equal('blocks' in smokeMetadata.pages[0], false);
assert.equal('settings' in smokeMetadata, false);
assert.equal('media' in smokeMetadata, false);

let buildEnvSeen;
const missingReleasesRoot = join(tmpdir(), `easylink-missing-releases-${Date.now()}-${Math.random().toString(16).slice(2)}`, 'releases');
const dbPublish = createPublishService({ repo, env: { SITE_CONTENT_SOURCE: 'db', SITE_PUBLISH_REPO_DIR: process.cwd(), SITE_PUBLISH_RELEASES_DIR: missingReleasesRoot, SITE_MEDIA_STORAGE_DIR: mediaStorage }, build: async ({ releasePath, content: exportedContent, env }) => { buildEnvSeen = { source: env.SITE_CONTENT_SOURCE, title: exportedContent.pages[0].title, releasePath }; await writeValidRelease(releasePath); return { ok: true, log: 'built-db-content' }; }, deploy: async () => ({ ok: true, log: 'deployed-db-content' }) });
result = await dbPublish.publish({ label: 'deploy publish' });
assert.equal(result.ok, true);
assert.equal((await stat(missingReleasesRoot)).isDirectory(), true);
assert.equal(buildEnvSeen.releasePath.startsWith(`${missingReleasesRoot}/easylink-release-`), true);
assert.deepEqual({ source: buildEnvSeen.source, title: buildEnvSeen.title }, { source: 'db', title: 'Home' });
assert.equal(snapshots.at(-1).label, 'deploy publish');

const webroot = await mkdtemp(join(tmpdir(), 'easylink-webroot-'));
await mkdir(join(webroot, 'nested'), { recursive: true, mode: 0o700 });
await writeFile(join(webroot, 'nested', 'index.html'), '<!doctype html>');
await chmod(webroot, 0o700);
await chmod(join(webroot, 'nested'), 0o700);
await chmod(join(webroot, 'nested', 'index.html'), 0o600);
await ensureWebrootPermissions(webroot);
assert.equal((await stat(webroot)).mode & 0o777, 0o755);
assert.equal((await stat(join(webroot, 'nested'))).mode & 0o777, 0o755);
assert.equal((await stat(join(webroot, 'nested', 'index.html'))).mode & 0o777, 0o644);

const noMediaStorage = createPublishService({ repo, env: { SITE_MEDIA_STORAGE_DIR: join(mediaStorage, 'missing') }, build: async ({ releasePath }) => { await writeValidRelease(releasePath); return { ok: true, log: 'built' }; }, deploy: async ({ releasePath }) => { deployed += 1; deployedRelease = releasePath; return { ok: true }; } });
result = await noMediaStorage.publish();
assert.equal(result.ok, true);
assert.equal(deployed, 2);
const emptyRelease = createPublishService({ repo, build: async () => ({ ok: true, log: 'claimed built but wrote nothing' }), deploy: async () => { deployed += 1; return { ok: true }; } });
result = await emptyRelease.publish();
assert.equal(result.ok, false);
assert.equal(result.liveUnchanged, true);
assert.match(result.error, /üres|index.html|Release/);
assert.equal(deployed, 2);

const missingRoute = createPublishService({ repo, build: async ({ releasePath }) => { await writeFile(join(releasePath, 'index.html'), '<!doctype html>'); return { ok: true }; }, deploy: async () => { deployed += 1; return { ok: true }; } });
result = await missingRoute.publish();
assert.equal(result.ok, false);
assert.match(result.error, /Release route hiányzik/);
assert.equal(deployed, 2);

const failing = createPublishService({ repo, build: async () => ({ ok: false, log: 'compile failed' }), deploy: async () => { deployed += 1; return { ok: true }; } });
result = await failing.publish();
assert.equal(result.ok, false);
assert.equal(result.liveUnchanged, true);
assert.equal(deployed, 2);

let release;
const locked = createPublishService({ repo, build: async ({ releasePath }) => { await writeValidRelease(releasePath); return await new Promise((resolve) => { release = resolve; }); }, deploy: async () => ({ ok: true }) });
const first = locked.publish();
await new Promise((r) => setTimeout(r, 10));
await assert.rejects(() => locked.publish(), /Élesítés folyamatban/);
release({ ok: true, log: '' });
await first;

for (let i = 0; i < 25; i += 1) await service.publish();
assert.ok(snapshots.filter((s) => s.status === 'success').length <= 20);
assert.match(publishPanel({ status: { lastSuccess: snapshots.at(-1), lastError: { build_log_excerpt: 'hiba' } }, snapshots: snapshots.filter((s) => s.status === 'success'), running: true }), /Korábbi élesítések/);
console.log('Publish smoke passed: deterministic snapshots, release validation, webroot permissions, no deploy on invalid release/build, lock, retention and render panel.');
