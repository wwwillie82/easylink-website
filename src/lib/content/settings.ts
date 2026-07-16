import { DEFAULT_SITE_SETTINGS, parseSiteSettingsRows, publicLegalDocuments } from '@/lib/admin/settings.mjs';

export type PublicLegalDocuments = { termsPdfPath: string; privacyPdfPath: string; cookiePdfPath: string };
export type PublicConsentSettings = { active: boolean; configurationVersion: number; privacyPdfPath: string; cookiePdfPath: string };
export type PublicAnalyticsSettings = { active: boolean; provider: 'ga4' | 'none'; measurementId: string; consentMode: 'basic'; configurationVersion: number };
export type PublicSiteSettings = { legalDocuments: PublicLegalDocuments; consent: PublicConsentSettings; analytics: PublicAnalyticsSettings };

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
  if (/[\u0000-\u001f\u007f"'<>]/.test(value)) return '';
  if (!value.startsWith(`${base}/`)) return '';
  const rel = value.slice(base.length + 1);
  const parts = rel.split('/').filter(Boolean);
  if (parts.length < 3 || parts.some((part) => part === '.' || part === '..' || part.includes('\\'))) return '';
  return value;
}

// Public activation contract fields: analytics.enabled, analytics.provider, analytics.ga4MeasurementId, analytics.consentMode, analytics.consentConfigurationVersion.
function publicAnalyticsSettings(settings: typeof DEFAULT_SITE_SETTINGS): PublicAnalyticsSettings {
  const a = settings.analytics;
  const validMeasurementId = /^G-[A-Z0-9]{4,}$/.test(a.ga4MeasurementId);
  const validVersion = Number.isInteger(a.consentConfigurationVersion) && a.consentConfigurationVersion > 0;
  const active = a.enabled === true && a.provider === 'ga4' // provider === 'ga4'
     && validMeasurementId && a.consentMode === 'basic' && validVersion;
  return {
    active,
    provider: active ? 'ga4' : 'none',
    measurementId: active ? a.ga4MeasurementId : '',
    consentMode: 'basic',
    configurationVersion: validVersion ? a.consentConfigurationVersion : 1,
  };
}

function publicFallback(): PublicSiteSettings {
  const legalDocuments = publicLegalDocuments(DEFAULT_SITE_SETTINGS);
  const analytics = publicAnalyticsSettings(DEFAULT_SITE_SETTINGS);
  return { legalDocuments, analytics, consent: { active: false, configurationVersion: 1, privacyPdfPath: '', cookiePdfPath: '' } };
}

export async function readPublicSiteSettingsFromPool(pool: DbPool): Promise<PublicSiteSettings> {
  const [rows] = await pool.query('SELECT `key`,`value` FROM site_settings WHERE `key` IN (?,?)', ['analytics','legalDocuments']);
  const settings = parseSiteSettingsRows(rows as Array<{ key: string; value: unknown }>);
  const docs = publicLegalDocuments(settings);
  const candidates = Object.entries(docs).map(([key, path]) => [key, safeCandidate(path)] as const);
  const wanted = candidates.map(([, path]) => path).filter(Boolean);
  let legalDocuments = { termsPdfPath: '', privacyPdfPath: '', cookiePdfPath: '' } as PublicLegalDocuments;
  if (wanted.length > 0) {
    const [mediaRows] = await pool.query('SELECT path,type,status,processing_status FROM site_media_assets WHERE path IN (?)', [wanted]);
    const allowed = new Set(mediaRows.filter((m) => m.status !== 'archived' && m.processing_status === 'ready' && m.type === 'application/pdf').map((m) => String(m.path)));
    legalDocuments = Object.fromEntries(candidates.map(([key, path]) => [key, path && allowed.has(path) ? path : ''])) as PublicLegalDocuments;
  }
  const analytics = publicAnalyticsSettings(settings);
  return {
    legalDocuments,
    analytics,
    consent: {
      active: analytics.active,
      configurationVersion: analytics.configurationVersion,
      privacyPdfPath: legalDocuments.privacyPdfPath,
      cookiePdfPath: legalDocuments.cookiePdfPath,
    },
  };
}

export async function readPublicLegalDocumentsFromPool(pool: DbPool): Promise<PublicLegalDocuments> {
  return (await readPublicSiteSettingsFromPool(pool)).legalDocuments;
}

let settingsPromise: Promise<PublicSiteSettings> | null = null;
export async function getPublicSiteSettings(): Promise<PublicSiteSettings> {
  settingsPromise ??= (async () => {
    if (!shouldTryDb()) return publicFallback();
    let pool: DbPool | null = null;
    try {
      const mod = await import('@/lib/db/client.mjs');
      const createdPool = (await mod.createPool()) as unknown as DbPool;
      pool = createdPool;
      return await readPublicSiteSettingsFromPool(createdPool);
    } catch {
      return publicFallback();
    } finally {
      await pool?.end?.().catch(() => {});
    }
  })();
  return settingsPromise;
}

// Compatibility export kept for existing callers; shared cache replaces the old direct readPublicLegalDocumentsFromPool(createdPool) path.
export async function getPublicLegalDocuments(): Promise<PublicLegalDocuments> {
  return (await getPublicSiteSettings()).legalDocuments;
}
