import { clearAuthCookies, resolveAdminContextFromRequest, validateCsrf } from './auth.mjs';
import { requiredAllowed, routeRequirement } from './permissions.mjs';
import { writeAuditEvent } from './audit.mjs';

export function json(res, status, body, headers = {}) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers }); res.end(JSON.stringify(body)); }
export function apiError(res, status, code, message, details, headers = {}) { return json(res, status, { ok: false, error: { code, message, ...(details ? { details } : {}) } }, headers); }
export function forbidden(res, api = true) { return api ? apiError(res, 403, 'FORBIDDEN', 'Nincs jogosultság a művelethez.') : null; }
export function methodNotAllowed(res, allowed = []) { return apiError(res, 405, 'METHOD_NOT_ALLOWED', 'Nem támogatott HTTP metódus.', undefined, { allow: allowed.join(', ') }); }
async function safeAudit(repo, req, event) { try { await writeAuditEvent(repo, req, event); } catch (error) { console.error('admin audit insert failed', { code: error.code, message: error.message }); } }
export async function authorizeAdminRequest({ req, res, repo, env = process.env, requirement = null, htmlForbidden = null } = {}) {
  const url = new URL(req.url, 'http://localhost');
  const reqSpec = requirement || routeRequirement(req.method, url.pathname);
  if (reqSpec?.methodAllowed === false) { methodNotAllowed(res, reqSpec.allowed || []); return { ok: false, handled: true }; }
  if (reqSpec?.unmapped) { apiError(res, 404, 'NOT_FOUND', 'Not found'); return { ok: false, handled: true }; }
  if (reqSpec?.public) return { ok: true, public: true, requirement: reqSpec };
  const context = await resolveAdminContextFromRequest(req, repo, env);
  if (!context) {
    if (url.pathname.startsWith('/api/')) apiError(res, 401, 'UNAUTHENTICATED', 'Bejelentkezés szükséges.', undefined, { 'set-cookie': clearAuthCookies(env) });
    else { res.writeHead(303, { location: '/admin/login', 'set-cookie': clearAuthCookies(env) }); res.end(); }
    return { ok: false, handled: true };
  }
  if (reqSpec?.csrf && !(await validateCsrf(req, context, repo))) { await safeAudit(repo, req, { event_code: 'admin_csrf_rejected', result: 'denied', actor: context.user, metadata: { method: req.method, pathname: url.pathname } }); apiError(res, 403, 'FORBIDDEN', 'Érvénytelen CSRF token.'); return { ok: false, handled: true, context }; }
  if (reqSpec?.required && !requiredAllowed(context.permissions, reqSpec.required)) {
    await safeAudit(repo, req, { event_code: 'admin_authorization_denied', result: 'denied', actor: context.user, scope_code: reqSpec.required[0]?.scope || null, action_code: reqSpec.required[0]?.action || null, metadata: { method: req.method, pathname: url.pathname, requiredScope: reqSpec.required[0]?.scope || null, requiredAction: reqSpec.required[0]?.action || null } });
    if (url.pathname.startsWith('/api/')) apiError(res, 403, 'FORBIDDEN', 'Nincs jogosultság a művelethez.');
    else if (htmlForbidden) htmlForbidden(context);
    else { res.writeHead(403, { 'content-type': 'text/html; charset=utf-8' }); res.end('<p class="msg err">Nincs jogosultság az oldal megtekintéséhez.</p>'); }
    return { ok: false, handled: true, context };
  }
  return { ok: true, context, requirement: reqSpec };
}
export function requireActions(context, requirements = []) { return requiredAllowed(context?.permissions, requirements); }
