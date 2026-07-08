export function parseJsonItems(input) {
  if (input === undefined || input === null || input === '') return null;
  try { return JSON.parse(input); }
  catch { throw Object.assign(new Error('Az items mezőnek érvényes JSON-nak kell lennie.'), { code: 'INVALID_BLOCK_JSON' }); }
}

export function validateLoginPayload(payload) {
  const email = String(payload?.email || '').trim().toLowerCase();
  const password = String(payload?.password || '');
  if (!email || !email.includes('@') || password.length < 8) return { ok: false, error: { code: 'INVALID_LOGIN', message: 'Érvényes email és legalább 8 karakteres jelszó szükséges.' } };
  return { ok: true, data: { email, password } };
}
