import crypto from 'node:crypto';
import { constants } from 'node:fs';
import { access, copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_MEDIA_PUBLIC_BASE_URL = '/assets/site-media';
export const DEFAULT_MEDIA_MAX_BYTES = 5_242_880;
const allowed = {
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

export function mediaValidationError(message, code = 'INVALID_MEDIA_UPLOAD') { const error = new Error(message); error.code = code; error.status = 400; return error; }
export function mediaConfig(env = process.env) {
  const storageRoot = path.resolve(env.SITE_MEDIA_STORAGE_DIR || path.resolve(process.cwd(), '..', 'uploads', 'site-media'));
  const publicBase = normalizePublicBase(env.SITE_MEDIA_PUBLIC_BASE_URL || DEFAULT_MEDIA_PUBLIC_BASE_URL);
  const maxBytes = Number(env.SITE_MEDIA_MAX_BYTES || DEFAULT_MEDIA_MAX_BYTES);
  return { storageRoot, publicBase, maxBytes: Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : DEFAULT_MEDIA_MAX_BYTES };
}
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
export function safeMediaFilename(originalName, bytes = crypto.randomBytes(4)) {
  const base = path.basename(String(originalName || 'media'));
  if (base !== String(originalName || 'media') || base.includes('..') || base.includes('\\')) throw mediaValidationError('Hibás fájlnév.', 'INVALID_MEDIA_FILENAME');
  const ext = path.extname(base).toLowerCase();
  if (!allowed[ext]) throw mediaValidationError('Csak WebP, JPG és PNG képek tölthetők fel.', 'INVALID_MEDIA_TYPE');
  const stem = path.basename(base, path.extname(base)).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^[._-]+|[._-]+$/g, '') || 'media';
  return `${stem}-${Buffer.from(bytes).toString('hex').slice(0, 8)}${ext === '.jpeg' ? '.jpg' : ext}`;
}
export function detectImageMime(buffer) {
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 && buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a) return 'image/png';
  return '';
}
export function validateMediaFile({ filename, contentType, buffer, maxBytes = DEFAULT_MEDIA_MAX_BYTES }) {
  if (!buffer?.length) throw mediaValidationError('Üres fájl nem tölthető fel.', 'EMPTY_MEDIA_FILE');
  if (buffer.length > maxBytes) throw mediaValidationError('A fájl túl nagy.', 'MEDIA_FILE_TOO_LARGE');
  const ext = path.extname(path.basename(String(filename || ''))).toLowerCase();
  const normalizedExt = ext === '.jpeg' ? '.jpg' : ext;
  const expected = allowed[ext];
  if (!expected) throw mediaValidationError('Csak WebP, JPG és PNG képek tölthetők fel.', 'INVALID_MEDIA_TYPE');
  if (String(contentType || '').toLowerCase() !== expected) throw mediaValidationError('A MIME típus nem egyezik a fájlkiterjesztéssel.', 'MEDIA_MIME_MISMATCH');
  const detected = detectImageMime(buffer);
  if (detected !== expected) throw mediaValidationError('A fájl tartalma nem egyezik a képtípussal.', 'MEDIA_MAGIC_MISMATCH');
  return { type: expected, ext: normalizedExt };
}
export async function storeMediaFile({ file, alt = '', env = process.env, now = new Date() }) {
  const cfg = mediaConfig(env);
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const originalName = file.name || 'media';
  const { type } = validateMediaFile({ filename: originalName, contentType: file.type, buffer, maxBytes: cfg.maxBytes });
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const filename = safeMediaFilename(originalName);
  const dir = guardInside(cfg.storageRoot, path.join(cfg.storageRoot, yyyy, mm));
  await mkdir(dir, { recursive: true });
  const target = guardInside(cfg.storageRoot, path.join(dir, filename));
  await writeFile(target, buffer, { flag: 'wx' });
  const publicPath = `${cfg.publicBase}/${yyyy}/${mm}/${filename}`;
  return { path: publicPath, alt: String(alt || '').trim(), type, storagePath: target, size: buffer.length };
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
export async function copyMediaToRelease({ releasePath, env = process.env } = {}) {
  const cfg = mediaConfig(env);
  try { const s = await stat(cfg.storageRoot); if (!s.isDirectory()) return { ok: true, skipped: true, copied: 0 }; } catch { return { ok: true, skipped: true, copied: 0 }; }
  const relBase = publicBaseToRelative(cfg.publicBase);
  const targetRoot = guardInside(releasePath, path.join(releasePath, relBase));
  let copied = 0;
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
