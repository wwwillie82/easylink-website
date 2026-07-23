import { clearAuthCookies, resolveAdminContextFromRequest, validateCsrf } from './auth.mjs';
import { requiredAllowed, routeRequirement } from './permissions.mjs';

export function json(res, status, body, headers = {}) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers }); res.end(JSON.stringify(body)); }
export function apiError(res, status, code, message, details, headers = {}) { return json(res, status, { ok: false, error: { code, message, ...(details ? { details } : {}) } }, headers); }
export function forbidden(res, api = true) { return api ? apiError(res, 403, 'FORBIDDEN', 'Nincs jogosultság a művelethez.') : null; }
export function methodNotAllowed(res, allowed = []) { return apiError(res, 405, 'METHOD_NOT_ALLOWED', 'Nem támogatott HTTP metódus.', undefined, { allow: allowed.join(', ') }); }
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
  if (reqSpec?.csrf && !(await validateCsrf(req, context, repo))) { apiError(res, 403, 'FORBIDDEN', 'Érvénytelen CSRF token.'); return { ok: false, handled: true, context }; }
  if (reqSpec?.required && !requiredAllowed(context.permissions, reqSpec.required)) {
    if (url.pathname.startsWith('/api/')) apiError(res, 403, 'FORBIDDEN', 'Nincs jogosultság a művelethez.');
    else if (htmlForbidden) htmlForbidden(context);
    else { res.writeHead(403, { 'content-type': 'text/html; charset=utf-8' }); res.end('<p class="msg err">Nincs jogosultság az oldal megtekintéséhez.</p>'); }
    return { ok: false, handled: true, context };
  }
  return { ok: true, context, requirement: reqSpec };
}
export function requireActions(context, requirements = []) { return requiredAllowed(context?.permissions, requirements); }
