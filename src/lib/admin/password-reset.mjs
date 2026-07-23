import crypto from 'node:crypto';
import { hashPassword } from '../db/client.mjs';
import { createSmtpMailer } from './mailer.mjs';
export const RESET_EXPIRES_MINUTES = 60;
export const RESET_THROTTLE_MINUTES = 5;
export const GENERIC_RESET_MESSAGE = 'Ha az e-mail-címhez aktív felhasználó tartozik, elküldtük a jelszóbeállító linket.';
export const normalizeResetEmail = (v) => String(v || '').trim().toLowerCase();
export const tokenHash = (raw) => crypto.createHash('sha256').update(String(raw || '')).digest('hex');
export const newRawToken = () => crypto.randomBytes(32).toString('base64url');
export function baseAdminUrl(env = process.env) { return String(env.SITE_ADMIN_BASE_URL || 'http://localhost:4321').replace(/\/+$/, ''); }
export async function issuePasswordReset(repo, user, { env = process.env, mailer = null, requestedIp = null, publicRequest = false } = {}) {
  const rawToken = newRawToken();
  const hash = tokenHash(rawToken);
  await repo.createAdminPasswordResetToken(user.id, hash, { requestedIp });
  const resetUrl = `${baseAdminUrl(env)}/admin/reset-password?token=${encodeURIComponent(rawToken)}`;
  const sender = mailer || await createSmtpMailer(env);
  await sender.sendPasswordReset({ to: user.email, displayName: user.display_name, resetUrl, expiresMinutes: RESET_EXPIRES_MINUTES });
  return { ok: true, publicRequest };
}
export async function requestPasswordReset(repo, email, opts = {}) {
  const user = await repo.findAdminUserByEmail(normalizeResetEmail(email));
  if (!user || user.status !== 'active') return { ok: true, message: GENERIC_RESET_MESSAGE };
  try { await issuePasswordReset(repo, user, { ...opts, publicRequest: true }); } catch { /* keep enumeration-safe */ }
  return { ok: true, message: GENERIC_RESET_MESSAGE };
}
export async function confirmPasswordReset(repo, payload = {}) {
  const token = String(payload.token || '').trim();
  const password = String(payload.password || '');
  const confirm = String(payload.password_confirm ?? payload.confirmPassword ?? '');
  if (!token || password.length < 12 || password !== confirm) { const e = new Error('A link vagy az új jelszó hibás.'); e.code = 'INVALID_RESET_CONFIRM'; e.status = 400; throw e; }
  await repo.consumeAdminPasswordResetToken(tokenHash(token), hashPassword(password));
  return { ok: true, message: 'A jelszó sikeresen módosult. Most már beléphetsz az új jelszóval.' };
}
