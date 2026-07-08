import http from 'node:http';
import { authenticate, signSession, sessionCookie, clearSessionCookie, requireAuthFromRequest } from './auth.mjs';
import { parseJsonItems, validateLoginPayload } from './validation.mjs';
import { layout, loginHtml, navHtml, pageForm, pagesTable } from './render.mjs';

const apiError = (res, status, code, message) => json(res, status, { ok: false, error: { code, message } });
const json = (res, status, body, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers }); res.end(JSON.stringify(body)); };
const html = (res, body, status = 200) => { res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' }); res.end(layout(body)); };
const redirect = (res, location, headers = {}) => { res.writeHead(303, { location, ...headers }); res.end(); };
async function rawBody(req) { const chunks = []; for await (const c of req) chunks.push(c); return Buffer.concat(chunks).toString('utf8'); }
async function body(req) { const raw = await rawBody(req); if (!raw) return {}; if (req.headers['content-type']?.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(raw)); return JSON.parse(raw); }
function wantsHtml(req) { return String(req.headers.accept || '').includes('text/html'); }
function authed(req, env) { return requireAuthFromRequest({ headers: { get: (name) => req.headers[name.toLowerCase()] || '' } }, env); }

function validateNavPayload(payload) {
  if (!Array.isArray(payload?.items) || payload.items.length === 0) return { ok: false, error: { code: 'INVALID_NAVIGATION_ITEMS', message: 'Legalább egy menüpont szükséges.' } };
  const required = ['id', 'title', 'href', 'sort_order', 'status'];
  for (const [index, item] of payload.items.entries()) {
    if (!item || typeof item !== 'object') return { ok: false, error: { code: 'INVALID_NAVIGATION_ITEM', message: `Hibás menüpont: ${index + 1}.` } };
    for (const field of required) {
      if (item[field] === undefined || item[field] === null || String(item[field]).trim() === '') return { ok: false, error: { code: 'INVALID_NAVIGATION_ITEM', message: `Hiányzó menüpont mező: ${field}.` } };
    }
  }
  return { ok: true, data: payload.items };
}

export function createAdminServer({ repo, env = process.env } = {}) {
  if (!repo) throw new Error('createAdminServer requires repo');
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
        return wantsHtml(req) ? redirect(res, '/admin/dashboard', { 'set-cookie': cookie }) : json(res, 200, { ok: true, data: { user } }, { 'set-cookie': cookie });
      }
      if (url.pathname === '/api/admin/logout') return redirect(res, '/admin/login', { 'set-cookie': clearSessionCookie() });
      const user = authed(req, env);
      if (!user) return url.pathname.startsWith('/api/') ? apiError(res, 401, 'UNAUTHENTICATED', 'Bejelentkezés szükséges.') : redirect(res, '/admin/login');
      if (url.pathname === '/api/admin/session') return json(res, 200, { ok: true, data: { user } });
      if (url.pathname === '/api/admin/pages') return json(res, 200, { ok: true, data: await repo.pages() });
      if (url.pathname.startsWith('/api/admin/pages/')) {
        const id = url.pathname.split('/').pop();
        const page = await repo.page(id);
        if (!page) return apiError(res, 404, 'PAGE_NOT_FOUND', 'Az oldal nem található.');
        if (req.method === 'GET') return json(res, 200, { ok: true, data: page });
        await repo.updatePage(id, await body(req));
        return json(res, 200, { ok: true });
      }
      if (url.pathname === '/api/admin/blocks' && req.method === 'POST') {
        let payload;
        try { payload = await body(req); parseJsonItems(payload.items); }
        catch (error) { return apiError(res, 400, error.code || 'INVALID_BLOCK_JSON', error.message || 'Hibás JSON.'); }
        return json(res, 200, { ok: true, data: await repo.upsertBlock(payload) });
      }
      if (url.pathname.startsWith('/api/admin/blocks/') && req.method === 'DELETE') { await repo.deleteBlock(url.pathname.split('/').pop()); return json(res, 200, { ok: true }); }
      if (url.pathname === '/api/admin/navigation') { if (req.method === 'GET') return json(res, 200, { ok: true, data: await repo.nav() }); const valid = validateNavPayload(await body(req)); if (!valid.ok) return json(res, 400, valid); await repo.updateNav(valid.data); return json(res, 200, { ok: true }); }
      if (url.pathname === '/admin/dashboard') return html(res, '<div class="card"><h2>Dashboard MVP</h2><p>Oldalak, blokkok és menüpontok szerkesztése.</p></div>');
      if (url.pathname === '/admin/pages') return html(res, pagesTable(await repo.pages()));
      if (url.pathname.startsWith('/admin/pages/')) { const page = await repo.page(url.pathname.split('/').pop()); return page ? html(res, pageForm(page)) : html(res, '<p class="msg err">Az oldal nem található.</p>', 404); }
      if (url.pathname === '/admin/menu') return html(res, `<h2>Menü</h2>${navHtml(await repo.nav())}`);
      if (url.pathname === '/admin/media') return html(res, '<div class="card"><h2>Média</h2><p>MVP skeleton: upload későbbi PR.</p></div>');
      return url.pathname.startsWith('/api/') ? apiError(res, 404, 'NOT_FOUND', 'Not found') : html(res, '<p class="msg err">Nem található.</p>', 404);
    } catch (error) {
      const message = env.NODE_ENV === 'production' ? 'Szerverhiba.' : error.message;
      return req.url?.startsWith('/api/') ? apiError(res, 500, error.code || 'SERVER_ERROR', message) : html(res, `<p class="msg err">${message}</p>`, 500);
    }
  });
}
