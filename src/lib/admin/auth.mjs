import crypto from 'node:crypto';
import { verifyPassword } from '../db/client.mjs';
import { normalizePermissions } from './permissions.mjs';
import { parsedBody, isMultipart } from './request-body.mjs';

export const sessionCookieName = 'easylink_site_admin';
export const csrfCookieName = 'easylink_site_admin_csrf';
export const sessionMaxAge = 60 * 60 * 8;

export function tokenHash(token) { return crypto.createHash('sha256').update(String(token || '')).digest('hex'); }
export function randomToken(bytes = 32) { return crypto.randomBytes(bytes).toString('base64url'); }
function secureFlag(env = process.env) { return env.NODE_ENV === 'production' ? '; Secure' : ''; }
export function readCookie(header = '', name = sessionCookieName) {
  try { for (const part of String(header || '').split(';')) { const index = part.indexOf('='); if (index === -1) continue; const key = decodeURIComponent(part.slice(0, index).trim()); if (key === name) return decodeURIComponent(part.slice(index + 1).trim()); } } catch { return undefined; }
  return undefined;
}
export function sessionCookie(token, env = process.env) { return `${sessionCookieName}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${sessionMaxAge}; SameSite=Lax${secureFlag(env)}`; }
export function csrfCookie(token, env = process.env) { return `${csrfCookieName}=${encodeURIComponent(token)}; Path=/; Max-Age=${sessionMaxAge}; SameSite=Lax${secureFlag(env)}`; }
export function clearSessionCookie(env = process.env) { return `${sessionCookieName}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${secureFlag(env)}`; }
export function clearCsrfCookie(env = process.env) { return `${csrfCookieName}=; Path=/; Max-Age=0; SameSite=Lax${secureFlag(env)}`; }
export function clearAuthCookies(env = process.env) { return [clearSessionCookie(env), clearCsrfCookie(env)]; }

// Legacy exports intentionally no longer create trusted role/user payload sessions.
export function signSession() { return randomToken(32); }
export function verifySessionToken() { return null; }

export async function authenticate(repo, email, password) {
  const user = await repo.findAdminUserByEmail(email);
  if (!user || user.status !== 'active' || !verifyPassword(password, user.password_hash)) return null;
  await repo.markAdminLogin?.(user.id);
  return { id: user.id, email: user.email, displayName: user.display_name };
}
export async function createLoginSession(repo, user, env = process.env) {
  const sessionToken = randomToken(32);
  const csrfToken = randomToken(32);
  const expiresAt = new Date(Date.now() + sessionMaxAge * 1000);
  const session = await repo.createAdminSession({ admin_user_id: user.id, token_hash: tokenHash(sessionToken), csrf_token_hash: tokenHash(csrfToken), expires_at: expiresAt });
  return { sessionToken, csrfToken, session, expiresAt, cookies: [sessionCookie(sessionToken, env), csrfCookie(csrfToken, env)] };
}
export async function resolveAdminContextFromRequest(req, repo, env = process.env) {
  const cookieHeader = req?.headers?.get ? req.headers.get('cookie') : req?.headers?.cookie || req?.headers?.Cookie || '';
  const raw = readCookie(cookieHeader, sessionCookieName);
  if (!raw) return null;
  const resolved = await repo.resolveAdminSessionByTokenHash?.(tokenHash(raw));
  if (!resolved?.session || !resolved?.user) return null;
  const session = resolved.session; const user = resolved.user;
  if (session.revoked_at || new Date(session.expires_at).getTime() <= Date.now() || user.status !== 'active') return null;
  await repo.touchAdminSession?.(session.id);
  const permissions = normalizePermissions(await repo.loadAdminUserScopes?.(user.id) || []);
  return { user: { id: user.id, email: user.email, displayName: user.display_name }, session: { id: session.id, expiresAt: session.expires_at }, permissions, sessionToken: raw };
}
export async function requireAuthFromRequest(request, env = process.env, repo = null) {
  if (!repo) return null;
  return resolveAdminContextFromRequest(request, repo, env);
}
export async function csrfTokenFromRequest(req) {
  const header = req.headers?.['x-csrf-token'] || req.headers?.['X-CSRF-Token'];
  if (header) return String(header);
  const type = String(req.headers?.['content-type'] || '').toLowerCase();
  if (!isMultipart(req) && type.includes('application/x-www-form-urlencoded')) return String((await parsedBody(req))._csrf || '') || null;
  return null;
}
export async function validateCsrf(req, context, repo) {
  const presentedToken = await csrfTokenFromRequest(req);
  if (!presentedToken) return false;
  const expected = context?.session?.id ? await repo.getAdminSessionCsrfHash?.(context.session.id) : null;
  const got = tokenHash(presentedToken);
  return Boolean(expected && expected.length === got.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(got)));
}
export function sameOriginOk(req) {
  const host = req.headers?.host;
  const origin = req.headers?.origin;
  const referer = req.headers?.referer;
  if (origin) { try { return new URL(origin).host === host; } catch { return false; } }
  if (referer) { try { return new URL(referer).host === host; } catch { return false; } }
  return true;
}
