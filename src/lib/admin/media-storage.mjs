import crypto from 'node:crypto';
import { constants } from 'node:fs';
import { access, copyFile, mkdir, open, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_MEDIA_PUBLIC_BASE_URL = '/assets/site-media';
export const DEFAULT_MEDIA_MAX_BYTES = 5_242_880;
export const DEFAULT_MEDIA_VIDEO_MAX_BYTES = 209_715_200;
export const DEFAULT_MEDIA_DOCUMENT_MAX_BYTES = 10_485_760;
export const DEFAULT_FFMPEG_PATH = '/usr/bin/ffmpeg';
export const DEFAULT_FFPROBE_PATH = '/usr/bin/ffprobe';
const allowed = {
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
};
const imageTypes = new Set(['image/webp', 'image/jpeg', 'image/png']);
const videoTypes = new Set(['video/mp4']);
const documentTypes = new Set(['application/pdf']);

export function mediaValidationError(message, code = 'INVALID_MEDIA_UPLOAD') { const error = new Error(message); error.code = code; error.status = 400; return error; }
export function mediaConfig(env = process.env) {
  const storageRoot = path.resolve(env.SITE_MEDIA_STORAGE_DIR || path.resolve(process.cwd(), '..', 'uploads', 'site-media'));
  const stagingRoot = path.resolve(env.SITE_MEDIA_STAGING_DIR || path.join(storageRoot, '..', 'site-media-staging'));
  const publicBase = normalizePublicBase(env.SITE_MEDIA_PUBLIC_BASE_URL || DEFAULT_MEDIA_PUBLIC_BASE_URL);
  const maxBytes = Number(env.SITE_MEDIA_MAX_BYTES || DEFAULT_MEDIA_MAX_BYTES);
  const videoMaxBytes = Number(env.SITE_MEDIA_VIDEO_MAX_BYTES || DEFAULT_MEDIA_VIDEO_MAX_BYTES);
  const documentMaxBytes = Number(env.SITE_MEDIA_DOCUMENT_MAX_BYTES || DEFAULT_MEDIA_DOCUMENT_MAX_BYTES);
  return {
    storageRoot,
    stagingRoot,
    publicBase,
    maxBytes: Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : DEFAULT_MEDIA_MAX_BYTES,
    videoMaxBytes: Number.isFinite(videoMaxBytes) && videoMaxBytes > 0 ? videoMaxBytes : DEFAULT_MEDIA_VIDEO_MAX_BYTES,
    documentMaxBytes: Number.isFinite(documentMaxBytes) && documentMaxBytes > 0 ? documentMaxBytes : DEFAULT_MEDIA_DOCUMENT_MAX_BYTES,
    ffmpegPath: env.SITE_MEDIA_FFMPEG_PATH || DEFAULT_FFMPEG_PATH,
    ffprobePath: env.SITE_MEDIA_FFPROBE_PATH || DEFAULT_FFPROBE_PATH,
  };
}
export function maxRequestBytes(env = process.env) { const cfg = mediaConfig(env); return Math.max(cfg.maxBytes, cfg.videoMaxBytes, cfg.documentMaxBytes); }
export function normalizePublicBase(value = DEFAULT_MEDIA_PUBLIC_BASE_URL) {
  const raw = String(value || DEFAULT_MEDIA_PUBLIC_BASE_URL).trim();
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('://') || raw.includes('\0')) throw mediaValidationError('Hibás média public útvonal.', 'INVALID_MEDIA_PUBLIC_BASE');
  const parts = raw.split('/').filter(Boolean);
  if (parts.some((part) => part === '.' || part === '..')) throw mediaValidationError('Hibás média public útvonal.', 'INVALID_MEDIA_PUBLIC_BASE');
  return `/${parts.join('/')}`;
}
export function publicBaseToRelative(publicBase = DEFAULT_MEDIA_PUBLIC_BASE_URL) { return normalizePublicBase(publicBase).replace(/^\/+/, ''); }
function guardInside(root, target) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) throw mediaValidationError('Hibás média fájlútvonal.', 'MEDIA_PATH_TRAVERSAL');
  return resolvedTarget;
}
export function isVideoType(type = '') { return videoTypes.has(String(type).toLowerCase()); }
export function isImageType(type = '') { return imageTypes.has(String(type).toLowerCase()); }
export function isDocumentType(type = '') { return documentTypes.has(String(type).toLowerCase()); }
export function safeMediaFilename(originalName, bytes = crypto.randomBytes(4)) {
  const base = path.basename(String(originalName || 'media'));
  if (base !== String(originalName || 'media') || base.includes('..') || base.includes('\\')) throw mediaValidationError('Hibás fájlnév.', 'INVALID_MEDIA_FILENAME');
  const ext = path.extname(base).toLowerCase();
  if (!allowed[ext]) throw mediaValidationError('Csak WebP, JPG, PNG képek, MP4 videók és PDF dokumentumok tölthetők fel.', 'INVALID_MEDIA_TYPE');
  const stem = path.basename(base, path.extname(base)).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^[._-]+|[._-]+$/g, '') || 'media';
  return `${stem}-${Buffer.from(bytes).toString('hex').slice(0, 8)}${ext === '.jpeg' ? '.jpg' : ext}`;
}
export function detectImageMime(buffer) {
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 && buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a) return 'image/png';
  return '';
}
export function detectPdfMime(buffer) { return buffer.length >= 5 && buffer.subarray(0,5).toString('ascii') === '%PDF-' ? 'application/pdf' : ''; }
export function detectMp4Mime(buffer) {
  if (buffer.length < 12) return '';
  const box = buffer.subarray(4, 8).toString('ascii');
  if (box !== 'ftyp') return '';
  const brand = buffer.subarray(8, Math.min(buffer.length, 64)).toString('ascii');
  return /(isom|iso2|avc1|mp41|mp42|M4V |MSNV|dash)/.test(brand) ? 'video/mp4' : '';
}
export function validateMediaFile({ filename, contentType, buffer, size, maxBytes = DEFAULT_MEDIA_MAX_BYTES, videoMaxBytes = DEFAULT_MEDIA_VIDEO_MAX_BYTES, documentMaxBytes = DEFAULT_MEDIA_DOCUMENT_MAX_BYTES }) {
  const actualSize = Number.isFinite(size) ? size : buffer?.length;
  if (!actualSize) throw mediaValidationError('Üres fájl nem tölthető fel.', 'EMPTY_MEDIA_FILE');
  const ext = path.extname(path.basename(String(filename || ''))).toLowerCase();
  const normalizedExt = ext === '.jpeg' ? '.jpg' : ext;
  const expected = allowed[ext];
  if (!expected) throw mediaValidationError('Csak WebP, JPG, PNG képek, MP4 videók és PDF dokumentumok tölthetők fel.', 'INVALID_MEDIA_TYPE');
  const limit = isVideoType(expected) ? videoMaxBytes : (isDocumentType(expected) ? documentMaxBytes : maxBytes);
  if (actualSize > limit) throw mediaValidationError('A fájl túl nagy.', 'MEDIA_FILE_TOO_LARGE');
  if (String(contentType || '').toLowerCase() !== expected) throw mediaValidationError('A MIME típus nem egyezik a fájlkiterjesztéssel.', 'MEDIA_MIME_MISMATCH');
  if (buffer?.length) {
    const detected = isVideoType(expected) ? detectMp4Mime(buffer) : (isDocumentType(expected) ? detectPdfMime(buffer) : detectImageMime(buffer));
    if (detected !== expected) throw mediaValidationError(isVideoType(expected) ? 'A fájl tartalma nem érvényes MP4 videó.' : (isDocumentType(expected) ? 'A fájl tartalma nem érvényes PDF dokumentum.' : 'A fájl tartalma nem egyezik a képtípussal.'), 'MEDIA_MAGIC_MISMATCH');
  }
  return { type: expected, ext: normalizedExt, mediaKind: isVideoType(expected) ? 'video' : (isDocumentType(expected) ? 'document' : 'image'), limit };
}
export function datedMediaTarget({ originalName, env = process.env, now = new Date() }) {
  const cfg = mediaConfig(env);
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const filename = safeMediaFilename(originalName);
  const dir = guardInside(cfg.storageRoot, path.join(cfg.storageRoot, yyyy, mm));
  const target = guardInside(cfg.storageRoot, path.join(dir, filename));
  const publicPath = `${cfg.publicBase}/${yyyy}/${mm}/${filename}`;
  return { cfg, yyyy, mm, filename, dir, target, publicPath };
}
export async function storeMediaFile({ file, alt = '', env = process.env, now = new Date() }) {
  const cfg = mediaConfig(env);
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const originalName = file.name || 'media';
  const { type } = validateMediaFile({ filename: originalName, contentType: file.type, buffer, maxBytes: cfg.maxBytes, videoMaxBytes: cfg.videoMaxBytes, documentMaxBytes: cfg.documentMaxBytes });
  const { dir, target, publicPath } = datedMediaTarget({ originalName, env, now });
  await mkdir(dir, { recursive: true });
  await writeFile(target, buffer, { flag: 'wx' });
  return { path: publicPath, alt: String(alt || '').trim(), type, storagePath: target, size: buffer.length };
}
export async function finalizeStagedMediaFile({ stagingPath, originalName, alt = '', contentType, env = process.env, now = new Date() }) {
  const cfg = mediaConfig(env);
  const st = await stat(stagingPath);
  const fh = await open(stagingPath, 'r');
  const header = await (async () => { try { const b = Buffer.alloc(64); const { bytesRead } = await fh.read(b, 0, b.length, 0); return b.subarray(0, bytesRead); } finally { await fh.close(); } })();
  const { type } = validateMediaFile({ filename: originalName, contentType, buffer: header, size: st.size, maxBytes: cfg.maxBytes, videoMaxBytes: cfg.videoMaxBytes, documentMaxBytes: cfg.documentMaxBytes });
  const { dir, target, publicPath } = datedMediaTarget({ originalName, env, now });
  await mkdir(dir, { recursive: true });
  await rename(stagingPath, target);
  return { path: publicPath, alt: String(alt || '').trim(), type, storagePath: target, size: st.size };
}
export async function createStagingPath(originalName, env = process.env) {
  const cfg = mediaConfig(env);
  await mkdir(cfg.stagingRoot, { recursive: true });
  const filename = `${Date.now()}-${safeMediaFilename(originalName)}`;
  return guardInside(cfg.stagingRoot, path.join(cfg.stagingRoot, filename));
}
export function storagePathForPublicPath(publicPath, env = process.env) {
  const cfg = mediaConfig(env);
  const value = String(publicPath || '');
  const base = `${cfg.publicBase}/`;
  if (!value.startsWith(base)) throw mediaValidationError('A média útvonal nem a konfigurált public base alatt van.', 'INVALID_MEDIA_PATH');
  const rel = value.slice(base.length);
  const parts = rel.split('/').filter(Boolean);
  if (parts.length < 3 || parts.some((part) => part === '.' || part === '..' || part.includes('\\'))) throw mediaValidationError('Hibás média útvonal.', 'INVALID_MEDIA_PATH');
  return guardInside(cfg.storageRoot, path.join(cfg.storageRoot, ...parts));
}
export async function mediaFileExists(publicPath, env = process.env) { try { await access(storagePathForPublicPath(publicPath, env), constants.R_OK); return true; } catch { return false; } }
export async function copyMediaToRelease({ releasePath, env = process.env, media = null } = {}) {
  const cfg = mediaConfig(env);
  try { const s = await stat(cfg.storageRoot); if (!s.isDirectory()) return { ok: true, skipped: true, copied: 0 }; } catch { return { ok: true, skipped: true, copied: 0 }; }
  const relBase = publicBaseToRelative(cfg.publicBase);
  const targetRoot = guardInside(releasePath, path.join(releasePath, relBase));
  let copied = 0;
  const readyMedia = Array.isArray(media) ? media.filter((m) => m && m.status !== 'archived' && (m.processing_status == null || m.processing_status === '' || m.processing_status === 'ready')) : null;
  if (readyMedia) {
    for (const item of readyMedia) {
      let srcPath;
      try { srcPath = storagePathForPublicPath(item.path, env); } catch { continue; }
      try { const s = await stat(srcPath); if (!s.isFile()) continue; } catch { continue; }
      const rel = item.path.slice(`${cfg.publicBase}/`.length);
      const destPath = guardInside(targetRoot, path.join(targetRoot, rel));
      await mkdir(path.dirname(destPath), { recursive: true });
      await copyFile(srcPath, destPath); copied += 1;
    }
    return { ok: true, skipped: false, copied, targetRoot };
  }
  async function walk(src, dest) {
    await mkdir(dest, { recursive: true });
    const entries = await readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = guardInside(targetRoot, path.join(dest, entry.name));
      if (entry.isDirectory()) await walk(srcPath, destPath);
      else if (entry.isFile()) { await copyFile(srcPath, destPath); copied += 1; }
    }
  }
  await walk(cfg.storageRoot, targetRoot);
  return { ok: true, skipped: false, copied, targetRoot };
}
export async function removeFileQuietly(filePath) { if (!filePath) return; await rm(filePath, { force: true }).catch(() => {}); }
