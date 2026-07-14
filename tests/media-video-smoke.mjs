import assert from 'node:assert/strict';
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { signSession, sessionCookie } from '../src/lib/admin/auth.mjs';
import { createAdminServer } from '../src/lib/admin/server.mjs';
import { Readable } from 'node:stream';
import { parseMediaMultipart } from '../src/lib/admin/multipart-upload.mjs';
import { acquireWorkerLock, chooseBestOutput, probeVideo, processOneMediaJob, runMediaWorker, shouldTryCrf25, transcodeVideo } from '../src/lib/admin/video-processing.mjs';

const mp4 = Buffer.concat([Buffer.from([0,0,0,24]), Buffer.from('ftypisom'), Buffer.alloc(32), Buffer.from('mdat')]);
const root = await mkdtemp(join(tmpdir(), 'easylink-video-'));
const env = { SITE_MEDIA_STORAGE_DIR: join(root, 'storage'), SITE_MEDIA_STAGING_DIR: join(root, 'staging'), SITE_MEDIA_MAX_BYTES: '80', SITE_MEDIA_VIDEO_MAX_BYTES: '1024', SITE_MEDIA_WORKER_POLL_MS: '25', SITE_MEDIA_WORKER_LOCK_FILE: join(root, 'worker.lock') };
const state = { nextMediaId: 1, media: [] };
const repo = {
  async listMedia() { return state.media.filter((m) => m.status !== 'archived'); },
  async getMedia(id) { return state.media.find((m) => String(m.id) === String(id)) || null; },
  async createMedia(p) { const m = { id: state.nextMediaId++, status: 'active', processing_status: 'ready', ...p, created_at: new Date().toISOString() }; state.media.push(m); return m; },
  async updateMedia(id, p) { const m = await this.getMedia(id); if (!m) return null; Object.assign(m, p); return m; },
  async archiveMedia(id) { const m = await this.getMedia(id); if (!m) return null; m.status = 'archived'; return m; },
  async claimNextMediaProcessingJob() { const m = state.media.find((x) => x.processing_status === 'queued' && x.status !== 'archived' && !x.claimed); if (!m) return null; m.claimed = true; m.processing_status = 'processing'; m.processing_started_at = new Date(); return { ...m }; },
  async recoverStaleMediaProcessingJobs({ timeoutSeconds = 3600 } = {}) { const cutoff = Date.now() - timeoutSeconds * 1000; let n = 0; for (const m of state.media) if (m.processing_status === 'processing' && m.processing_started_at && new Date(m.processing_started_at).getTime() < cutoff) { m.processing_status = 'queued'; m.processing_started_at = null; m.processing_error = 'Stale processing job recovered.'; m.claimed = false; n += 1; } return n; },
  async markMediaReady(id, p) { const m = await this.getMedia(id); Object.assign(m, p, { processing_status: 'ready', staging_path: null }); return m; },
  async markMediaFailed(id, p) { const m = await this.getMedia(id); Object.assign(m, p, { processing_status: 'failed', staging_path: null }); return m; },
};

function reqFromChunks(chunks, boundary) { const r = Readable.from(chunks); r.headers = { 'content-type': `multipart/form-data; boundary=${boundary}` }; return r; }
function multipartBody(boundary, { secondFile = false } = {}) { return Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="alt"\r\n\r\nAlt\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="video.mp4"\r\nContent-Type: video/mp4\r\n\r\n${mp4.toString('binary')}\r\n${secondFile ? `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="x.mp4"\r\nContent-Type: video/mp4\r\n\r\nx\r\n` : ''}--${boundary}--\r\n`, 'binary'); }
const boundary = 'AaB03x';
const body = multipartBody(boundary);
const chunked = await parseMediaMultipart(reqFromChunks(Array.from({ length: Math.ceil(body.length / 2) }, (_, i) => body.subarray(i * 2, i * 2 + 2)), boundary), { env, maxBytes: 4096 });
assert.equal(chunked.fields.alt, 'Alt');
assert.equal(chunked.file.contentType, 'video/mp4');
assert.equal(existsSync(chunked.file.stagingPath), true);

async function stagingEntries(dir) { try { return await readdir(dir); } catch { return []; } }
async function fileCount(dir) { let n = 0; for (const entry of await stagingEntries(dir)) { const full = join(dir, entry); const s = await stat(full).catch(() => null); if (s?.isDirectory()) n += await fileCount(full); else if (s?.isFile()) n += 1; } return n; }
async function withTimeout(promise, ms = 500) { let t; try { return await Promise.race([promise, new Promise((_, reject) => { t = setTimeout(() => reject(new Error('timeout')), ms); })]); } finally { clearTimeout(t); } }
const okEntries = await stagingEntries(env.SITE_MEDIA_STAGING_DIR);
assert.equal(okEntries.length, 1);
const abortReq = reqFromChunks([body], boundary);
const abortPromise = parseMediaMultipart(abortReq, { env, maxBytes: 4096 });
abortReq.emit('aborted');
await assert.rejects(() => withTimeout(abortPromise), /Megszakadt|aborted|Médiafájl/);
await rm(env.SITE_MEDIA_STAGING_DIR, { recursive: true, force: true });
const delayedFactory = async (name, e) => { await new Promise((r) => setTimeout(r, 25)); return join(e.SITE_MEDIA_STAGING_DIR, `delayed-${name}`); };
const abortInitReq = reqFromChunks([body], boundary);
const abortInit = parseMediaMultipart(abortInitReq, { env, maxBytes: 4096, stagingPathFactory: delayedFactory });
setTimeout(() => abortInitReq.emit('aborted'), 1);
await assert.rejects(() => withTimeout(abortInit), /Megszakadt|aborted|Médiafájl/);
assert.deepEqual(await stagingEntries(env.SITE_MEDIA_STAGING_DIR), []);
const longAlt = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="alt"\r\n\r\n${'x'.repeat(9000)}\r\n--${boundary}--\r\n`);
await assert.rejects(() => parseMediaMultipart(reqFromChunks([longAlt], boundary), { env, maxBytes: 20000 }), /hosszú|mező|Médiafájl/);
assert.deepEqual(await stagingEntries(env.SITE_MEDIA_STAGING_DIR), []);
const hugeBody = Buffer.concat([body, Buffer.alloc(9000)]);
await assert.rejects(() => parseMediaMultipart(reqFromChunks([hugeBody], boundary), { env, maxBytes: 10 }), /túl nagy/);
assert.deepEqual(await stagingEntries(env.SITE_MEDIA_STAGING_DIR), []);
const failingWriteFactory = (filePath, options) => { const s = createWriteStream(filePath, options); queueMicrotask(() => s.destroy(new Error('write boom'))); return s; };
await assert.rejects(() => withTimeout(parseMediaMultipart(reqFromChunks([body], boundary), { env, maxBytes: 4096, writeStreamFactory: failingWriteFactory })), /write boom|Premature close|aborted/);
assert.deepEqual(await stagingEntries(env.SITE_MEDIA_STAGING_DIR), []);

const multiBody = multipartBody(boundary, { secondFile: true });
await assert.rejects(() => parseMediaMultipart(reqFromChunks([multiBody], boundary), { env, maxBytes: 4096 }), /egy médiafájl|Túl sok multipart rész/);
const abortBody = body.subarray(0, Math.floor(body.length / 2));
await assert.rejects(() => parseMediaMultipart(reqFromChunks([abortBody], boundary), { env, maxBytes: 4096 }), /Médiafájl|feltöltés|boundary|szükséges/);

assert.equal(shouldTryCrf25({ originalSize: 1000, crf23Size: 260 }), true);


assert.equal(shouldTryCrf25({ originalSize: 1000, crf23Size: 240 }), false);
assert.equal(chooseBestOutput({ originalSize: 1000, attempts: [{ crf: 23, ok: true, size: 500 }, { crf: 25, ok: true, size: 300 }] }).crf, 25);
assert.equal(chooseBestOutput({ originalSize: 1000, attempts: [{ crf: 23, ok: false }, { crf: 25, ok: false }] }), null);
await assert.rejects(() => probeVideo('/tmp/nope.mp4', { env: { ...env, SITE_MEDIA_FFPROBE_PATH: '/missing/ffprobe' } }), /ffprobe nem érhető el/);
const goodProbe = async () => ({ duration: 2.5, width: 640, height: 360, videoCodec: 'h264', audioCodec: 'aac' });
let calls = [];
const work = await mkdtemp(join(tmpdir(), 'easylink-video-work-'));
const input = join(work, 'in.mp4'); await writeFile(input, mp4);
const output = join(work, 'out.mp4');
const runner = async (cmd, args) => { calls.push(args); const out = args.at(-1); await writeFile(out, Buffer.alloc(args.includes('23') ? 400 : 200)); return { ok: true, code: 0, stdout: '{}', stderr: '' }; };
const tx = await transcodeVideo({ inputPath: input, outputPath: output, env, runner, probe: goodProbe });
assert.equal(tx.crf, 25);
assert.equal((await stat(output)).size, 200);
assert.equal(calls.length, 2);
const runnerOne = async (cmd, args) => { await writeFile(args.at(-1), Buffer.alloc(200)); return { ok: true, code: 0, stdout: '{}', stderr: '' }; };
await writeFile(input, Buffer.alloc(1000));
await transcodeVideo({ inputPath: input, outputPath: output, env, runner: runnerOne, probe: goodProbe });
assert.equal(existsSync(output), true);
assert.equal(existsSync(`${output}.crf23.tmp.mp4`), false);
await assert.rejects(() => transcodeVideo({ inputPath: input, outputPath: output, env, runner: async () => ({ ok: false, code: -1, stderr: 'missing' }), probe: goodProbe }), /ffmpeg nem érhető el/);

// Claim and stale recovery.
state.media.push({ id: 10, path: '/assets/site-media/2026/07/a.mp4', type: 'video/mp4', status: 'active', processing_status: 'queued' });
const [claimA, claimB] = await Promise.all([repo.claimNextMediaProcessingJob(), repo.claimNextMediaProcessingJob()]);
assert.equal(claimA.id, 10);
assert.equal(claimB, null);
state.media.push({ id: 11, path: '/assets/site-media/2026/07/b.mp4', type: 'video/mp4', status: 'active', processing_status: 'processing', processing_started_at: new Date() });
assert.equal(await repo.claimNextMediaProcessingJob(), null);
assert.equal(await repo.recoverStaleMediaProcessingJobs({ timeoutSeconds: 3600 }), 0);
state.media.find((m) => m.id === 11).processing_started_at = new Date(Date.now() - 7200_000);
assert.equal(await repo.recoverStaleMediaProcessingJobs({ timeoutSeconds: 3600 }), 1);
assert.equal(state.media.find((m) => m.id === 11).processing_status, 'queued');
assert.equal(state.media.find((m) => m.id === 11).processing_started_at, null);
state.media.length = 0;

// Worker lifecycle and cleanup.
const staging = join(work, 'stage.mp4'); await writeFile(staging, Buffer.alloc(1000));
state.media.push({ id: 99, path: '/assets/site-media/2026/07/video-a1b2c3d4.mp4', alt: '', type: 'video/mp4', status: 'active', processing_status: 'queued', staging_path: staging, original_size_bytes: 1000 });
const result = await processOneMediaJob({ repo, env, runner: runnerOne, probe: goodProbe });
assert.equal(result.ok, true);
assert.equal(state.media.at(-1).processing_status, 'ready');
assert.equal(state.media.at(-1).staging_path, null);
assert.equal(existsSync(staging), false);
assert.equal(existsSync(join(env.SITE_MEDIA_STORAGE_DIR, '2026', '07', 'video-a1b2c3d4.mp4')), true);
const badStage = join(work, 'bad.mp4'); await writeFile(badStage, Buffer.alloc(1000));
state.media.push({ id: 100, path: '/assets/site-media/2026/07/bad-a1b2c3d4.mp4', alt: '', type: 'video/mp4', status: 'active', processing_status: 'queued', staging_path: badStage, original_size_bytes: 1000 });
const failed = await processOneMediaJob({ repo, env, runner: async () => ({ ok: false, code: 2, stderr: 'convert failed' }), probe: goodProbe });
assert.equal(failed.ok, false);
assert.equal(state.media.at(-1).processing_status, 'failed');
assert.equal(state.media.at(-1).staging_path, null);
assert.match(state.media.at(-1).processing_error, /convert failed/);
assert.equal(existsSync(badStage), false);
assert.equal(existsSync(join(env.SITE_MEDIA_STORAGE_DIR, '2026', '07', 'bad-a1b2c3d4.mp4')), false);

async function jobPersistenceScenario({ id, failReady = false, failFailed = false, runnerImpl = runnerOne } = {}) {
  const dir = await mkdtemp(join(tmpdir(), `easylink-job-${id}-`));
  const scenarioEnv = { ...env, SITE_MEDIA_STORAGE_DIR: join(dir, 'storage'), SITE_MEDIA_STAGING_DIR: join(dir, 'staging') };
  const stage = join(dir, 'stage.mp4');
  await writeFile(stage, Buffer.alloc(1000));
  const media = { id, path: `/assets/site-media/2026/07/scenario-${id}.mp4`, type: 'video/mp4', status: 'active', processing_status: 'queued', staging_path: stage };
  const scenarioRepo = {
    async claimNextMediaProcessingJob() { if (media.processing_status !== 'queued') return null; media.processing_status = 'processing'; return { ...media }; },
    async markMediaReady(mediaId, patch) { if (failReady) throw new Error('ready db failed'); Object.assign(media, patch, { processing_status: 'ready', staging_path: null }); return media; },
    async markMediaFailed(mediaId, patch) { if (failFailed) throw new Error('failed db failed'); Object.assign(media, patch, { processing_status: 'failed', staging_path: null }); return media; },
  };
  const outcome = await processOneMediaJob({ repo: scenarioRepo, env: scenarioEnv, runner: runnerImpl, probe: goodProbe });
  return { outcome, media, stage, finalPath: join(scenarioEnv.SITE_MEDIA_STORAGE_DIR, '2026', '07', `scenario-${id}.mp4`) };
}
const readySaved = await jobPersistenceScenario({ id: 201 });
assert.equal(readySaved.outcome.ok, true);
assert.equal(existsSync(readySaved.stage), false);
assert.equal(existsSync(readySaved.finalPath), true);
const transcodeFailedSaved = await jobPersistenceScenario({ id: 202, runnerImpl: async () => ({ ok: false, code: 2, stderr: 'convert failed' }) });
assert.equal(transcodeFailedSaved.outcome.ok, false);
assert.equal(transcodeFailedSaved.media.processing_status, 'failed');
assert.equal(existsSync(transcodeFailedSaved.stage), false);
assert.equal(existsSync(transcodeFailedSaved.finalPath), false);
const readyFailedThenFailedSaved = await jobPersistenceScenario({ id: 203, failReady: true });
assert.equal(readyFailedThenFailedSaved.outcome.ok, false);
assert.equal(readyFailedThenFailedSaved.media.processing_status, 'failed');
assert.equal(existsSync(readyFailedThenFailedSaved.stage), false);
assert.equal(existsSync(readyFailedThenFailedSaved.finalPath), false);
const readyAndFailedDbFailed = await jobPersistenceScenario({ id: 204, failReady: true, failFailed: true });
assert.equal(readyAndFailedDbFailed.outcome.ok, false);
assert.equal(readyAndFailedDbFailed.outcome.terminalStateSaved, false);
assert.equal(existsSync(readyAndFailedDbFailed.stage), true);
assert.equal(existsSync(readyAndFailedDbFailed.finalPath), false);
const transcodeAndFailedDbFailed = await jobPersistenceScenario({ id: 205, failFailed: true, runnerImpl: async () => ({ ok: false, code: 2, stderr: 'convert failed' }) });
assert.equal(transcodeAndFailedDbFailed.outcome.ok, false);
assert.equal(transcodeAndFailedDbFailed.outcome.terminalStateSaved, false);
assert.equal(existsSync(transcodeAndFailedDbFailed.stage), true);
assert.equal(existsSync(transcodeAndFailedDbFailed.finalPath), false);


// Real filesystem worker lock behavior.
const lockBase = await mkdtemp(join(tmpdir(), 'easylink-lock-'));
const lockPath = join(lockBase, 'worker.lock.d');
const lockEnv = { ...env, SITE_MEDIA_WORKER_LOCK_FILE: lockPath, SITE_MEDIA_WORKER_LOCK_STALE_SECONDS: '1' };
const firstLock = await acquireWorkerLock(lockEnv);
await assert.rejects(() => acquireWorkerLock(lockEnv), (error) => error.code === 'MEDIA_WORKER_LOCKED');
await firstLock.release();
assert.equal(existsSync(lockPath), false);
const secondLock = await acquireWorkerLock(lockEnv);
await secondLock.release();
await mkdir(lockPath, { recursive: true });
await writeFile(join(lockPath, 'lock.json'), JSON.stringify({ pid: 99999999, createdAt: new Date().toISOString(), token: 'dead', command: 'node scripts/media-worker.mjs' }));
const deadLock = await acquireWorkerLock(lockEnv);
await deadLock.release();
await mkdir(lockPath, { recursive: true });
await assert.rejects(() => acquireWorkerLock(lockEnv), (error) => error.code === 'MEDIA_WORKER_LOCKED');
await rm(lockPath, { recursive: true, force: true });
await mkdir(lockPath, { recursive: true });
await new Promise((r) => setTimeout(r, 1100));
const staleBad = await acquireWorkerLock(lockEnv);
await staleBad.release();
const [pa, pb] = await Promise.allSettled([acquireWorkerLock(lockEnv), acquireWorkerLock(lockEnv)]);
assert.equal([pa, pb].filter((r) => r.status === 'fulfilled').length, 1);
await (pa.status === 'fulfilled' ? pa.value : pb.value).release();
await mkdir(lockPath, { recursive: true });
await writeFile(join(lockPath, 'lock.json'), JSON.stringify({ pid: 99999998, token: 'old', command: 'node scripts/media-worker.mjs' }));
await new Promise((r) => setTimeout(r, 1100));
const staleResults = await Promise.allSettled([acquireWorkerLock(lockEnv), acquireWorkerLock(lockEnv)]);
assert.equal(staleResults.filter((r) => r.status === 'fulfilled').length, 1);
await staleResults.find((r) => r.status === 'fulfilled').value.release();

await mkdir(lockPath, { recursive: true });
await writeFile(join(lockPath, 'lock.json'), JSON.stringify({ pid: 99999997, token: 'old-race', command: 'node scripts/media-worker.mjs' }));
await new Promise((r) => setTimeout(r, 1100));
let staleReaders = 0;
let releaseA;
let releaseB;
const waitA = new Promise((resolve) => { releaseA = resolve; });
const waitB = new Promise((resolve) => { releaseB = resolve; });
const raceA = acquireWorkerLock(lockEnv, { beforeStaleRename: async () => { staleReaders += 1; await waitA; } });
const raceB = acquireWorkerLock(lockEnv, { beforeStaleRename: async () => { staleReaders += 1; await waitB; } });
while (staleReaders < 2) await new Promise((r) => setTimeout(r, 5));
releaseA();
const winner = await raceA;
assert.equal(existsSync(lockPath), true);
releaseB();
await assert.rejects(() => raceB, (error) => error.code === 'MEDIA_WORKER_LOCKED');
await winner.release();
assert.equal(existsSync(lockPath), false);

await mkdir(lockPath, { recursive: true });
await writeFile(join(lockPath, 'lock.json'), JSON.stringify({ pid: 99999996, token: 'old-generation', command: 'node scripts/media-worker.mjs' }));
await new Promise((r) => setTimeout(r, 1100));
let delayedSawStale = false;
let releaseDelayed;
const delayedGate = new Promise((resolve) => { releaseDelayed = resolve; });
const delayedStale = acquireWorkerLock(lockEnv, { beforeStaleRename: async () => { delayedSawStale = true; await delayedGate; } });
while (!delayedSawStale) await new Promise((r) => setTimeout(r, 5));
const takeoverWinner = await acquireWorkerLock(lockEnv);
await takeoverWinner.release();
const freshLock = await acquireWorkerLock(lockEnv);
releaseDelayed();
await assert.rejects(() => delayedStale, (error) => error.code === 'MEDIA_WORKER_LOCKED');
assert.equal(existsSync(lockPath), true);
await freshLock.release();
assert.equal(existsSync(lockPath), false);
assert.equal(existsSync(`${lockPath}.takeover`), false);

await mkdir(lockPath, { recursive: true });
await writeFile(join(lockPath, 'lock.json'), JSON.stringify({ pid: 99999994, command: 'node scripts/media-worker.mjs' }));
await new Promise((r) => setTimeout(r, 1100));
let tokenlessDelayedSawStale = false;
let releaseTokenlessDelayed;
const tokenlessGate = new Promise((resolve) => { releaseTokenlessDelayed = resolve; });
const tokenlessDelayed = acquireWorkerLock(lockEnv, { beforeStaleRename: async () => { tokenlessDelayedSawStale = true; await tokenlessGate; } });
while (!tokenlessDelayedSawStale) await new Promise((r) => setTimeout(r, 5));
const tokenlessWinner = await acquireWorkerLock(lockEnv);
await tokenlessWinner.release();
const tokenlessFresh = await acquireWorkerLock(lockEnv);
const freshToken = JSON.parse(await readFile(join(lockPath, 'lock.json'), 'utf8')).token;
releaseTokenlessDelayed();
await assert.rejects(() => tokenlessDelayed, (error) => error.code === 'MEDIA_WORKER_LOCKED');
assert.equal(JSON.parse(await readFile(join(lockPath, 'lock.json'), 'utf8')).token, freshToken);
assert.equal(existsSync(`${lockPath}.takeover`), false);
await tokenlessFresh.release();
assert.equal(existsSync(lockPath), false);

await mkdir(lockPath, { recursive: true });
await writeFile(join(lockPath, 'lock.json'), JSON.stringify({ pid: 99999995, token: 'old-write-fail', command: 'node scripts/media-worker.mjs' }));
await new Promise((r) => setTimeout(r, 1100));
await assert.rejects(() => acquireWorkerLock(lockEnv, { writeFileImpl: async () => { throw new Error('takeover metadata fail'); } }), /takeover metadata fail/);
assert.equal(existsSync(lockPath), false);
assert.equal(existsSync(`${lockPath}.takeover`), false);
await assert.rejects(() => acquireWorkerLock(lockEnv, { writeFileImpl: async () => { throw new Error('metadata fail'); } }), /metadata fail/);
assert.equal(existsSync(lockPath), false);

// Worker modes.
state.media.length = 0;
const onceEmpty = await runMediaWorker({ repo, env: { ...env, SITE_MEDIA_WORKER_LOCK_FILE: join(root, 'once.lock') }, once: true, lock: true, probe: goodProbe, runner: runnerOne });
assert.deepEqual({ ok: onceEmpty.ok, processed: onceEmpty.processed }, { ok: true, processed: 0 });
const controller = new AbortController();
const daemon = runMediaWorker({ repo, env: { ...env, SITE_MEDIA_WORKER_LOCK_FILE: join(root, 'daemon.lock'), SITE_MEDIA_WORKER_POLL_MS: '20' }, signal: controller.signal, lock: true, probe: goodProbe, runner: runnerOne, logger: { error() {} } });
await new Promise((r) => setTimeout(r, 75));
controller.abort();
const daemonResult = await daemon;
assert.equal(daemonResult.stopped, true);
assert.equal(daemonResult.processed, 0);


// Full API orphan cleanup when createMedia fails.
async function failingUploadServer(kind) {
  const dir = await mkdtemp(join(tmpdir(), `easylink-orphan-${kind}-`));
  const user = { id: 1, email: 'admin@example.test', status: 'active' };
  const failingRepo = {
    async adminByEmail(email) { return email === user.email ? user : null; },
    async findAdminUserByEmail(email) { return email === user.email ? user : null; },
    async markAdminLogin() {},
    async listMedia() { return []; },
    async getMedia() { return null; },
    async createMedia() { throw new Error('createMedia failed'); },
  };
  const server = createAdminServer({ repo: failingRepo, env: { SITE_ADMIN_SESSION_SECRET: 's'.repeat(32), NODE_ENV: 'test', SITE_MEDIA_STORAGE_DIR: join(dir, 'storage'), SITE_MEDIA_STAGING_DIR: join(dir, 'staging'), SITE_MEDIA_MAX_BYTES: '1024', SITE_MEDIA_VIDEO_MAX_BYTES: '1024' }, publishService: { publish: async () => ({ ok: true }) } });
  server.listen(0); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const cookie = sessionCookie(signSession(user, { SITE_ADMIN_SESSION_SECRET: 's'.repeat(32), NODE_ENV: 'test' }));
  const fd = new FormData();
  if (kind === 'image') fd.set('file', new Blob([new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0])], { type: 'image/png' }), 'kep.png');
  else fd.set('file', new Blob([mp4], { type: 'video/mp4' }), 'video.mp4');
  const response = await fetch(`${base}/api/admin/media`, { method: 'POST', headers: { cookie }, body: fd });
  assert.equal(response.status, 500);
  server.close(); await once(server, 'close');
  assert.deepEqual(await stagingEntries(join(dir, 'staging')), []);
  assert.equal(await fileCount(join(dir, 'storage')), 0);
}
await failingUploadServer('image');
await failingUploadServer('video');

console.log('Media video smoke passed: probe stubs, quality decisions, claims, recovery, worker lifecycle, cleanup and daemon modes.');
