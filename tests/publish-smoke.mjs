import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createPublishService, contentHash, ensureWebrootPermissions, stableJson } from '../src/lib/admin/publish.mjs';
import { publishPanel } from '../src/lib/admin/render.mjs';

const content = { navigation: [{ id: 1, title: 'A' }], pages: [{ id: 1, route: '/', title: 'Home' }, { id: 2, route: '/arak/', title: 'Árak' }], blocks: [], settings: [], media: [] };
assert.equal(stableJson({ b: 1, a: 2 }), stableJson({ a: 2, b: 1 }));
assert.equal(contentHash(content), contentHash(structuredClone(content)));

const snapshots = [];
let nextId = 1;
let deployed = 0;
const repo = {
  async exportContentSnapshot() { return structuredClone(content); },
  async createPublishSnapshot(s) { snapshots.push({ id: nextId, ...s }); return nextId++; },
  async markPublishStarted(id) { snapshots.find((s) => s.id === id).build_started_at = true; },
  async markPublishFinished(id, p) { Object.assign(snapshots.find((s) => s.id === id), p, { is_current: p.status === 'success' ? 1 : 0 }); },
  async prunePublishSnapshots(limit) { const success = snapshots.filter((s) => s.status === 'success'); for (const old of success.slice(0, Math.max(0, success.length - limit))) snapshots.splice(snapshots.indexOf(old), 1); },
};
async function writeValidRelease(releasePath) {
  await mkdir(join(releasePath, 'arak'), { recursive: true });
  await writeFile(join(releasePath, 'index.html'), '<!doctype html><title>Home</title>');
  await writeFile(join(releasePath, 'arak', 'index.html'), '<!doctype html><title>Árak</title>');
}
const service = createPublishService({ repo, build: async ({ releasePath }) => { await writeValidRelease(releasePath); return { ok: true, log: 'built' }; }, deploy: async () => { deployed += 1; return { ok: true, log: 'deployed' }; } });
let result = await service.publish({ adminId: 1 });
assert.equal(result.ok, true);
assert.equal(deployed, 1);

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

const emptyRelease = createPublishService({ repo, build: async () => ({ ok: true, log: 'claimed built but wrote nothing' }), deploy: async () => { deployed += 1; return { ok: true }; } });
result = await emptyRelease.publish();
assert.equal(result.ok, false);
assert.equal(result.liveUnchanged, true);
assert.match(result.error, /üres|index.html|Release/);
assert.equal(deployed, 1);

const missingRoute = createPublishService({ repo, build: async ({ releasePath }) => { await writeFile(join(releasePath, 'index.html'), '<!doctype html>'); return { ok: true }; }, deploy: async () => { deployed += 1; return { ok: true }; } });
result = await missingRoute.publish();
assert.equal(result.ok, false);
assert.match(result.error, /Release route hiányzik/);
assert.equal(deployed, 1);

const failing = createPublishService({ repo, build: async () => ({ ok: false, log: 'compile failed' }), deploy: async () => { deployed += 1; return { ok: true }; } });
result = await failing.publish();
assert.equal(result.ok, false);
assert.equal(result.liveUnchanged, true);
assert.equal(deployed, 1);

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
