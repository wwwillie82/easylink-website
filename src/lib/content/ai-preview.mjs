const allowedKinds = new Set(['risk', 'metric', 'opportunity', 'recommendation', 'success', 'info']);
const unsafeProtocol = /^(?:javascript|data|vbscript):/i;
const externalHttp = /^https?:\/\//i;
const domainLike = /^[^\s/?#]+\.[^\s]+/;

export const aiPreviewKinds = [...allowedKinds];

export function normalizeAiPreviewHref(value) {
  const raw = String(value ?? '').trim();
  if (!raw || unsafeProtocol.test(raw) || /[\u0000-\u001f\u007f]/.test(raw)) return '';
  if (externalHttp.test(raw) || raw.startsWith('/') || raw.startsWith('#') || raw.startsWith('mailto:') || raw.startsWith('tel:')) return raw;
  if (domainLike.test(raw)) return `https://${raw}`;
  return raw;
}

export function normalizeAiPreviewItem(item) {
  const source = item && typeof item === 'object' && !Array.isArray(item) ? item : { title: item };
  const title = String(source.title ?? source.text ?? source.label ?? '').trim();
  if (!title) return null;
  const kind = allowedKinds.has(source.kind) ? source.kind : 'info';
  const normalized = { kind, title };
  for (const key of ['detail', 'value']) {
    const value = String(source[key] ?? '').trim();
    if (value) normalized[key] = value;
  }
  const href = normalizeAiPreviewHref(source.href ?? source.url);
  if (href) normalized.href = href;
  return normalized;
}

export function normalizeAiPreviewItems(items) {
  return (Array.isArray(items) ? items : []).map(normalizeAiPreviewItem).filter(Boolean);
}
