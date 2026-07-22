import { DEFAULT_SITE_SETTINGS, LEGACY_LOGO_PATH, parseSiteSettingsRows, publicLegalDocuments, publicContact, publicBrand, publicSocial } from '@/lib/admin/settings.mjs';
import { imageMimeTypes } from '@/lib/content/video.mjs';

export type PublicLegalDocuments = { termsPdfPath: string; privacyPdfPath: string; cookiePdfPath: string; items?: Array<{ type: string; label: string; pdfPath: string; active: boolean; order: number }> };
export type PublicConsentSettings = { active: boolean; configurationVersion: number; privacyPdfPath: string; cookiePdfPath: string };
export type PublicAnalyticsSettings = { active: boolean; provider: 'ga4' | 'none'; measurementId: string; consentMode: 'basic'; configurationVersion: number };
export type PublicContactSettings = { companyName: string; email: string; phone: string; postalCode: string; city: string; addressLine: string; country: string };
export type PublicCtaButton = { label: string; url: string; showInHeader: boolean; analyticsIntent?: string; analyticsId?: string; analyticsSlot?: string };
export type PublicDefaultCtaSettings = { eyebrow: string; title: string; description: string; primaryLabel: string; primaryUrl: string; secondaryLabel: string; secondaryUrl: string; buttons: PublicCtaButton[] };
export type PublicSiteSettings = { legalDocuments: PublicLegalDocuments; consent: PublicConsentSettings; analytics: PublicAnalyticsSettings; contact: PublicContactSettings; brand: { headerLogoPath: string; headerLogoAlt: string; footerLogoPath: string; footerLogoAlt: string }; social: Array<{ id: string; active: boolean; url: string; order: number }>; defaultCta: PublicDefaultCtaSettings; searchVisibility: 'blocked' | 'indexable' };

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

function publicDefaultCta(value: unknown): PublicDefaultCtaSettings {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const rawButtons = Array.isArray(source.buttons) ? source.buttons : [];
  const buttons = rawButtons.map((button): PublicCtaButton => {
    const item = button && typeof button === 'object' && !Array.isArray(button) ? button as Record<string, unknown> : {};
    const normalized: PublicCtaButton = {
      label: String(item.label ?? '').trim(),
      url: String(item.url ?? '').trim(),
      showInHeader: item.showInHeader === true,
    };
    for (const key of ['analyticsIntent','analyticsId','analyticsSlot'] as const) {
      const text = String(item[key] ?? '').trim();
      if (text) normalized[key] = text;
    }
    return normalized;
  });
  return {
    eyebrow: String(source.eyebrow ?? '').trim(),
    title: String(source.title ?? '').trim(),
    description: String(source.description ?? '').trim(),
    primaryLabel: String(source.primaryLabel ?? buttons[0]?.label ?? '').trim(),
    primaryUrl: String(source.primaryUrl ?? buttons[0]?.url ?? '').trim(),
    secondaryLabel: String(source.secondaryLabel ?? buttons[1]?.label ?? '').trim(),
    secondaryUrl: String(source.secondaryUrl ?? buttons[1]?.url ?? '').trim(),
    buttons,
  };
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

export function publicFallback(): PublicSiteSettings {
  const legalDocuments = publicLegalDocuments(DEFAULT_SITE_SETTINGS);
  const analytics = publicAnalyticsSettings(DEFAULT_SITE_SETTINGS);
  return { legalDocuments, analytics, contact: publicContact(DEFAULT_SITE_SETTINGS) as PublicContactSettings, brand: publicBrand(DEFAULT_SITE_SETTINGS), social: publicSocial(DEFAULT_SITE_SETTINGS), defaultCta: publicDefaultCta(DEFAULT_SITE_SETTINGS.defaultCta), searchVisibility: 'blocked', consent: { active: false, configurationVersion: 1, privacyPdfPath: '', cookiePdfPath: '' } };
}

export async function readPublicSiteSettingsFromPool(pool: DbPool): Promise<PublicSiteSettings> {
  const [rows] = await pool.query('SELECT `key`,`value` FROM site_settings WHERE `key` IN (?,?,?,?,?,?,?)', ['analytics','legalDocuments','contact','brand','social','defaultCta','searchVisibility']);
  const settings = parseSiteSettingsRows(rows as Array<{ key: string; value: unknown }>);
  const docs = publicLegalDocuments(settings);
  const docCandidates = (docs.items || []).map((doc) => ({ ...doc, pdfPath: safeCandidate(doc.pdfPath) })).filter((doc) => doc.pdfPath);
  const wanted = docCandidates.map((doc) => doc.pdfPath);
  let legalDocuments = { termsPdfPath: '', privacyPdfPath: '', cookiePdfPath: '', items: [] } as PublicLegalDocuments;
  if (wanted.length > 0) {
    const [mediaRows] = await pool.query('SELECT path,type,status,processing_status FROM site_media_assets WHERE path IN (?)', [wanted]);
    const allowed = new Set(mediaRows.filter((m) => m.status !== 'archived' && m.processing_status === 'ready' && m.type === 'application/pdf').map((m) => String(m.path)));
    legalDocuments.items = docCandidates.filter((doc) => allowed.has(doc.pdfPath));
    for (const doc of legalDocuments.items) {
      if (doc.type === 'terms') legalDocuments.termsPdfPath = doc.pdfPath;
      if (doc.type === 'privacy') legalDocuments.privacyPdfPath = doc.pdfPath;
      if (doc.type === 'cookie') legalDocuments.cookiePdfPath = doc.pdfPath;
    }
  }
  const analytics = publicAnalyticsSettings(settings as typeof DEFAULT_SITE_SETTINGS);
  const contact = publicContact(settings as typeof DEFAULT_SITE_SETTINGS) as PublicContactSettings;
  const rawBrand = publicBrand(settings as typeof DEFAULT_SITE_SETTINGS);
  let brand = { ...rawBrand };
  const brandCandidates = [rawBrand.headerLogoPath, rawBrand.footerLogoPath].filter((path) => path && path !== LEGACY_LOGO_PATH);
  if (brandCandidates.length > 0) {
    const [brandRows] = await pool.query('SELECT path,type,status,processing_status FROM site_media_assets WHERE path IN (?)', [brandCandidates]);
    const allowedImages = new Set(brandRows.filter((m) => m.status !== 'archived' && m.processing_status === 'ready' && imageMimeTypes.has(String(m.type))).map((m) => String(m.path)));
    if (!allowedImages.has(rawBrand.headerLogoPath)) brand = { ...brand, headerLogoPath: LEGACY_LOGO_PATH, headerLogoAlt: 'Easylink' };
    if (!allowedImages.has(rawBrand.footerLogoPath)) brand = { ...brand, footerLogoPath: LEGACY_LOGO_PATH, footerLogoAlt: 'Easylink' };
  }
  return {
    legalDocuments,
    analytics,
    contact,
    brand,
    social: publicSocial(settings as typeof DEFAULT_SITE_SETTINGS),
    defaultCta: publicDefaultCta(settings.defaultCta),
    searchVisibility: settings.searchVisibility as 'blocked' | 'indexable',
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
