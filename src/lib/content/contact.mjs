const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const LEGACY_CONTACT_MARKER_PATTERN = /(?:mailto:|tel:|(?:^|\s)e-?mail\s*:)/i;

export function safeContactIntro(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (LEGACY_CONTACT_MARKER_PATTERN.test(text) || EMAIL_PATTERN.test(text)) return '';
  return text;
}
