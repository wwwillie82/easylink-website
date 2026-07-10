export const isExternalPublicHref = (href: string) => /^https?:\/\//i.test(href);
export const isDomainLikePublicHref = (href: string) => /^[^\s/?#]+\.[^\s]+/.test(href);

const cleanBasePath = (value = '') => value && !value.endsWith('/') ? `${value}/` : value;

export function normalizePublicHref(value: unknown, { basePath = '' } = {}) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (isExternalPublicHref(raw) || raw.startsWith('/') || raw.startsWith('#') || raw.startsWith('mailto:') || raw.startsWith('tel:')) return raw;
  if (isDomainLikePublicHref(raw)) return `https://${raw}`;
  const base = cleanBasePath(basePath);
  return base ? `${base}${raw.replace(/^\//, '').replace(/\/$/, '')}/` : raw;
}

export const publicHrefTarget = (href: string) => isExternalPublicHref(href) ? '_blank' : undefined;
export const publicHrefRel = (href: string) => isExternalPublicHref(href) ? 'noreferrer noopener' : undefined;
