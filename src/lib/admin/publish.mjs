import crypto from 'node:crypto';
import { chmod, mkdir, mkdtemp, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { copyMediaToRelease } from './media-storage.mjs';

export class PublishInProgressError extends Error { constructor() { super('Élesítés folyamatban, próbáld újra később.'); this.code = 'PUBLISH_IN_PROGRESS'; } }

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function contentHash(content) { return crypto.createHash('sha256').update(stableJson(content)).digest('hex'); }

async function exists(filePath) { try { await stat(filePath); return true; } catch { return false; } }

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
function routeOutputPath(releasePath, route) {
  const clean = String(route || '').replace(/^\/+|\/+$/g, '');
  return clean ? path.join(releasePath, clean, 'index.html') : path.join(releasePath, 'index.html');
}
export async function validateRelease(releasePath, content = {}) {
  if (!releasePath || !(await exists(releasePath))) return { ok: false, error: 'Release könyvtár nem létezik.' };
  const entries = await readdir(releasePath);
  if (entries.length === 0) return { ok: false, error: 'Release könyvtár üres.' };
  if (!(await exists(path.join(releasePath, 'index.html')))) return { ok: false, error: 'Release index.html hiányzik.' };
  const routes = (content.pages || []).map((page) => page.route).filter(Boolean).slice(0, 5);
  for (const route of routes) {
    if (!(await exists(routeOutputPath(releasePath, route)))) return { ok: false, error: `Release route hiányzik: ${route}` };
  }
  return { ok: true };
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { ...options, shell: false });
    let out = '';
    child.stdout?.on('data', (d) => { out += d; });
    child.stderr?.on('data', (d) => { out += d; });
    child.on('error', (error) => resolve({ ok: false, code: -1, log: error.message }));
    child.on('close', (code) => resolve({ ok: code === 0, code, log: out.slice(-8000) }));
  });
}

export function createPublishService({ repo, env = process.env, build, deploy } = {}) {
  if (!repo) throw new Error('createPublishService requires repo');
  let locked = false;
  const buildFn = build || (async ({ releasePath }) => runCommand(env.SITE_PUBLISH_BUILD_COMMAND || 'npm', (env.SITE_PUBLISH_BUILD_ARGS || 'run build').split(/\s+/), { cwd: env.SITE_PUBLISH_REPO_DIR || process.cwd(), env: { ...process.env, ...env, SITE_PUBLISH_OUT_DIR: releasePath, OUT_DIR: releasePath } }));
  const deployFn = deploy || (async ({ releasePath }) => {
    const webroot = env.SITE_PUBLISH_WEBROOT;
    if (!webroot) return { ok: true, log: 'SITE_PUBLISH_WEBROOT nincs beállítva, deploy kihagyva.' };
    await mkdir(webroot, { recursive: true });
    // Best-effort safe deploy for shared hosting: build already happened in a temp release dir;
    // rsync uses delayed updates so the current webroot is only touched after a complete successful build.
    const result = await runCommand('rsync', ['-a', '--delete', '--delay-updates', `${releasePath}/`, `${webroot}/`]);
    if (result.ok) await ensureWebrootPermissions(webroot);
    return result;
  });

  async function publish({ adminId = null, label = null } = {}) {
    if (locked) throw new PublishInProgressError();
    locked = true;
    let releasePath;
    let snapshotId;
    try {
      const content = await repo.exportContentSnapshot();
      const hash = contentHash(content);
      snapshotId = await repo.createPublishSnapshot({ created_by_admin_id: adminId, label, content_json: content, content_hash: hash, status: 'failed' });
      await repo.markPublishStarted(snapshotId);
      releasePath = await mkdtemp(path.join(env.SITE_PUBLISH_RELEASES_DIR || tmpdir(), 'easylink-release-'));
      const built = await buildFn({ releasePath, content, env });
      if (!built.ok) { await repo.markPublishFinished(snapshotId, { status: 'failed', build_log_excerpt: built.log }); return { ok: false, status: 'failed', contentSaved: true, liveUnchanged: true, error: built.log || 'Build hiba.' }; }
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
