import crypto from 'node:crypto';
import { verifyPassword } from '../db/client.mjs';

const cookieName = 'easylink_site_admin';
const maxAge = 60 * 60 * 8;

function secret(env = process.env) { return env.SITE_ADMIN_SESSION_SECRET || (env.NODE_ENV === 'production' ? '' : 'dev-only-site-admin-session-secret'); }
export function signSession(user, env = process.env) {
  const exp = Math.floor(Date.now() / 1000) + maxAge;
  const payload = Buffer.from(JSON.stringify({ id: user.id, email: user.email, role: user.role, exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret(env)).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
export function verifySessionToken(token, env = process.env) {
  try {
    if (!token || !secret(env)) return null;
    const [payload, sig] = String(token).split('.');
    if (!payload || !sig) return null;
    const expected = crypto.createHmac('sha256', secret(env)).update(payload).digest('base64url');
    const sigBuffer = Buffer.from(sig);
    const expectedBuffer = Buffer.from(expected);
    if (sigBuffer.length !== expectedBuffer.length) return null;
    if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return data.exp > Math.floor(Date.now() / 1000) ? data : null;
  } catch {
    return null;
  }
}
export function readCookie(header = '', name = cookieName) {
  try {
    for (const part of String(header || '').split(';')) {
      const index = part.indexOf('=');
      if (index === -1) continue;
      const key = decodeURIComponent(part.slice(0, index).trim());
      if (key === name) return decodeURIComponent(part.slice(index + 1).trim());
    }
  } catch {
    return undefined;
  }
  return undefined;
}
export function sessionCookie(token) { return `${cookieName}=${encodeURIComponent(token)}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax`; }
export function clearSessionCookie() { return `${cookieName}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`; }
export async function authenticate(repo, email, password) {
  const user = await repo.findAdminUserByEmail(email);
  if (!user || user.status !== 'active' || !verifyPassword(password, user.password_hash)) return null;
  await repo.markAdminLogin?.(user.id);
  return { id: user.id, email: user.email, role: user.role, displayName: user.display_name };
}
export function requireAuthFromRequest(request, env = process.env) { return verifySessionToken(readCookie(request.headers.get('cookie') || ''), env); }
