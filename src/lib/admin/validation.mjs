export function parseJsonItems(input) {
  if (input === undefined || input === null || input === '') return null;
  try { return JSON.parse(input); }
  catch { throw Object.assign(new Error('Az items mezőnek érvényes JSON-nak kell lennie.'), { code: 'INVALID_BLOCK_JSON' }); }
}

import { normalizeVideoItems } from '../content/video.mjs';

export function normalizeBlockItems(type, items) {
  if (items === null) return [];
  if (!Array.isArray(items)) throw Object.assign(new Error('Az items mezőnek JSON tömbnek kell lennie.'), { code: 'INVALID_BLOCK_ITEMS' });
  if (type === 'video') {
    try { return normalizeVideoItems(items); }
    catch (error) { throw Object.assign(new Error(error.message || 'Hibás videó blokk beállítás.'), { code: 'INVALID_VIDEO_BLOCK' }); }
  }
  return items;
}

export function validateLoginPayload(payload) {
  const email = String(payload?.email || '').trim().toLowerCase();
  const password = String(payload?.password || '');
  if (!email || !email.includes('@') || password.length < 8) return { ok: false, error: { code: 'INVALID_LOGIN', message: 'Érvényes email és legalább 8 karakteres jelszó szükséges.' } };
  return { ok: true, data: { email, password } };
}
