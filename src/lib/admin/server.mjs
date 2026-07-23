import http from 'node:http';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { open, readFile, stat } from 'node:fs/promises';
import { authenticate, createLoginSession, clearAuthCookies, sameOriginOk } from './auth.mjs';
import { parseJsonItems, validateLoginPayload } from './validation.mjs';
import { layout, loginHtml, mediaPanel, navHtml, pageForm, pagesTable, publishPanel, settingsPanel } from './render.mjs';
import { usersHtml, forgotPasswordHtml, resetPasswordHtml } from './render/users.mjs';
import { requestPasswordReset, confirmPasswordReset, issuePasswordReset } from './password-reset.mjs';
import { authorizeAdminRequest, apiError as policyApiError } from './policy.mjs';
import { buildPageEffectiveMutationPlan, buildBlockEffectiveMutationPlan, buildHomeAggregateEffectiveMutationPlan, buildNavigationEffectiveMutationPlan, classifyMediaMutation, hasAction } from './permissions.mjs';
import { parsedBody } from './request-body.mjs';
import { buildPreviewRelease, createPublishService, PublishInProgressError } from './publish.mjs';
import { datedMediaTarget, finalizeStagedMediaFile, isVideoType, maxRequestBytes, mediaConfig, mediaValidationError, removeFileQuietly, storagePathForPublicPath, validateMediaFile } from './media-storage.mjs';
import { parseMediaMultipart } from './multipart-upload.mjs';
import { isValidHttpExternalUrl, normalizeNavigationTargetType, positiveNavigationPageId } from '../content/internal-links.mjs';
import { normalizeSnapshotForReferenceValidation, referenceValidationSummary, validateContentReferences } from '../content/reference-validation.mjs';
import { validateNavigationHierarchy } from '../content/navigation-hierarchy.mjs';

const apiError = (res, status, code, message, details) => json(res, status, { ok: false, error: { code, message, ...(details ? { details } : {}) } });
const json = (res, status, body, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers }); res.end(JSON.stringify(body)); };
const html = (res, body, status = 200, current = '', adminContext = null) => { res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' }); res.end(layout(body, { current, adminContext })); };
const redirect = (res, location, headers = {}) => { res.writeHead(303, { location, ...headers }); res.end(); };
async function body(req) { return parsedBody(req); }
function wantsHtml(req) { return String(req.headers.accept || '').includes('text/html'); }
function navValidationCode(error) {
  if (error?.code === 'DUPLICATE_NAVIGATION_HREF' || /Duplikált menüpont link/i.test(String(error?.message || ''))) return 'DUPLICATE_NAVIGATION_HREF';
  if (error?.code === 'ER_DUP_ENTRY') return 'DUPLICATE_NAVIGATION_HREF';
  return 'INVALID_NAVIGATION_ITEM';
}
async function multipart(req, env) {
  const maxBytes = maxRequestBytes(env);
  const len = Number(req.headers['content-length'] || 0);
  if (len && len > maxBytes + 8192) throw mediaValidationError('A feltöltés túl nagy.', 'MEDIA_FILE_TOO_LARGE');
  return parseMediaMultipart(req, { env, maxBytes });
}
async function readHeader(filePath) { const fh = await open(filePath, 'r'); try { const b = Buffer.alloc(64); const { bytesRead } = await fh.read(b, 0, b.length, 0); return b.subarray(0, bytesRead); } finally { await fh.close(); } }
const previewReleases = new Map();
function decodePreviewPath(pathname) { try { return decodeURIComponent(String(pathname || '').replace(/^\/+/, '')); } catch { return null; } }
function safePreviewPath(root, pathname) { const decoded = decodePreviewPath(pathname); if (decoded == null) return { error: 'malformed' }; const rel = decoded || 'index.html'; const withIndex = rel.endsWith('/') ? rel + 'index.html' : (path.extname(rel) ? rel : rel + '/index.html'); const target = path.normalize(path.join(root, withIndex)); if (!target.startsWith(path.normalize(root + path.sep))) return { error: 'traversal' }; return { filePath: target }; }
function previewPrefix(pageId) { return `/admin/pages/${pageId}/home/preview`; }
function rewritePreviewUrl(value, prefix) { if (!value || /^(https?:|mailto:|tel:|#)/i.test(value) || !value.startsWith('/')) return value; return `${prefix}${value}`; }
function rewritePreviewBody(data, type, prefix) { const mime = String(type || '').toLowerCase(); if (!mime.startsWith('text/html') && !mime.startsWith('text/css')) return data; let text = data.toString('utf8'); if (mime.startsWith('text/html')) text = text.replace(/\b(href|src)=(["'])(\/[^"']*)\2/g, (_m, attr, quote, url) => `${attr}=${quote}${rewritePreviewUrl(url, prefix)}${quote}`); if (mime.startsWith('text/css')) text = text.replace(/url\((["']?)(\/[^)'"]+)\1\)/g, (_m, quote, url) => `url(${quote}${rewritePreviewUrl(url, prefix)}${quote})`); return Buffer.from(text, 'utf8'); }
function contentTypeFor(filePath) { const ext = path.extname(String(filePath || '')).toLowerCase(); if (ext === '.html') return 'text/html; charset=utf-8'; if (ext === '.css') return 'text/css; charset=utf-8'; if (ext === '.js' || ext === '.mjs') return 'application/javascript; charset=utf-8'; if (ext === '.json') return 'application/json; charset=utf-8'; if (ext === '.svg') return 'image/svg+xml'; if (ext === '.webp') return 'image/webp'; if (ext === '.png') return 'image/png'; if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'; if (ext === '.mp4') return 'video/mp4'; if (ext === '.woff') return 'font/woff'; if (ext === '.woff2') return 'font/woff2'; if (ext === '.ico') return 'image/x-icon'; return 'application/octet-stream'; }
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
  const required = ['title', 'status'];
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
    const isGroup = targetType === 'group';
    if (isGroup) {
      if (String(item.href || '').trim() || hasTargetPageId || hasTitleOverride) return { ok: false, error: { code: 'INVALID_NAVIGATION_TARGET', message: 'Csoportosító menüpontnak nem lehet célja.' } };
    }
    if (hasTargetType && targetType === 'page') {
      const pageId = positiveNavigationPageId(item.target_page_id);
      if (!pageId) return { ok: false, error: { code: 'INVALID_NAVIGATION_TARGET', message: 'Belső oldal célhoz oldalazonosító szükséges.' } };
      const page = pageMap.get(pageId);
      if (pageMap.size && !page) return { ok: false, error: { code: 'INVALID_NAVIGATION_TARGET', message: 'A kiválasztott belső oldal nem található.' } };
      if (page && item.status === 'published' && String(page.status || '') !== 'published') return { ok: false, error: { code: 'NAVIGATION_TARGET_PAGE_NOT_PUBLISHED', message: 'Publikus menüpont csak publikus oldalra mutathat.' } };
      if (page && String(item.href || '') !== String(page.route || '')) return { ok: false, error: { code: 'INVALID_NAVIGATION_TARGET', message: 'A belső oldal linkje csak az oldal aktuális route-ja lehet.' } };
      if (page && hasTitleOverride && String(item.title || '') !== String(item.title_override || '').trim()) return { ok: false, error: { code: 'INVALID_NAVIGATION_TARGET', message: 'Az egyedi menüfelirat és a kompatibilitási title mező eltér.' } };
      if (page && !hasTitleOverride && String(item.title || '') !== String(page.title || '')) return { ok: false, error: { code: 'INVALID_NAVIGATION_TARGET', message: 'Örökölt feliratnál a title az oldal címe legyen.' } };
    }
    if (hasTargetType && targetType === 'external' && !isValidHttpExternalUrl(item.href)) return { ok: false, error: { code: 'INVALID_NAVIGATION_TARGET', message: 'A külső URL csak http:// vagy https:// lehet.' } };
    if (hasTargetType && targetType !== 'page' && targetType !== 'group' && (hasTargetPageId || hasTitleOverride)) return { ok: false, error: { code: 'INVALID_NAVIGATION_TARGET', message: 'Legacy és külső link célhoz nem tartozhat oldalazonosító vagy menüfelirat override.' } };
    if (!isGroup && String(item.href || '').trim() === '') return { ok: false, error: { code: 'INVALID_NAVIGATION_ITEM', message: 'A végpont menüpont linkje kötelező.' } };
    const effectiveHref = isGroup ? '' : String(item.href || '').trim();
    const previousHrefIndex = effectiveHrefs.get(effectiveHref);
    if (effectiveHref && previousHrefIndex !== undefined) return { ok: false, error: { code: 'DUPLICATE_NAVIGATION_HREF', message: `Duplikált menüpont link (${previousHrefIndex + 1}. és ${index + 1}. sor).` } };
    if (effectiveHref) effectiveHrefs.set(effectiveHref, index);
  }
  const hierarchy = validateNavigationHierarchy(payload.items, { pagesById: pageMap });
  if (!hierarchy.ok) return { ok: false, error: { code: hierarchy.errors[0]?.code || 'INVALID_NAVIGATION_HIERARCHY', message: 'Hibás menühierarchia.' } };
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
      if ((url.pathname === '/admin/forgot-password' || url.pathname === '/admin/reset-password') && req.method !== 'GET') return policyApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Nem támogatott HTTP metódus.', undefined, { allow: 'GET' });
      if (url.pathname === '/api/admin/password-reset/request' && req.method !== 'POST') return policyApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Nem támogatott HTTP metódus.', undefined, { allow: 'POST' });
      if (url.pathname === '/api/admin/password-reset/confirm' && req.method !== 'POST') return policyApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Nem támogatott HTTP metódus.', undefined, { allow: 'POST' });
      if (url.pathname === '/admin/forgot-password' && req.method === 'GET') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(layout(forgotPasswordHtml(), { nav: false })); }
      if (url.pathname === '/admin/reset-password' && req.method === 'GET') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(layout(resetPasswordHtml(url.searchParams.get('token') || ''), { nav: false })); }
      if (url.pathname === '/api/admin/password-reset/request' && req.method === 'POST') { if (!sameOriginOk(req)) return apiError(res, 403, 'FORBIDDEN', 'Érvénytelen kérés.'); const result = await requestPasswordReset(repo, (await body(req)).email, { env, requestedIp: req.socket?.remoteAddress || null }); return json(res, 200, { ok: true, message: result.message }); }
      if (url.pathname === '/api/admin/password-reset/confirm' && req.method === 'POST') { if (!sameOriginOk(req)) return apiError(res, 403, 'FORBIDDEN', 'Érvénytelen kérés.'); try { const result = await confirmPasswordReset(repo, await body(req)); return json(res, 200, { ok: true, data: result }); } catch (error) { return apiError(res, error.status || 400, error.code || 'INVALID_RESET_TOKEN', error.message || 'A jelszóbeállító link érvénytelen vagy lejárt.'); } }
      if ((url.pathname === '/admin' || url.pathname === '/admin/login') && req.method !== 'GET') return policyApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Nem támogatott HTTP metódus.', undefined, { allow: 'GET' });
      if (url.pathname === '/api/admin/login' && req.method !== 'POST') return policyApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Nem támogatott HTTP metódus.', undefined, { allow: 'POST' });
      if ((url.pathname === '/admin' || url.pathname === '/admin/login') && req.method === 'GET') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(loginHtml()); }
      if (url.pathname === '/api/admin/login' && req.method === 'POST') {
        const payload = await body(req);
        const valid = validateLoginPayload(payload);
        if (!valid.ok) return wantsHtml(req) ? (res.writeHead(400, { 'content-type': 'text/html; charset=utf-8' }), res.end(loginHtml(valid.error.message))) : json(res, 400, valid);
        if (!sameOriginOk(req)) return apiError(res, 403, 'FORBIDDEN', 'Érvénytelen belépési kérés.');
        const user = await authenticate(repo, valid.data.email, valid.data.password);
        if (!user) return wantsHtml(req) ? (res.writeHead(401, { 'content-type': 'text/html; charset=utf-8' }), res.end(loginHtml('Hibás belépési adatok.'))) : apiError(res, 401, 'INVALID_CREDENTIALS', 'Hibás belépési adatok.');
        const session = await createLoginSession(repo, user, env);
        return wantsHtml(req) ? redirect(res, '/admin/pages', { 'set-cookie': session.cookies }) : json(res, 200, { ok: true, data: { user } }, { 'set-cookie': session.cookies });
      }
      if (url.pathname === '/api/admin/logout' && req.method === 'GET') return policyApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Nem támogatott HTTP metódus.', undefined, { allow: 'POST' });
      const auth = await authorizeAdminRequest({ req, res, repo, env, htmlForbidden: (ctx) => html(res, '<p class="msg err">Nincs jogosultság az oldal megtekintéséhez.</p>', 403, url.pathname, ctx) });
      if (!auth.ok) return;
      const adminContext = auth.context;
      const user = adminContext.user;
      if (url.pathname === '/api/admin/logout' && req.method === 'POST') { await repo.revokeAdminSession?.(adminContext.session.id); return redirect(res, '/admin/login', { 'set-cookie': clearAuthCookies(env) }); }
      if (url.pathname === '/api/admin/session' && req.method === 'GET') return json(res, 200, { ok: true, data: { user, permissions: adminContext.permissions, expiresAt: adminContext.session.expiresAt } });
      if (url.pathname === '/api/admin/pages') { if (!['GET','POST'].includes(req.method)) return apiError(res, 405, 'METHOD_NOT_ALLOWED', 'Nem támogatott HTTP metódus.'); if (req.method === 'POST') { const payload = await body(req); if (!payload.title || !payload.route) return apiError(res, 400, 'INVALID_PAGE', 'Oldalnév és URL szükséges.'); let data; try { data = await repo.createPage(payload); } catch (error) { if (error.code === 'HOME_USE_HOME_EDITOR') return apiError(res, 409, 'HOME_USE_HOME_EDITOR', error.message); if (error.status === 400 || error.code === 'VALIDATION_ERROR') return apiError(res, 400, 'INVALID_PAGE', error.message); throw error; } return json(res, 200, { ok: true, data, publish: await publishAfterSave(user, `Oldal létrehozás: ${data.id}`) }); } return json(res, 200, { ok: true, data: await repo.pages() }); }


      if (url.pathname === '/api/admin/users') {
        if (!['GET','POST'].includes(req.method)) return apiError(res, 405, 'METHOD_NOT_ALLOWED', 'Nem támogatott HTTP metódus.');
        if (req.method === 'GET') return json(res, 200, { ok: true, data: await repo.listAdminUsers() });
        try { const data = await repo.createAdminUserWithPermissions(await body(req)); let reset = { ok: true }; try { await issuePasswordReset(repo, data, { env, requestedIp: req.socket?.remoteAddress || null }); } catch (error) { reset = { ok: false, code: error.code || 'SEND_FAILED', message: error.message || 'A link küldése sikertelen, küldd újra később.' }; } return json(res, 200, { ok: true, data, reset }); } catch (error) { return apiError(res, error.status || 400, error.code || 'INVALID_USER', error.message); }
      }
      if (/^\/api\/admin\/users\/\d+(?:\/(?:revoke-sessions|send-reset-link))?$/.test(url.pathname)) {
        const parts = url.pathname.split('/').filter(Boolean); const id = Number(parts[3]);
        if (url.pathname.endsWith('/revoke-sessions')) { if (req.method !== 'POST') return apiError(res, 405, 'METHOD_NOT_ALLOWED', 'Nem támogatott HTTP metódus.'); await repo.revokeAdminUserSessions(id); return json(res, 200, { ok: true, data: { selfRevoked: Number(id) === Number(user.id) } }); }
        if (url.pathname.endsWith('/send-reset-link')) { if (req.method !== 'POST') return apiError(res, 405, 'METHOD_NOT_ALLOWED', 'Nem támogatott HTTP metódus.'); const target = await repo.getAdminUserWithPermissions(id); if (!target || target.status !== 'active') return apiError(res, 404, 'USER_NOT_FOUND', 'Aktív felhasználó nem található.'); try { await issuePasswordReset(repo, target, { env, requestedIp: req.socket?.remoteAddress || null }); return json(res, 200, { ok: true }); } catch (error) { return apiError(res, error.status || 503, error.code || 'SEND_FAILED', error.message || 'A küldés sikertelen.'); } }
        if (!['GET','PUT','PATCH'].includes(req.method)) return apiError(res, 405, 'METHOD_NOT_ALLOWED', 'Nem támogatott HTTP metódus.');
        if (req.method === 'GET') { const data = await repo.getAdminUserWithPermissions(id); return data ? json(res, 200, { ok: true, data }) : apiError(res, 404, 'USER_NOT_FOUND', 'A felhasználó nem található.'); }
        const current = await repo.getAdminUserWithPermissions(id); if (!current) return apiError(res, 404, 'USER_NOT_FOUND', 'A felhasználó nem található.'); const payload = await body(req); const disable = current.status === 'active' && payload.status === 'disabled'; const normal = payload.display_name !== undefined || payload.displayName !== undefined || payload.email !== undefined || payload.permissions !== undefined || (current.status === 'disabled' && payload.status === 'active'); if ((normal && !hasAction(adminContext.permissions,'users','save')) || (disable && !hasAction(adminContext.permissions,'users','archive'))) return apiError(res, 403, 'FORBIDDEN', 'Nincs jogosultság a művelethez.');
        try { return json(res, 200, { ok: true, data: await repo.updateAdminUserWithPermissions(id, payload, user.id) }); } catch (error) { return apiError(res, error.status || 400, error.code || 'INVALID_USER', error.message); }
      }

      if (/\/admin\/pages\/\d+\/home\/preview\/.*(?:%2e|%2f|\.\.)/i.test(req.url || '') || /^\/admin\/pages\/\d+\/home(?!\/preview|$)/.test(url.pathname)) return apiError(res, 400, 'INVALID_PREVIEW_PATH', 'Hibás előnézeti útvonal.');
      const previewMatch = /^\/admin\/pages\/(\d+)\/home\/preview(?:\/(.*))?$/.exec(url.pathname);
      if (previewMatch && req.method === 'GET') {
        const page = await repo.page(previewMatch[1]);
        if (!page?.page || page.page.route !== '/' || page.page.type !== 'home') return html(res, '<p class="msg err">Nem főoldal.</p>', 404);
        let releasePath = previewReleases.get(String(previewMatch[1]));
        if (!releasePath || !previewMatch[2]) {
          const built = await buildPreviewRelease({ repo, env });
          if (!built.ok) return html(res, `<p class="msg err">${built.error}</p>`, 500);
          releasePath = built.releasePath;
          previewReleases.set(String(previewMatch[1]), releasePath);
          if (!previewMatch[2]) return redirect(res, `/admin/pages/${previewMatch[1]}/home/preview/index.html`);
        }
        const safe = safePreviewPath(releasePath, previewMatch[2] || 'index.html');
        if (safe.error) return apiError(res, 400, 'INVALID_PREVIEW_PATH', 'Hibás előnézeti útvonal.');
        const filePath = safe.filePath;
        try { const type = contentTypeFor(filePath); const raw = await readFile(filePath); const data = rewritePreviewBody(raw, type, previewPrefix(previewMatch[1])); res.writeHead(200, { 'content-type': type, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' }); return res.end(data); }
        catch { return html(res, '<p class="msg err">Előnézeti fájl nem található.</p>', 404); }
      }
      const homeApiMatch = /^\/api\/admin\/pages\/(\d+)\/home$/.exec(url.pathname);
      if (homeApiMatch && !['PUT'].includes(req.method)) return apiError(res, 405, 'METHOD_NOT_ALLOWED', 'Nem támogatott HTTP metódus.');
      if (homeApiMatch && req.method === 'PUT') {
        try { const payload = await body(req); const current = await repo.page(homeApiMatch[1]); const cls = buildHomeAggregateEffectiveMutationPlan(current, payload); if (cls.noOp) return apiError(res, 400, 'INVALID_EMPTY_MUTATION', 'Nincs menthető változás.'); if ((cls.needsSave && !hasAction(adminContext.permissions, 'pages', 'save')) || (cls.needsArchive && !hasAction(adminContext.permissions, 'pages', 'archive'))) return apiError(res, 403, 'FORBIDDEN', 'Nincs jogosultság a művelethez.'); const data = await repo.updateHomePageAtomic(homeApiMatch[1], cls.nextPayload || payload); return json(res, 200, { ok: true, data, warnings: data.warnings || [] }); }
        catch (error) { const code = error.code || 'INVALID_HOME'; const status = code === 'HOME_EDIT_CONFLICT' ? 409 : (error.status || 400); return apiError(res, status, code, error.message || 'Hibás főoldal tartalom.', error.details); }
      }
      if (url.pathname.startsWith('/api/admin/pages/')) {
        const id = url.pathname.split('/').pop();
        const page = await repo.page(id);
        if (!page) return apiError(res, 404, 'PAGE_NOT_FOUND', 'Az oldal nem található.');
        if (req.method === 'GET') return json(res, 200, { ok: true, data: page });
        if (!['PUT','PATCH'].includes(req.method)) return apiError(res, 405, 'METHOD_NOT_ALLOWED', 'Nem támogatott HTTP metódus.');
        try { const payload = await body(req); const cls = buildPageEffectiveMutationPlan(page.page || page, payload); if (cls.noOp) return apiError(res, 400, 'INVALID_EMPTY_MUTATION', 'Nincs menthető változás.'); if ((cls.needsSave && !hasAction(adminContext.permissions, 'pages', 'save')) || (cls.needsArchive && !hasAction(adminContext.permissions, 'pages', 'archive'))) return apiError(res, 403, 'FORBIDDEN', 'Nincs jogosultság a művelethez.'); await repo.updatePage(id, cls.next || payload); } catch (error) { if (error.code === 'HOME_USE_HOME_EDITOR') return apiError(res, 409, 'HOME_USE_HOME_EDITOR', error.message); if (error.code === 'HOME_CANONICAL_USE_HOME_EDITOR') return apiError(res, 409, 'HOME_CANONICAL_USE_HOME_EDITOR', error.message); if (error.code === 'PAGE_IN_USE') return apiError(res, 409, 'PAGE_IN_USE', error.message, error.details); if (error.code === 'DUPLICATE_NAVIGATION_HREF') return apiError(res, 409, 'DUPLICATE_NAVIGATION_HREF', error.message, error.details); if (error.status === 400 || error.code === 'VALIDATION_ERROR') return apiError(res, 400, 'INVALID_PAGE', error.message); throw error; }
        return json(res, 200, { ok: true, publish: await publishAfterSave(user, `Oldal mentés: ${id}`) });
      }
      if (url.pathname === '/api/admin/blocks' && req.method === 'POST') {
        let payload;
        try { payload = await body(req); parseJsonItems(payload.items); }
        catch (error) { return apiError(res, 400, error.code || 'INVALID_BLOCK_JSON', error.message || 'Hibás JSON.'); }
        const currentBlock = payload.id && repo.block ? await repo.block(payload.id) : null;
        const cls = buildBlockEffectiveMutationPlan(payload.id && currentBlock ? currentBlock : null, payload);
        if (cls.noOp) return apiError(res, 400, 'INVALID_EMPTY_MUTATION', 'Nincs menthető változás.');
        if ((cls.needsSave && !hasAction(adminContext.permissions, 'pages', 'save')) || (cls.needsArchive && !hasAction(adminContext.permissions, 'pages', 'archive'))) return apiError(res, 403, 'FORBIDDEN', 'Nincs jogosultság a művelethez.');
        let data;
        try { data = await repo.upsertBlock(cls.next || payload); }
        catch (error) { if (error.code === 'HOME_CANONICAL_USE_HOME_EDITOR') return apiError(res, 409, 'HOME_CANONICAL_USE_HOME_EDITOR', error.message); if (error.status === 400 || error.code === 'VALIDATION_ERROR') return apiError(res, 400, 'INVALID_BLOCK', error.message); throw error; }
        return json(res, 200, { ok: true, data, publish: await publishAfterSave(user, `Blokk mentés: ${payload.page_id}`) });
      }
      if (url.pathname.startsWith('/api/admin/blocks/') && req.method === 'DELETE') { try { await repo.deleteBlock(url.pathname.split('/').pop()); return json(res, 200, { ok: true, publish: await publishAfterSave(user, `Blokk inaktiválás`) }); } catch (error) { if (error.code === 'HOME_CANONICAL_USE_HOME_EDITOR') return apiError(res, 409, 'HOME_CANONICAL_USE_HOME_EDITOR', error.message); throw error; } }
      if (url.pathname === '/api/admin/settings') { if (!['GET','PUT','POST'].includes(req.method)) return apiError(res, 405, 'METHOD_NOT_ALLOWED', 'Nem támogatott HTTP metódus.'); if (req.method === 'GET') return json(res, 200, { ok: true, data: await repo.getSiteSettings() }); if (req.method === 'PUT' || req.method === 'POST') { try { const data = await repo.updateSiteSettings(await body(req), env); return json(res, 200, { ok: true, data, publish: await publishAfterSave(user, 'Alapadatok mentés') }); } catch (error) { if (error.status === 400 || error.code === 'VALIDATION_ERROR') return apiError(res, 400, 'INVALID_SETTINGS', error.message); throw error; } } }
      if (url.pathname === '/api/admin/navigation') { if (!['GET','POST','PUT'].includes(req.method)) return apiError(res, 405, 'METHOD_NOT_ALLOWED', 'Nem támogatott HTTP metódus.'); if (req.method === 'GET') return json(res, 200, { ok: true, data: await repo.nav() }); const pages = await repo.pages(); const navPayload = await body(req); const currentNav = await repo.nav(); const navCls = buildNavigationEffectiveMutationPlan(currentNav, navPayload.items || []); if (navCls.noOp) return apiError(res, 400, 'INVALID_EMPTY_MUTATION', 'Nincs menthető változás.'); if ((navCls.needsSave && !hasAction(adminContext.permissions, 'menu', 'save')) || (navCls.needsArchive && !hasAction(adminContext.permissions, 'menu', 'archive'))) return apiError(res, 403, 'FORBIDDEN', 'Nincs jogosultság a művelethez.'); const valid = validateNavPayload(navPayload, pages); if (!valid.ok) return json(res, valid.error?.code === 'NAVIGATION_TARGET_PAGE_NOT_PUBLISHED' ? 409 : 400, valid); let navigationIds; try { navigationIds = await repo.updateNav(navCls.nextRows || valid.data); } catch (error) { if (error.code === 'NAVIGATION_TARGET_PAGE_NOT_PUBLISHED') return apiError(res, 409, 'NAVIGATION_TARGET_PAGE_NOT_PUBLISHED', error.message, error.details); if (error.status === 400 || error.code === 'VALIDATION_ERROR' || error.code === 'ER_DUP_ENTRY') return apiError(res, 400, navValidationCode(error), error.code === 'ER_DUP_ENTRY' || /Duplikált menüpont link/i.test(String(error.message || '')) ? 'Duplikált menüpont link.' : error.message); throw error; } return json(res, 200, { ok: true, data: { navigationIds: Array.from(navigationIds || []), navigationMappings: navigationIds?.navigationMappings || navigationIds?.clientMappings || [] }, publish: await publishAfterSave(user, 'Menü mentés') }); }
      if (url.pathname === '/api/admin/media') {
        if (!['GET','POST'].includes(req.method)) return apiError(res, 405, 'METHOD_NOT_ALLOWED', 'Nem támogatott HTTP metódus.');
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
          try { const payload = await body(req); const cls = classifyMediaMutation(media, payload); if (cls.noOp) return apiError(res, 400, 'INVALID_EMPTY_MUTATION', 'Nincs menthető változás.'); if ((cls.needsSave && !hasAction(adminContext.permissions, 'media', 'save')) || (cls.needsArchive && !hasAction(adminContext.permissions, 'media', 'archive'))) return apiError(res, 403, 'FORBIDDEN', 'Nincs jogosultság a művelethez.'); const data = await repo.updateMedia(id, payload); return data ? json(res, 200, { ok: true, data }) : apiError(res, 404, 'MEDIA_NOT_FOUND', 'A média elem nem található.'); }
          catch (error) { if (error.status === 400 || error.code === 'VALIDATION_ERROR') return apiError(res, 400, 'INVALID_MEDIA', error.message); throw error; }
        }
        if (req.method === 'DELETE') { try { const data = await repo.archiveMedia(id); return data ? json(res, 200, { ok: true, data }) : apiError(res, 404, 'MEDIA_NOT_FOUND', 'A média elem nem található.'); } catch (error) { if (error.status === 400 || error.code === 'VALIDATION_ERROR') return apiError(res, 400, 'INVALID_MEDIA', error.message); throw error; } }
      }
      if (url.pathname === '/api/admin/publish' && req.method === 'POST') return json(res, 200, { ok: true, publish: await publishAfterSave(user, 'Kézi újraélesítés') });
      if (url.pathname.startsWith('/api/admin/publish/rollback/') && req.method === 'POST') { const snap = await repo.publishSnapshot(url.pathname.split('/').pop()); if (!snap) return apiError(res, 404, 'SNAPSHOT_NOT_FOUND', 'Snapshot nem található.'); const preflight = validateContentReferences(snap.content_json); if (!preflight.ok) return apiError(res, 409, 'CONTENT_REFERENCE_INVALID', referenceValidationSummary(preflight), preflight); const content = normalizeSnapshotForReferenceValidation(snap.content_json); await repo.importContentSnapshot(content); return json(res, 200, { ok: true, publish: await publishAfterSave(user, `Rollback: ${snap.id}`) }); }
      if (url.pathname === '/admin/dashboard') return redirect(res, '/admin/pages');
      if (url.pathname === '/admin/users') return html(res, usersHtml({ permissions: adminContext.permissions }), 200, '/admin/users', adminContext);
      if (url.pathname === '/admin/publish') return html(res, publishPanel({ snapshots: await repo.publishSnapshots(20), permissions: adminContext.permissions }), 200, '/admin/publish', adminContext);
      if (url.pathname === '/admin/pages') return html(res, pagesTable(await repo.pages(), { permissions: adminContext.permissions }), 200, '/admin/pages', adminContext);
      if (url.pathname.startsWith('/admin/pages/')) { const page = await repo.page(url.pathname.split('/').pop()); return page ? html(res, pageForm(page, { permissions: adminContext.permissions }), 200, '/admin/pages', adminContext) : html(res, '<p class="msg err">Az oldal nem található.</p>', 404); }
      if (url.pathname === '/admin/menu') return html(res, navHtml(await repo.nav(), await repo.pages(), { permissions: adminContext.permissions }), 200, '/admin/menu', adminContext);
      if (url.pathname === '/admin/media') return html(res, mediaPanel({ maxBytes: mediaConfig(env).maxBytes, videoMaxBytes: mediaConfig(env).videoMaxBytes, documentMaxBytes: mediaConfig(env).documentMaxBytes, permissions: adminContext.permissions }), 200, '/admin/media', adminContext);
      if (url.pathname === '/admin/settings') return html(res, settingsPanel(await repo.getSiteSettings(), { permissions: adminContext.permissions }), 200, '/admin/settings', adminContext);
      return url.pathname.startsWith('/api/') ? apiError(res, 404, 'NOT_FOUND', 'Not found') : html(res, '<p class="msg err">Nem található.</p>', 404);
    } catch (error) {
      const message = env.NODE_ENV === 'production' ? 'Szerverhiba.' : error.message;
      return req.url?.startsWith('/api/') ? apiError(res, 500, error.code || 'SERVER_ERROR', message) : html(res, `<p class="msg err">${message}</p>`, 500);
    }
  });
}
