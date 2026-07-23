import crypto from 'node:crypto';
import { hashPassword } from '../db/client.mjs';
import { createSmtpMailer } from './mailer.mjs';

export const RESET_EXPIRES_MINUTES = 60;
export const RESET_THROTTLE_MINUTES = 5;
export const RESET_PASSWORD_MIN_LENGTH = 8;
export const GENERIC_RESET_MESSAGE = 'Ha az e-mail-címhez aktív felhasználó tartozik, elküldtük a jelszóbeállító linket.';

export const normalizeResetEmail = (value) => String(value || '').trim().toLowerCase();
export const tokenHash = (raw) => crypto.createHash('sha256').update(String(raw || '')).digest('hex');
export const newRawToken = () => crypto.randomBytes(32).toString('base64url');

function resetError(status, code, message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.status = status;
  error.code = code;
  return error;
}

export function baseAdminUrl(env = process.env) {
  const raw = String(env.SITE_ADMIN_BASE_URL || '').trim();
  if (!raw) throw resetError(503, 'BASE_URL_NOT_CONFIGURED', 'A site admin publikus alap URL-je nincs konfigurálva.');
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw resetError(503, 'BASE_URL_INVALID', 'A site admin publikus alap URL-je hibás.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw resetError(503, 'BASE_URL_INVALID', 'A site admin publikus alap URL-je csak http vagy https lehet.');
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/+$/, '');
}

export async function issuePasswordReset(
  repo,
  user,
  { env = process.env, mailer = null, requestedIp = null, publicRequest = false } = {},
) {
  if (!user || user.status !== 'active') {
    throw resetError(404, 'USER_NOT_FOUND', 'Aktív felhasználó nem található.');
  }

  const baseUrl = baseAdminUrl(env);
  const sender = mailer || await createSmtpMailer(env);
  const rawToken = newRawToken();
  const hash = tokenHash(rawToken);
  const resetUrl = `${baseUrl}/admin/reset-password?token=${encodeURIComponent(rawToken)}`;
  let reserved = false;

  try {
    if (repo.reserveAdminPasswordResetToken) {
      await repo.reserveAdminPasswordResetToken(user.id, hash, { requestedIp });
    } else {
      await repo.createAdminPasswordResetToken(user.id, hash, { requestedIp });
    }
    reserved = true;

    await sender.sendPasswordReset({
      to: user.email,
      displayName: user.display_name,
      resetUrl,
      expiresMinutes: RESET_EXPIRES_MINUTES,
    });

    if (repo.activateAdminPasswordResetToken) {
      await repo.activateAdminPasswordResetToken(user.id, hash);
    }
    return { ok: true, publicRequest };
  } catch (error) {
    if (reserved && repo.cancelAdminPasswordResetToken) {
      try {
        await repo.cancelAdminPasswordResetToken(user.id, hash);
      } catch {
        // The original send/activation error remains authoritative.
      }
    }
    if (error?.code && error?.status) throw error;
    throw resetError(503, 'SEND_FAILED', 'A jelszóbeállító e-mail küldése sikertelen.', error);
  }
}

export async function requestPasswordReset(repo, email, options = {}) {
  const user = await repo.findAdminUserByEmail(normalizeResetEmail(email));
  if (!user || user.status !== 'active') return { ok: true, message: GENERIC_RESET_MESSAGE };
  try {
    await issuePasswordReset(repo, user, { ...options, publicRequest: true });
  } catch {
    // Public reset requests are deliberately enumeration-safe.
  }
  return { ok: true, message: GENERIC_RESET_MESSAGE };
}

export async function confirmPasswordReset(repo, payload = {}) {
  const token = String(payload.token || '').trim();
  const password = String(payload.password || '');
  const confirmation = String(payload.password_confirm ?? payload.confirmPassword ?? '');
  if (!token || password.length < RESET_PASSWORD_MIN_LENGTH || password !== confirmation) {
    throw resetError(400, 'INVALID_RESET_CONFIRM', 'A link vagy az új jelszó hibás.');
  }
  await repo.consumeAdminPasswordResetToken(tokenHash(token), hashPassword(password));
  return { ok: true, message: 'A jelszó sikeresen módosult. Most már beléphetsz az új jelszóval.' };
}
