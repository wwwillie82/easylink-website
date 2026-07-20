import crypto from 'node:crypto';
import { chmod, mkdir, mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { copyMediaToRelease } from './media-storage.mjs';
import { PUBLIC_SMOKE_METADATA_PATH, writePublicSmokeMetadata } from '../content/smoke-metadata.mjs';
import { validateContentReferences, referenceValidationSummary } from '../content/reference-validation.mjs';
import { normalizeRootInvariantRoute, validateRootHomeSnapshot } from '../content/root-invariant.mjs';

const supportedPublishedPageTypes = new Set(['home', 'solutions_index', 'solution_detail', 'audiences_index', 'audience_detail', 'integrations', 'pricing', 'contact', 'content_page']);

export class PublishInProgressError extends Error { constructor() { super('Élesítés folyamatban, próbáld újra később.'); this.code = 'PUBLISH_IN_PROGRESS'; } }

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function contentHash(content) { return crypto.createHash('sha256').update(stableJson(content)).digest('hex'); }

async function exists(filePath) { try { await stat(filePath); return true; } catch { return false; } }

export async function ensureReleasesRoot(releasesRoot) {
  try {
    await mkdir(releasesRoot, { recursive: true });
  } catch (error) {
    throw new Error(`Release gyökérkönyvtár nem hozható létre: ${releasesRoot}. ${error.message}`);
  }
}

export async function ensureWebrootPermissions(webroot) {
  const rootStat = await stat(webroot);
  if (!rootStat.isDirectory()) return;
  async function walk(currentPath) {
    const currentStat = await stat(currentPath);
    if (currentStat.isDirectory()) {
      if ((currentStat.mode & 0o777) < 0o755) await chmod(currentPath, currentStat.mode | 0o755);
      const entries = await readdir(currentPath, { withFileTypes: true });
      for (const entry of entries) await walk(path.join(currentPath, entry.name));
      return;
    }
    if (currentStat.isFile() && (currentStat.mode & 0o777) < 0o644) await chmod(currentPath, currentStat.mode | 0o644);
  }
  await walk(webroot);
}
function normalizeReleaseRoute(route) { return normalizeRootInvariantRoute(route); }
function routeOutputPath(releasePath, route) {
  const clean = normalizeReleaseRoute(route).replace(/^\/+|\/+$/g, '');
  return clean ? path.join(releasePath, clean, 'index.html') : path.join(releasePath, 'index.html');
}
export async function validateRelease(releasePath, content = {}) {
  if (!releasePath || !(await exists(releasePath))) return { ok: false, error: 'Release könyvtár nem létezik.' };
  const entries = await readdir(releasePath);
  if (entries.length === 0) return { ok: false, error: 'Release könyvtár üres.' };
  if (!(await exists(path.join(releasePath, 'index.html')))) return { ok: false, error: 'Release index.html hiányzik.' };
  if (!(await exists(path.join(releasePath, PUBLIC_SMOKE_METADATA_PATH.replace(/^\//, ''))))) return { ok: false, error: 'Live smoke metadata hiányzik.' };
  if (Array.isArray(content.pages)) {
    const rootInvariant = validateRootHomeSnapshot(content.pages);
    if (!rootInvariant.ok) return rootInvariant;
  }
  const pages = Array.isArray(content.pages) ? content.pages.filter((page) => page?.status === undefined || page.status === 'published') : [];
  const seenRoutes = new Map();
  for (const page of pages) {
    const route = String(page.route || '').trim();
    const normalizedRoute = normalizeReleaseRoute(route);
    const title = page.title || `#${page.id || '?'}`;
    const type = String(page.type || 'content_page');
    if (!route) return { ok: false, error: `Published oldal route hiányzik: ${title} (${type})` };
    if (!supportedPublishedPageTypes.has(type)) return { ok: false, error: `Unsupported published page.type: ${title} (${type}) ${route}` };
    if (seenRoutes.has(normalizedRoute)) return { ok: false, error: `Duplikált published route a snapshotban: ${normalizedRoute} (${seenRoutes.get(normalizedRoute)} és ${title})` };
    seenRoutes.set(normalizedRoute, title);
    if (!(await exists(routeOutputPath(releasePath, route)))) return { ok: false, error: `Release route hiányzik: ${title} (${type}) ${route}` };
  }
  return { ok: true };
}

export function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { ...options, shell: false });
    let out = '';
    child.stdout?.on('data', (d) => { out += d; });
    child.stderr?.on('data', (d) => { out += d; });
    child.on('error', (error) => resolve({ ok: false, code: -1, log: error.message }));
    child.on('close', (code) => resolve({ ok: code === 0, code, log: out.slice(-8000) }));
  });
}

export function createBuildFunctions({ env = process.env, build, deploy } = {}) {
  const buildFn = build || (async ({ releasePath }) => runCommand(env.SITE_PUBLISH_BUILD_COMMAND || 'npm', (env.SITE_PUBLISH_BUILD_ARGS || 'run build').split(/\s+/), { cwd: env.SITE_PUBLISH_REPO_DIR || process.cwd(), env: { ...process.env, ...env, SITE_PUBLISH_OUT_DIR: releasePath, OUT_DIR: releasePath } }));
  const deployFn = deploy || (async ({ releasePath, content }) => {
    const webroot = env.SITE_PUBLISH_WEBROOT;
    if (!webroot) return { ok: true, log: 'SITE_PUBLISH_WEBROOT nincs beállítva, deploy kihagyva.' };
    await mkdir(webroot, { recursive: true });
    const result = await runCommand('rsync', ['-a', '--delete', '--delay-updates', `${releasePath}/`, `${webroot}/`]);
    if (result.ok) await ensureWebrootPermissions(webroot);
    return result;
  });
  return { buildFn, deployFn };
}

export async function cleanupPreviewReleases(root, keep = 5) {
  try {
    const entries = (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isDirectory() && entry.name.startsWith('easylink-preview-'));
    const dated = await Promise.all(entries.map(async (entry) => { const full = path.join(root, entry.name); const s = await stat(full); return { full, mtimeMs: s.mtimeMs }; }));
    for (const entry of dated.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(Math.max(0, keep))) await rm(entry.full, { recursive: true, force: true });
  } catch { /* best-effort preview cleanup */ }
}

export async function buildPreviewRelease({ repo, env = process.env, build } = {}) {
  const content = await repo.exportContentSnapshot();
  const releasesRoot = env.SITE_PREVIEW_RELEASES_DIR || env.SITE_PUBLISH_PREVIEW_DIR || path.join(env.SITE_PUBLISH_RELEASES_DIR || tmpdir(), 'previews');
  await ensureReleasesRoot(releasesRoot);
  await cleanupPreviewReleases(releasesRoot, Number(env.SITE_PREVIEW_KEEP || 5));
  const releasePath = await mkdtemp(path.join(releasesRoot, 'easylink-preview-'));
  const { buildFn } = createBuildFunctions({ env, build });
  const built = await buildFn({ releasePath, content, env });
  if (!built.ok) return { ok: false, error: built.log || 'Preview build hiba.', releasePath };
  await writePublicSmokeMetadata(releasePath, content);
  const release = await validateRelease(releasePath, content);
  if (!release.ok) return { ok: false, error: release.error, releasePath };
  await copyMediaToRelease({ releasePath, env, media: content.media });
  return { ok: true, releasePath, content_hash: contentHash(content) };
}

export function createPublishService({ repo, env = process.env, build, deploy } = {}) {
  if (!repo) throw new Error('createPublishService requires repo');
  let locked = false;
  const { buildFn, deployFn } = createBuildFunctions({ env, build, deploy });

  async function publish({ adminId = null, label = null } = {}) {
    if (locked) throw new PublishInProgressError();
    locked = true;
    let releasePath;
    let snapshotId;
    try {
      const content = await repo.exportContentSnapshot();
      const hash = contentHash(content);
      snapshotId = await repo.createPublishSnapshot({ created_by_admin_id: adminId, label, content_json: content, content_hash: hash, status: 'failed' });
      const referenceValidation = validateContentReferences(content);
      if (!referenceValidation.ok) { const excerpt = referenceValidationSummary(referenceValidation); await repo.markPublishFinished(snapshotId, { status: 'failed', build_log_excerpt: excerpt }); return { ok: false, status: 'failed', contentSaved: true, liveUnchanged: true, error: 'A tartalmi referenciák hibásak, ezért az élesítés nem indult el.', details: referenceValidation }; }
      await repo.markPublishStarted(snapshotId);
      const releasesRoot = env.SITE_PUBLISH_RELEASES_DIR || tmpdir();
      await ensureReleasesRoot(releasesRoot);
      releasePath = await mkdtemp(path.join(releasesRoot, 'easylink-release-'));
      const built = await buildFn({ releasePath, content, env });
      if (!built.ok) { await repo.markPublishFinished(snapshotId, { status: 'failed', build_log_excerpt: built.log }); return { ok: false, status: 'failed', contentSaved: true, liveUnchanged: true, error: built.log || 'Build hiba.' }; }
      await writePublicSmokeMetadata(releasePath, content);
      const release = await validateRelease(releasePath, content);
      if (!release.ok) { await repo.markPublishFinished(snapshotId, { status: 'failed', build_log_excerpt: release.error, release_path: releasePath }); return { ok: false, status: 'failed', contentSaved: true, liveUnchanged: true, error: release.error }; }
      const mediaCopy = await copyMediaToRelease({ releasePath, env, media: content.media });
      const deployed = await deployFn({ releasePath, content, env });
      if (!deployed.ok) { await repo.markPublishFinished(snapshotId, { status: 'failed', build_log_excerpt: deployed.log, release_path: releasePath }); return { ok: false, status: 'failed', contentSaved: true, liveUnchanged: true, error: deployed.log || 'Deploy hiba.' }; }
      await repo.markPublishFinished(snapshotId, { status: 'success', build_log_excerpt: `${built.log || ''}\nmedia-copy: ${mediaCopy.skipped ? 'skipped' : `${mediaCopy.copied} files`}\n${deployed.log || ''}`.trim(), release_path: releasePath });
      await repo.prunePublishSnapshots(20);
      return { ok: true, status: 'success', contentSaved: true, published: true, snapshotId, content_hash: hash };
    } finally { locked = false; }
  }
  return { publish, isRunning: () => locked };
}
