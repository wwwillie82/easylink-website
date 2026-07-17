import http from 'node:http';
import { createReadStream } from 'node:fs';
import { open, readFile, stat } from 'node:fs/promises';
import { authenticate, signSession, sessionCookie, clearSessionCookie, requireAuthFromRequest } from './auth.mjs';
import { parseJsonItems, validateLoginPayload } from './validation.mjs';
import { layout, loginHtml, mediaPanel, navHtml, pageForm, pagesTable, publishPanel, settingsPanel } from './render.mjs';
import { createPublishService, PublishInProgressError } from './publish.mjs';
import { datedMediaTarget, finalizeStagedMediaFile, isVideoType, maxRequestBytes, mediaConfig, mediaValidationError, removeFileQuietly, storagePathForPublicPath, validateMediaFile } from './media-storage.mjs';
import { parseMediaMultipart } from './multipart-upload.mjs';
import { isValidHttpExternalUrl, normalizeNavigationTargetType, positiveNavigationPageId } from '../content/internal-links.mjs';

const apiError = (res, status, code, message) => json(res, status, { ok: false, error: { code, message } });
const json = (res, status, body, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers }); res.end(JSON.stringify(body)); };
const html = (res, body, status = 200, current = '') => { res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' }); res.end(layout(body, { current })); };
const redirect = (res, location, headers = {}) => { res.writeHead(303, { location, ...headers }); res.end(); };
async function rawBody(req) { const chunks = []; for await (const c of req) chunks.push(c); return Buffer.concat(chunks).toString('utf8'); }
async function body(req) { const raw = await rawBody(req); if (!raw) return {}; if (req.headers['content-type']?.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(raw)); return JSON.parse(raw); }
function wantsHtml(req) { return String(req.headers.accept || '').includes('text/html'); }
function navValidationCode(error) {
  if (error?.code === 'DUPLICATE_NAVIGATION_HREF' || /Duplikált menüpont link/i.test(String(error?.message || ''))) return 'DUPLICATE_NAVIGATION_HREF';
  if (error?.code === 'ER_DUP_ENTRY') return 'DUPLICATE_NAVIGATION_HREF';
  return 'INVALID_NAVIGATION_ITEM';
}
function authed(req, env) { return requireAuthFromRequest({ headers: { get: (name) => req.headers[name.toLowerCase()] || '' } }, env); }
async function multipart(req, env) {
  const maxBytes = maxRequestBytes(env);
  const len = Number(req.headers['content-length'] || 0);
  if (len && len > maxBytes + 8192) throw mediaValidationError('A feltöltés túl nagy.', 'MEDIA_FILE_TOO_LARGE');
  return parseMediaMultipart(req, { env, maxBytes });
}
async function readHeader(filePath) { const fh = await open(filePath, 'r'); try { const b = Buffer.alloc(64); const { bytesRead } = await fh.read(b, 0, b.length, 0); return b.subarray(0, bytesRead); } finally { await fh.close(); } }
function sendFileRange(req, res, filePath, type) { return stat(filePath).then((s) => { const size = s.size; const headers = { 'content-type': type || 'application/octet-stream', 'cache-control': 'private, max-age=60', 'x-content-type-options': 'nosniff', 'accept-ranges': 'bytes' }; const range = req.headers.range; if (!range) { res.writeHead(200, { ...headers, 'content-length': size }); return createReadStream(filePath).pipe(res); } const m = /^bytes=(\d*)-(\d*)$/.exec(String(range)); if (!m) { res.writeHead(416, { ...headers, 'content-range': `bytes */${size}`, 'content-length': 0 }); return res.end(); } let start = m[1] === '' ? 0 : Number(m[1]); let end = m[2] === '' ? size - 1 : Number(m[2]); if (m[1] === '' && m[2] !== '') { const suffix = Number(m[2]); start = Math.max(0, size - suffix); end = size - 1; } if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) { res.writeHead(416, { ...headers, 'content-range': `bytes */${size}`, 'content-length': 0 }); return res.end(); } end = Math.min(end, size - 1); res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 }); return createReadStream(filePath, { start, end }).pipe(res); }); }

function positiveSortOrder(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  if (!/^\d+$/.test(String(value).trim())) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

export function validateNavPayload(payload, pages = []) {
  const pageMap = new Map((pages || []).map((page) => [Number(page.id), page]));
  if (!Array.isArray(payload?.items) || payload.items.length === 0) return { ok: false, error: { code: 'INVALID_NAVIGATION_ITEMS', message: 'Legalább egy menüpont szükséges.' } };
  const required = ['title', 'href', 'status'];
  const effectiveHrefs = new Map();
  for (const [index, item] of payload.items.entries()) {
    if (!item || typeof item !== 'object') return { ok: false, error: { code: 'INVALID_NAVIGATION_ITEM', message: `Hibás menüpont: ${index + 1}.` } };
    for (const field of required) {
      if (item[field] === undefined || item[field] === null || String(item[field]).trim() === '') return { ok: false, error: { code: 'INVALID_NAVIGATION_ITEM', message: `Hiányzó menüpont mező: ${field}.` } };
    }
    if (item.id !== undefined && item.id !== null && String(item.id).trim() !== '' && !/^\d+$/.test(String(item.id))) return { ok: false, error: { code: 'INVALID_NAVIGATION_ITEM', message: 'Hibás menüpont azonosító.' } };
    if (!['published','draft','archived'].includes(item.status)) return { ok: false, error: { code: 'INVALID_NAVIGATION_STATUS', message: 'Hibás menüpont státusz.' } };
    if (!positiveSortOrder(item.sort_order)) return { ok: false, error: { code: 'INVALID_NAVIGATION_SORT_ORDER', message: 'A sorrend csak pozitív egész szám lehet.' } };
    const hasTargetType = item.target_type !== undefined;
    const hasTargetPageId = item.target_page_id !== undefined && item.target_page_id !== null && String(item.target_page_id).trim() !== '';
    const hasTitleOverride = item.title_override !== undefined && item.title_override !== null && String(item.title_override).trim() !== '';
    if (!hasTargetType && (hasTargetPageId || hasTitleOverride)) return { ok: false, error: { code: 'INVALID_NAVIGATION_TARGET', message: 'A cél típusát is meg kell adni a target mezők mellé.' } };
    if (hasTargetType && normalizeNavigationTargetType(item.target_type) !== String(item.target_type).trim().toLowerCase()) return { ok: false, error: { code: 'INVALID_NAVIGATION_TARGET', message: 'Hibás menüpont cél típusa.' } };
    const targetType = hasTargetType ? normalizeNavigationTargetType(item.target_type) : 'legacy';
    if (hasTargetType && targetType === 'page') {
      const pageId = positiveNavigationPageId(item.target_page_id);
      if (!pageId) return { ok: false, error: { code: 'INVALID_NAVIGATION_TARGET', message: 'Belső oldal célhoz oldalazonosító szükséges.' } };
      const page = pageMap.get(pageId);
      if (pageMap.size && !page) return { ok: false, error: { code: 'INVALID_NAVIGATION_TARGET', message: 'A kiválasztott belső oldal nem található.' } };
      if (page && String(item.href || '') !== String(page.route || '')) return { ok: false, error: { code: 'INVALID_NAVIGATION_TARGET', message: 'A belső oldal linkje csak az oldal aktuális route-ja lehet.' } };
      if (page && hasTitleOverride && String(item.title || '') !== String(item.title_override || '').trim()) return { ok: false, error: { code: 'INVALID_NAVIGATION_TARGET', message: 'Az egyedi menüfelirat és a kompatibilitási title mező eltér.' } };
      if (page && !hasTitleOverride && String(item.title || '') !== String(page.title || '')) return { ok: false, error: { code: 'INVALID_NAVIGATION_TARGET', message: 'Örökölt feliratnál a title az oldal címe legyen.' } };
    }
    if (hasTargetType && targetType === 'external' && !isValidHttpExternalUrl(item.href)) return { ok: false, error: { code: 'INVALID_NAVIGATION_TARGET', message: 'A külső URL csak http:// vagy https:// lehet.' } };
    if (hasTargetType && targetType !== 'page' && (hasTargetPageId || hasTitleOverride)) return { ok: false, error: { code: 'INVALID_NAVIGATION_TARGET', message: 'Legacy és külső link célhoz nem tartozhat oldalazonosító vagy menüfelirat override.' } };
    const effectiveHref = String(item.href || '').trim();
    const previousHrefIndex = effectiveHrefs.get(effectiveHref);
    if (previousHrefIndex !== undefined) return { ok: false, error: { code: 'DUPLICATE_NAVIGATION_HREF', message: `Duplikált menüpont link (${previousHrefIndex + 1}. és ${index + 1}. sor).` } };
    effectiveHrefs.set(effectiveHref, index);
  }
  return { ok: true, data: payload.items };
}

export function createAdminServer({ repo, env = process.env, publishService } = {}) {
  if (!repo) throw new Error('createAdminServer requires repo');
  const publisher = publishService || createPublishService({ repo, env });
  async function publishAfterSave(user, label) {
    try { return await publisher.publish({ adminId: user.id, label }); }
    catch (error) { if (error instanceof PublishInProgressError || error.code === 'PUBLISH_IN_PROGRESS') return { ok: false, status: 'publish_in_progress', contentSaved: true, liveUnchanged: true, error: error.message }; throw error; }
  }
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if ((url.pathname === '/admin' || url.pathname === '/admin/login') && req.method === 'GET') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(loginHtml()); }
      if (url.pathname === '/api/admin/login' && req.method === 'POST') {
        const payload = await body(req);
        const valid = validateLoginPayload(payload);
        if (!valid.ok) return wantsHtml(req) ? (res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' }), res.end(loginHtml(valid.error.message))) : json(res, 400, valid);
        const user = await authenticate(repo, valid.data.email, valid.data.password);
        if (!user) return wantsHtml(req) ? (res.writeHead(401, { 'content-type': 'text/html; charset=utf-8' }), res.end(loginHtml('Hibás belépési adatok.'))) : apiError(res, 401, 'INVALID_CREDENTIALS', 'Hibás belépési adatok.');
        const cookie = sessionCookie(signSession(user, env));
        return wantsHtml(req) ? redirect(res, '/admin/pages', { 'set-cookie': cookie }) : json(res, 200, { ok: true, data: { user } }, { 'set-cookie': cookie });
      }
      if (url.pathname === '/api/admin/logout') return redirect(res, '/admin/login', { 'set-cookie': clearSessionCookie() });
      const user = authed(req, env);
      if (!user) return url.pathname.startsWith('/api/') ? apiError(res, 401, 'UNAUTHENTICATED', 'Bejelentkezés szükséges.') : redirect(res, '/admin/login');
      if (url.pathname === '/api/admin/session') return json(res, 200, { ok: true, data: { user } });
      if (url.pathname === '/api/admin/pages') { if (req.method === 'POST') { const payload = await body(req); if (!payload.title || !payload.route) return apiError(res, 400, 'INVALID_PAGE', 'Oldalnév és URL szükséges.'); let data; try { data = await repo.createPage(payload); } catch (error) { if (error.status === 400 || error.code === 'VALIDATION_ERROR') return apiError(res, 400, 'INVALID_PAGE', error.message); throw error; } return json(res, 200, { ok: true, data, publish: await publishAfterSave(user, `Oldal létrehozás: ${data.id}`) }); } return json(res, 200, { ok: true, data: await repo.pages() }); }
      if (url.pathname.startsWith('/api/admin/pages/')) {
        const id = url.pathname.split('/').pop();
        const page = await repo.page(id);
        if (!page) return apiError(res, 404, 'PAGE_NOT_FOUND', 'Az oldal nem található.');
        if (req.method === 'GET') return json(res, 200, { ok: true, data: page });
        try { await repo.updatePage(id, await body(req)); } catch (error) { if (error.status === 400 || error.code === 'VALIDATION_ERROR') return apiError(res, 400, 'INVALID_PAGE', error.message); throw error; }
        return json(res, 200, { ok: true, publish: await publishAfterSave(user, `Oldal mentés: ${id}`) });
      }
      if (url.pathname === '/api/admin/blocks' && req.method === 'POST') {
        let payload;
        try { payload = await body(req); parseJsonItems(payload.items); }
        catch (error) { return apiError(res, 400, error.code || 'INVALID_BLOCK_JSON', error.message || 'Hibás JSON.'); }
        const data = await repo.upsertBlock(payload);
        return json(res, 200, { ok: true, data, publish: await publishAfterSave(user, `Blokk mentés: ${payload.page_id}`) });
      }
      if (url.pathname.startsWith('/api/admin/blocks/') && req.method === 'DELETE') { await repo.deleteBlock(url.pathname.split('/').pop()); return json(res, 200, { ok: true, publish: await publishAfterSave(user, `Blokk inaktiválás`) }); }
      if (url.pathname === '/api/admin/settings') { if (req.method === 'GET') return json(res, 200, { ok: true, data: await repo.getSiteSettings() }); if (req.method === 'PUT' || req.method === 'POST') { try { const data = await repo.updateSiteSettings(await body(req), env); return json(res, 200, { ok: true, data, publish: await publishAfterSave(user, 'Alapadatok mentés') }); } catch (error) { if (error.status === 400 || error.code === 'VALIDATION_ERROR') return apiError(res, 400, 'INVALID_SETTINGS', error.message); throw error; } } }
      if (url.pathname === '/api/admin/navigation') { if (req.method === 'GET') return json(res, 200, { ok: true, data: await repo.nav() }); const pages = await repo.pages(); const valid = validateNavPayload(await body(req), pages); if (!valid.ok) return json(res, 400, valid); let navigationIds; try { navigationIds = await repo.updateNav(valid.data); } catch (error) { if (error.status === 400 || error.code === 'VALIDATION_ERROR' || error.code === 'ER_DUP_ENTRY') return apiError(res, 400, navValidationCode(error), error.code === 'ER_DUP_ENTRY' || /Duplikált menüpont link/i.test(String(error.message || '')) ? 'Duplikált menüpont link.' : error.message); throw error; } return json(res, 200, { ok: true, data: { navigationIds }, publish: await publishAfterSave(user, 'Menü mentés') }); }
      if (url.pathname === '/api/admin/media') {
        if (req.method === 'GET') return json(res, 200, { ok: true, data: await repo.listMedia() });
        if (req.method === 'POST') {
          let stagedPath = '';
          let keepStaging = false;
          let finalizedStoragePath = '';
          let dbSaved = false;
          try {
            const form = await multipart(req, env);
            const file = form.file;
            stagedPath = file?.stagingPath || '';
            if (!file?.stagingPath) return apiError(res, 400, 'MEDIA_FILE_REQUIRED', 'Médiafájl szükséges.');
            const alt = form.fields.alt || '';
            const header = await readHeader(file.stagingPath);
            const valid = validateMediaFile({ filename: file.originalName, contentType: file.contentType, buffer: header, size: file.size, maxBytes: mediaConfig(env).maxBytes, videoMaxBytes: mediaConfig(env).videoMaxBytes, documentMaxBytes: mediaConfig(env).documentMaxBytes });
            if (isVideoType(valid.type)) {
              const target = datedMediaTarget({ originalName: file.originalName, env });
              const data = await repo.createMedia({ path: target.publicPath, alt: String(alt || '').trim(), type: valid.type, status: 'active', processing_status: 'queued', staging_path: file.stagingPath, original_size_bytes: file.size });
              keepStaging = true;
              dbSaved = true;
              return json(res, 200, { ok: true, data });
            }
            const stored = await finalizeStagedMediaFile({ stagingPath: file.stagingPath, originalName: file.originalName, alt, contentType: file.contentType, env });
            stagedPath = '';
            finalizedStoragePath = stored.storagePath;
            const data = await repo.createMedia({ path: stored.path, alt: stored.alt, type: stored.type, status: 'active', processing_status: 'ready', original_size_bytes: stored.size, final_size_bytes: stored.size });
            dbSaved = true;
            return json(res, 200, { ok: true, data });
          } catch (error) {
            if (error.status === 400 || error.code?.startsWith?.('MEDIA_') || error.code?.startsWith?.('INVALID_MEDIA') || error.code === 'EMPTY_MEDIA_FILE') return apiError(res, 400, error.code || 'INVALID_MEDIA_UPLOAD', error.message);
            throw error;
          } finally {
            if (stagedPath && !keepStaging) await removeFileQuietly(stagedPath);
            if (finalizedStoragePath && !dbSaved) await removeFileQuietly(finalizedStoragePath);
          }
        }
      }
      if (url.pathname.startsWith('/api/admin/media/')) {
        const parts = url.pathname.split('/').filter(Boolean);
        const id = parts[3];
        const media = await repo.getMedia(id);
        if (!media) return apiError(res, 404, 'MEDIA_NOT_FOUND', 'A média elem nem található.');
        if (parts[4] === 'file' && req.method === 'GET') {
          try {
            const filePath = storagePathForPublicPath(media.path, env);
            if (isVideoType(media.type)) return sendFileRange(req, res, filePath, media.type);
            const data = await readFile(filePath);
            res.writeHead(200, { 'content-type': media.type || 'application/octet-stream', 'cache-control': 'private, max-age=60', 'x-content-type-options': 'nosniff' });
            return res.end(data);
          } catch (error) {
            if (error.status === 400 || error.code === 'ENOENT') return apiError(res, 404, 'MEDIA_FILE_NOT_FOUND', 'A média fájl nem található.');
            throw error;
          }
        }
        if (req.method === 'PATCH' || req.method === 'PUT') {
          try { const data = await repo.updateMedia(id, await body(req)); return data ? json(res, 200, { ok: true, data }) : apiError(res, 404, 'MEDIA_NOT_FOUND', 'A média elem nem található.'); }
          catch (error) { if (error.status === 400 || error.code === 'VALIDATION_ERROR') return apiError(res, 400, 'INVALID_MEDIA', error.message); throw error; }
        }
        if (req.method === 'DELETE') { try { const data = await repo.archiveMedia(id); return data ? json(res, 200, { ok: true, data }) : apiError(res, 404, 'MEDIA_NOT_FOUND', 'A média elem nem található.'); } catch (error) { if (error.status === 400 || error.code === 'VALIDATION_ERROR') return apiError(res, 400, 'INVALID_MEDIA', error.message); throw error; } }
      }
      if (url.pathname === '/api/admin/publish' && req.method === 'POST') return json(res, 200, { ok: true, publish: await publishAfterSave(user, 'Kézi újraélesítés') });
      if (url.pathname.startsWith('/api/admin/publish/rollback/') && req.method === 'POST') { const snap = await repo.publishSnapshot(url.pathname.split('/').pop()); if (!snap) return apiError(res, 404, 'SNAPSHOT_NOT_FOUND', 'Snapshot nem található.'); await repo.importContentSnapshot(snap.content_json); return json(res, 200, { ok: true, publish: await publishAfterSave(user, `Rollback: ${snap.id}`) }); }
      if (url.pathname === '/admin/dashboard') return redirect(res, '/admin/pages');
      if (url.pathname === '/admin/publish') return html(res, publishPanel({ snapshots: await repo.publishSnapshots(20) }), 200, '/admin/publish');
      if (url.pathname === '/admin/pages') return html(res, pagesTable(await repo.pages()), 200, '/admin/pages');
      if (url.pathname.startsWith('/admin/pages/')) { const page = await repo.page(url.pathname.split('/').pop()); return page ? html(res, pageForm(page), 200, '/admin/pages') : html(res, '<p class="msg err">Az oldal nem található.</p>', 404); }
      if (url.pathname === '/admin/menu') return html(res, navHtml(await repo.nav(), await repo.pages()), 200, '/admin/menu');
      if (url.pathname === '/admin/media') return html(res, mediaPanel({ maxBytes: mediaConfig(env).maxBytes, videoMaxBytes: mediaConfig(env).videoMaxBytes, documentMaxBytes: mediaConfig(env).documentMaxBytes }), 200, '/admin/media');
      if (url.pathname === '/admin/settings') return html(res, settingsPanel(await repo.getSiteSettings()), 200, '/admin/settings');
      return url.pathname.startsWith('/api/') ? apiError(res, 404, 'NOT_FOUND', 'Not found') : html(res, '<p class="msg err">Nem található.</p>', 404);
    } catch (error) {
      const message = env.NODE_ENV === 'production' ? 'Szerverhiba.' : error.message;
      return req.url?.startsWith('/api/') ? apiError(res, 500, error.code || 'SERVER_ERROR', message) : html(res, `<p class="msg err">${message}</p>`, 500);
    }
  });
}
