import { createWriteStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import Busboy from 'busboy';
import { createStagingPath, mediaValidationError } from './media-storage.mjs';

export async function parseMediaMultipart(req, { env = process.env, maxBytes, stagingPathFactory = createStagingPath, writeStreamFactory = createWriteStream } = {}) {
  const created = [];
  const fileTasks = [];
  const inputStreams = new Set();
  const writeStreams = new Set();
  const controller = new AbortController();
  let busboyRef;
  let settled = false;
  let file = null;
  let fileCount = 0;
  let totalBytes = 0;
  const fields = {};

  async function cleanup() {
    controller.abort();
    req.unpipe?.();
    busboyRef?.destroy?.();
    for (const stream of inputStreams) stream.destroy?.();
    for (const stream of writeStreams) stream.destroy?.();
    await Promise.allSettled(fileTasks);
    await Promise.all(created.map((filePath) => rm(filePath, { force: true }).catch(() => {})));
  }
  async function fail(reject, error) {
    if (settled) return;
    settled = true;
    await cleanup();
    reject(error);
  }

  return await new Promise((resolve, reject) => {
    let busboy;
    try {
      busboy = Busboy({ headers: req.headers, limits: { fileSize: maxBytes, fieldSize: 8192, fields: 1, files: 1, parts: 3 } });
      busboyRef = busboy;
    } catch (error) { reject(mediaValidationError(error.message || 'Hibás multipart kérés.', 'INVALID_MULTIPART')); return; }

    req.on('data', (chunk) => { totalBytes += chunk.length; if (maxBytes && totalBytes > maxBytes + 8192) void fail(reject, mediaValidationError('A feltöltés túl nagy.', 'MEDIA_FILE_TOO_LARGE')); });
    req.on('aborted', () => void fail(reject, mediaValidationError('Megszakadt multipart feltöltés.', 'MEDIA_MULTIPART_ABORTED')));
    req.on('error', (error) => void fail(reject, error));
    busboy.on('field', (name, value, info = {}) => {
      if (name !== 'alt') { void fail(reject, mediaValidationError('Ismeretlen feltöltési mező.', 'MEDIA_FIELD_NOT_ALLOWED')); return; }
      if (info.valueTruncated) { void fail(reject, mediaValidationError('Az alt mező túl hosszú.', 'MEDIA_FIELD_TOO_LARGE')); return; }
      fields.alt = String(value || '').trim();
    });
    busboy.on('file', (name, stream, info = {}) => {
      fileCount += 1;
      inputStreams.add(stream);
      if (name !== 'file' || fileCount > 1) { stream.resume(); void fail(reject, mediaValidationError('Egyszerre pontosan egy file mező tölthető fel.', 'MEDIA_TOO_MANY_FILES')); return; }
      const originalName = path.basename(info.filename || 'media');
      const task = (async () => {
        const stagingPath = await stagingPathFactory(originalName, env);
        created.push(stagingPath);
        if (settled || controller.signal.aborted) return;
        await mkdir(path.dirname(stagingPath), { recursive: true });
        if (settled || controller.signal.aborted) return;
        const out = writeStreamFactory(stagingPath, { flags: 'wx' });
        writeStreams.add(out);
        let limited = false;
        stream.on('limit', () => { limited = true; void fail(reject, mediaValidationError('A fájl túl nagy.', 'MEDIA_FILE_TOO_LARGE')); });
        await pipeline(stream, out, { signal: controller.signal });
        writeStreams.delete(out);
        inputStreams.delete(stream);
        if (!settled && !limited && !controller.signal.aborted) { const s = await stat(stagingPath); file = { originalName, contentType: info.mimeType || '', stagingPath, size: s.size }; }
      })().catch((error) => { if (!settled && !controller.signal.aborted) void fail(reject, error); });
      fileTasks.push(task);
    });
    busboy.on('filesLimit', () => void fail(reject, mediaValidationError('Egyszerre csak egy médiafájl tölthető fel.', 'MEDIA_TOO_MANY_FILES')));
    busboy.on('fieldsLimit', () => void fail(reject, mediaValidationError('Túl sok feltöltési mező.', 'MEDIA_TOO_MANY_FIELDS')));
    busboy.on('partsLimit', () => void fail(reject, mediaValidationError('Túl sok multipart rész.', 'MEDIA_TOO_MANY_PARTS')));
    busboy.on('error', (error) => void fail(reject, error));
    busboy.on('close', async () => {
      if (settled) return;
      await Promise.allSettled(fileTasks);
      if (settled) return;
      if (!file || !file.size) { await fail(reject, mediaValidationError('Médiafájl szükséges.', 'MEDIA_FILE_REQUIRED')); return; }
      settled = true;
      resolve({ file, fields });
    });
    req.pipe(busboy);
  });
}
