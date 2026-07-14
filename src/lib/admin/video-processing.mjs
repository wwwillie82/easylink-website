import { spawn } from 'node:child_process';
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mediaConfig, removeFileQuietly, storagePathForPublicPath } from './media-storage.mjs';

export function ffmpegDiagnostic(binary, label) { const e = new Error(`${label} nem érhető el vagy nem futtatható: ${binary}. Telepítsd az FFmpeg 6.1.1 csomagot, vagy állítsd be a megfelelő env útvonalat.`); e.code = `${label.toUpperCase()}_MISSING`; return e; }
export function runProcess(command, args, { timeoutMs = 120000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { shell: false });
    let stdout = ''; let stderr = ''; const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout?.on('data', (d) => { stdout += d; }); child.stderr?.on('data', (d) => { stderr += d; });
    child.on('error', (error) => { clearTimeout(timer); resolve({ ok: false, code: -1, stdout, stderr: error.message }); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ ok: code === 0, code, stdout, stderr }); });
  });
}
export async function probeVideo(filePath, { env = process.env, runner = runProcess } = {}) {
  const cfg = mediaConfig(env);
  const result = await runner(cfg.ffprobePath, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', filePath]);
  if (!result.ok) { if (result.code === -1) throw ffmpegDiagnostic(cfg.ffprobePath, 'ffprobe'); throw new Error(`Az ffprobe nem tudta olvasni a videót: ${result.stderr || result.stdout || 'ismeretlen hiba'}`); }
  let data; try { data = JSON.parse(result.stdout || '{}'); } catch { throw new Error('Az ffprobe érvénytelen JSON választ adott.'); }
  const video = (data.streams || []).find((s) => s.codec_type === 'video');
  if (!video) throw new Error('A feltöltött MP4 nem tartalmaz videó streamet.');
  const duration = Number(video.duration || data.format?.duration || 0);
  const width = Number(video.width || 0); const height = Number(video.height || 0);
  if (!Number.isFinite(duration) || duration <= 0 || !width || !height) throw new Error('A videó időtartama vagy felbontása nem értelmezhető.');
  return { duration, width, height, videoCodec: video.codec_name || '', audioCodec: (data.streams || []).find((s) => s.codec_type === 'audio')?.codec_name || '', formatName: data.format?.format_name || '' };
}
export function ffmpegArgs(input, output, crf) {
  return ['-y', '-i', input, '-map', '0:v:0', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'medium', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-vf', "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease,fps='min(30,source_fps)'", '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', output];
}
export function chooseBestOutput({ originalSize, attempts }) { const valid = attempts.filter((a) => a.ok && a.size > 0).sort((a, b) => a.size - b.size || a.crf - b.crf); return valid[0] || null; }
export function shouldTryCrf25({ originalSize, crf23Size }) { return crf23Size > originalSize * 0.25; }
export async function transcodeVideo({ inputPath, outputPath, env = process.env, runner = runProcess, probe = probeVideo } = {}) {
  const cfg = mediaConfig(env);
  await probe(inputPath, { env, runner });
  const dir = path.dirname(outputPath); await mkdir(dir, { recursive: true });
  const tempDir = path.join(cfg.stagingRoot, 'worker-tmp'); await mkdir(tempDir, { recursive: true });
  const attempts = [];
  const tempPaths = [];
  try {
    for (const crf of [23, 25]) {
      const tmp = path.join(tempDir, `${path.basename(outputPath)}.${process.pid}.${Date.now()}.crf${crf}.tmp.mp4`);
      tempPaths.push(tmp);
      await removeFileQuietly(tmp);
      const converted = await runner(cfg.ffmpegPath, ffmpegArgs(inputPath, tmp, crf));
      if (!converted.ok) { if (converted.code === -1) throw ffmpegDiagnostic(cfg.ffmpegPath, 'ffmpeg'); attempts.push({ crf, ok: false, error: converted.stderr || converted.stdout || 'FFmpeg hiba.' }); await removeFileQuietly(tmp); }
      else {
        try { const meta = await probe(tmp, { env, runner }); const s = await stat(tmp); attempts.push({ crf, ok: true, path: tmp, size: s.size, meta }); }
        catch (error) { attempts.push({ crf, ok: false, error: error.message }); await removeFileQuietly(tmp); }
      }
      if (crf === 23) { const first = attempts.at(-1); if (!first?.ok || !shouldTryCrf25({ originalSize: (await stat(inputPath)).size, crf23Size: first.size })) break; }
    }
    const originalSize = (await stat(inputPath)).size;
    const best = chooseBestOutput({ originalSize, attempts });
    if (!best) throw new Error(attempts.find((a) => a.error)?.error || 'A videó feldolgozása sikertelen.');
    await removeFileQuietly(outputPath);
    await rename(best.path, outputPath);
    return { originalSize, finalSize: best.size, crf: best.crf, duration: best.meta.duration, width: best.meta.width, height: best.meta.height, attempts };
  } finally { await Promise.all(tempPaths.map((p) => removeFileQuietly(p))); }
}
export async function processOneMediaJob({ repo, env = process.env, runner = runProcess, probe = probeVideo } = {}) {
  const job = await repo.claimNextMediaProcessingJob();
  if (!job) return { ok: true, processed: false };
  const failJob = async (message, { keepOutput = false } = {}) => {
    if (!keepOutput) await removeFileQuietly(storagePathForPublicPath(job.path, env));
    try {
      await repo.markMediaFailed(job.id, { processing_error: message || 'Videó feldolgozási hiba.' });
      await removeFileQuietly(job.staging_path);
    } catch (dbError) {
      return { ok: false, processed: true, id: job.id, error: dbError.message || message, terminalStateSaved: false };
    }
    return { ok: false, processed: true, id: job.id, error: message, terminalStateSaved: true };
  };
  const outputPath = storagePathForPublicPath(job.path, env);
  try {
    const result = await transcodeVideo({ inputPath: job.staging_path, outputPath, env, runner, probe });
    try {
      await repo.markMediaReady(job.id, { original_size_bytes: result.originalSize, final_size_bytes: result.finalSize, duration_seconds: result.duration, width: result.width, height: result.height, processing_error: null });
      await removeFileQuietly(job.staging_path);
      return { ok: true, processed: true, id: job.id, result, terminalStateSaved: true };
    } catch (readyError) {
      await removeFileQuietly(outputPath);
      return await failJob(readyError.message || 'Videó ready állapot mentési hiba.', { keepOutput: true });
    }
  } catch (error) {
    await removeFileQuietly(outputPath);
    return await failJob(error.message || 'Videó feldolgozási hiba.', { keepOutput: true });
  }
}
export function staleProcessingSeconds(env = process.env) { const n = Number(env.SITE_MEDIA_PROCESSING_STALE_SECONDS || 3600); return Number.isInteger(n) && n > 0 ? n : 3600; }
export function workerPollIntervalMs(env = process.env) { const n = Number(env.SITE_MEDIA_WORKER_POLL_MS || 5000); return Number.isFinite(n) && n > 0 ? n : 5000; }
export function workerLockPath(env = process.env) { return path.resolve(env.SITE_MEDIA_WORKER_LOCK_FILE || path.join(mediaConfig(env).stagingRoot || tmpdir(), 'media-worker.lock.d')); }
export function workerLockStaleSeconds(env = process.env) { const n = Number(env.SITE_MEDIA_WORKER_LOCK_STALE_SECONDS || 3600); return Number.isInteger(n) && n > 0 ? n : 3600; }
function pidIsAlive(pid) { try { process.kill(pid, 0); return true; } catch { return false; } }
async function readWorkerLock(lockDir) { try { return JSON.parse(await readFile(path.join(lockDir, 'lock.json'), 'utf8')); } catch { return null; } }
async function lockDirAgeMs(lockDir) { try { return Date.now() - (await stat(lockDir)).mtimeMs; } catch { return 0; } }
async function lockDirIdentity(lockDir) { try { const s = await stat(lockDir); return { dev: s.dev, ino: s.ino, ctimeMs: s.ctimeMs, mtimeMs: s.mtimeMs }; } catch { return null; } }
function sameLockIdentity(a, b) { return Boolean(a && b && a.dev === b.dev && a.ino === b.ino && a.ctimeMs === b.ctimeMs && a.mtimeMs === b.mtimeMs); }
function sameLockGeneration(a, b) { return Boolean(a && b && a.dev === b.dev && a.ino === b.ino); }
function lockError(file) { const e = new Error(`Média worker már fut vagy lockolt: ${file}`); e.code = 'MEDIA_WORKER_LOCKED'; return e; }
export async function acquireWorkerLock(env = process.env, { writeFileImpl = writeFile, beforeStaleRename } = {}) {
  const file = workerLockPath(env);
  const takeover = `${file}.takeover`;
  const token = `${process.pid}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
  const metadata = { pid: process.pid, createdAt: new Date().toISOString(), token, command: process.argv.join(' ') };
  await mkdir(path.dirname(file), { recursive: true });
  async function clearStaleTakeoverOrThrow() {
    const ageMs = await lockDirAgeMs(takeover);
    if (ageMs <= 0) return;
    if (ageMs <= workerLockStaleSeconds(env) * 1000) throw lockError(file);
    const recovery = `${takeover}.stale-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    try { await rename(takeover, recovery); }
    catch (error) { if (error.code === 'ENOENT' || error.code === 'EEXIST') throw lockError(file); throw error; }
    await rm(recovery, { recursive: true, force: true }).catch(() => {});
  }
  async function create(takeoverOwned = false) {
    await mkdir(file);
    try { await writeFileImpl(path.join(file, 'lock.json'), JSON.stringify(metadata)); }
    catch (error) { await rm(file, { recursive: true, force: true }).catch(() => {}); throw error; }
    return { file, token, release: async () => { const current = await readWorkerLock(file); if (current?.token === token) { await rm(file, { recursive: true, force: true }).catch(() => {}); if (takeoverOwned) await rm(takeover, { recursive: true, force: true }).catch(() => {}); } } };
  }
  await clearStaleTakeoverOrThrow();
  try { return await create(false); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const current = await readWorkerLock(file);
    const originalToken = current?.token || null;
    const originalIdentity = await lockDirIdentity(file);
    const ageMs = await lockDirAgeMs(file);
    const staleByAge = ageMs > workerLockStaleSeconds(env) * 1000;
    const liveWorker = current?.pid && pidIsAlive(Number(current.pid)) && String(current.command || '').includes('media-worker');
    if (liveWorker || (!current && !staleByAge)) throw lockError(file);
    if (current?.pid && pidIsAlive(Number(current.pid)) && !staleByAge) throw lockError(file);
    await beforeStaleRename?.();
    if (!sameLockIdentity(originalIdentity, await lockDirIdentity(file))) throw lockError(file);
    try { await rename(file, takeover); }
    catch (renameError) { if (renameError.code === 'ENOENT' || renameError.code === 'EEXIST' || renameError.code === 'ENOTEMPTY') throw lockError(file); throw renameError; }
    const takeoverIdentity = await lockDirIdentity(takeover);
    const taken = await readWorkerLock(takeover);
    if (!sameLockGeneration(originalIdentity, takeoverIdentity) || (originalToken && taken?.token !== originalToken)) {
      try { await rename(takeover, file); }
      catch (restoreError) { if (restoreError.code !== 'EEXIST' && restoreError.code !== 'ENOTEMPTY') throw restoreError; }
      throw lockError(file);
    }
    try { return await create(true); }
    catch (retryError) { await rm(takeover, { recursive: true, force: true }).catch(() => {}); if (retryError.code === 'EEXIST') throw lockError(file); throw retryError; }
  }
}
function sleep(ms, signal) { return new Promise((resolve) => { const t = setTimeout(resolve, ms); signal?.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true }); }); }
export async function runMediaWorker({ repo, env = process.env, runner = runProcess, probe = probeVideo, once = false, signal, logger = console, lock = true } = {}) {
  const workerLock = lock ? await acquireWorkerLock(env) : null;
  let count = 0;
  try {
    const recovered = typeof repo.recoverStaleMediaProcessingJobs === 'function' ? await repo.recoverStaleMediaProcessingJobs({ timeoutSeconds: staleProcessingSeconds(env) }) : 0;
    logger.log?.(`Media worker stale recovery: recovered=${recovered}`);
    do {
      if (signal?.aborted) break;
      const r = await processOneMediaJob({ repo, env, runner, probe });
      if (r.processed) { count += 1; if (!r.ok) logger.error?.(`Media worker job failed: ${r.error || 'unknown error'}`); if (once) return { ok: r.ok, processed: count, error: r.error }; continue; }
      if (once) break;
      await sleep(workerPollIntervalMs(env), signal);
    } while (!signal?.aborted);
    return { ok: true, processed: count, stopped: signal?.aborted || false };
  } finally { await workerLock?.release(); }
}
