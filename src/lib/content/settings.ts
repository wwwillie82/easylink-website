import { DEFAULT_SITE_SETTINGS, parseSiteSettingsRows, publicLegalDocuments } from '@/lib/admin/settings.mjs';

export type PublicLegalDocuments = { termsPdfPath: string; privacyPdfPath: string; cookiePdfPath: string };

type DbPool = { query(sql: string, params?: unknown[]): Promise<[Array<Record<string, unknown>>, unknown]>; end?: () => Promise<void> };

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
const shouldTryDb = () => Boolean(env.DATABASE_URL || (env.DB_HOST && env.DB_NAME && env.DB_USER));
const publicBase = () => normalizePublicBase(env.SITE_MEDIA_PUBLIC_BASE_URL || '/assets/site-media');

function normalizePublicBase(value: string) {
  const raw = String(value || '/assets/site-media').trim();
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('://') || raw.includes('\0')) return '/assets/site-media';
  const parts = raw.split('/').filter(Boolean);
  if (parts.some((part) => part === '.' || part === '..')) return '/assets/site-media';
  return `/${parts.join('/')}`;
}

function safeCandidate(path: string, base = publicBase()) {
  const value = String(path || '').trim();
  if (!value || value.startsWith('//') || value.includes('://') || value.toLowerCase().startsWith('javascript:') || value.includes('\0')) return '';
  if (!value.startsWith(`${base}/`)) return '';
  const rel = value.slice(base.length + 1);
  const parts = rel.split('/').filter(Boolean);
  if (parts.length < 3 || parts.some((part) => part === '.' || part === '..' || part.includes('\\'))) return '';
  return value;
}

export async function readPublicLegalDocumentsFromPool(pool: DbPool): Promise<PublicLegalDocuments> {
  const [rows] = await pool.query('SELECT `key`,`value` FROM site_settings WHERE `key` IN (?,?)', ['analytics','legalDocuments']);
  const docs = publicLegalDocuments(parseSiteSettingsRows(rows as Array<{ key: string; value: unknown }>));
  const candidates = Object.entries(docs).map(([key, path]) => [key, safeCandidate(path)] as const);
  const wanted = candidates.map(([, path]) => path).filter(Boolean);
  if (wanted.length === 0) return { termsPdfPath: '', privacyPdfPath: '', cookiePdfPath: '' };
  const [mediaRows] = await pool.query('SELECT path,type,status,processing_status FROM site_media_assets WHERE path IN (?)', [wanted]);
  const allowed = new Set(mediaRows.filter((m) => m.status !== 'archived' && m.processing_status === 'ready' && m.type === 'application/pdf').map((m) => String(m.path)));
  return Object.fromEntries(candidates.map(([key, path]) => [key, path && allowed.has(path) ? path : ''])) as PublicLegalDocuments;
}

export async function getPublicLegalDocuments(): Promise<PublicLegalDocuments> {
  if (!shouldTryDb()) return publicLegalDocuments(DEFAULT_SITE_SETTINGS);
  let pool: DbPool | null = null;
  try {
    const mod = await import('@/lib/db/client.mjs');
    const createdPool = (await mod.createPool()) as unknown as DbPool;
    pool = createdPool;
    return await readPublicLegalDocumentsFromPool(createdPool);
  } catch {
    return publicLegalDocuments(DEFAULT_SITE_SETTINGS);
  } finally {
    await pool?.end?.().catch(() => {});
  }
}
