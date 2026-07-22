import { defaultCtaButtons, hasTooManyCtaButtons, incompleteCtaButton, withLegacyDefaultFields } from '../content/cta-buttons.mjs';

export const LEGACY_LOGO_PATH = '/assets/brand/easylink-logo-horizontal.png';
export const DEFAULT_DEPLOY_URL = process.env.PUBLIC_DEPLOY_URL || 'https://deploy.easylink.hu';
export const SOCIAL_PLATFORMS = ['facebook','instagram','tiktok','youtube','linkedin'];
export const LEGAL_DOCUMENT_TYPES = ['terms','privacy','cookie'];
export const DEFAULT_LEGAL_DOCUMENT_ITEMS = [
  { type: 'terms', label: 'Általános Szerződési Feltételek', pdfPath: '', active: true, order: 1 },
  { type: 'privacy', label: 'Adatkezelési Tájékoztató', pdfPath: '', active: true, order: 2 },
  { type: 'cookie', label: 'Cookie Tájékoztató', pdfPath: '', active: true, order: 3 },
];

const defaultButtons = [
  { label: 'Demót kérek', url: DEFAULT_DEPLOY_URL, showInHeader: true, analyticsIntent: 'demo', analyticsId: 'site-header-demo' },
  { label: 'Próbáld ki ingyen', url: DEFAULT_DEPLOY_URL, showInHeader: false, analyticsIntent: 'trial' },
];

export const DEFAULT_SITE_SETTINGS = {
  analytics: { enabled: false, provider: 'none', ga4MeasurementId: '', consentMode: 'basic', consentConfigurationVersion: 1 },
  legalDocuments: { termsPdfPath: '', privacyPdfPath: '', cookiePdfPath: '', items: DEFAULT_LEGAL_DOCUMENT_ITEMS },
  contact: { companyName: '', email: 'hello@easylink.hu', phone: '', postalCode: '', city: '', addressLine: '', country: 'Magyarország' },
  brand: { headerLogoPath: '', headerLogoAlt: 'Easylink', footerLogoPath: '', footerLogoAlt: 'Easylink' },
  social: { platforms: SOCIAL_PLATFORMS.map((id, i) => ({ id, active: false, url: '', order: i + 1 })) },
  defaultCta: withLegacyDefaultFields({
    eyebrow: 'Következő lépés',
    title: 'Készen állsz könnyedebben vezetni a céged?',
    description: 'Kérj demót vagy próbáld ki ingyen a konfigurált Deploy felületen.',
  }, defaultButtons),
  searchVisibility: 'blocked',
};

export function validationError(message) {
  const error = new Error(message);
  error.code = 'VALIDATION_ERROR';
  error.status = 400;
  return error;
}

const limits = { companyName: 120, email: 254, phone: 40, postalCode: 20, city: 80, addressLine: 160, country: 80, label: 120, alt: 120, cta: 220 };
const contactKeys = Object.keys(DEFAULT_SITE_SETTINGS.contact);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

function cleanText(value, key = 'label') {
  const text = String(value ?? '').trim();
  if (text.length > (limits[key] || 220)) throw validationError('Túl hosszú mező.');
  if (/[<>]/.test(text) || /javascript:/i.test(text) || /data:/i.test(text)) throw validationError('Hibás mezőérték.');
  return text;
}

function cleanContact(input = {}) {
  const source = input.contact || {};
  const out = {};
  for (const key of contactKeys) out[key] = cleanText(source[key] ?? DEFAULT_SITE_SETTINGS.contact[key], key);
  if (out.email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(out.email)) throw validationError('Hibás email cím.');
  if (out.phone && !/^[+()0-9 .\-/]{3,40}$/.test(out.phone)) throw validationError('Hibás telefonszám.');
  return out;
}

const cleanPath = (value) => String(value || '').trim();

export function safePublicUrl(value, { allowEmpty = true } = {}) {
  const text = String(value || '').trim();
  if (!text) return allowEmpty ? '' : null;
  if (text.startsWith('//') || /[\u0000-\u001f\u007f"'<>]/.test(text)) return null;
  if (text.startsWith('/')) return text.startsWith('/assets/') || text.includes('..') ? null : text;
  try {
    const url = new URL(text);
    return ['http:', 'https:'].includes(url.protocol) ? text : null;
  } catch {
    return null;
  }
}

function safeExternalUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.startsWith('//') || /[\u0000-\u001f\u007f"'<>]/.test(text)) return null;
  try {
    const url = new URL(text);
    return ['http:', 'https:'].includes(url.protocol) ? text : null;
  } catch {
    return null;
  }
}

function cleanBrand(input = {}) {
  const source = input.brand || {};
  return {
    headerLogoPath: cleanPath(source.headerLogoPath),
    headerLogoAlt: cleanText(source.headerLogoAlt || 'Easylink', 'alt') || 'Easylink',
    footerLogoPath: cleanPath(source.footerLogoPath),
    footerLogoAlt: cleanText(source.footerLogoAlt || 'Easylink', 'alt') || 'Easylink',
  };
}

function cleanSocial(input = {}) {
  const byId = new Map(((input.social?.platforms) || []).map((platform) => [String(platform.id), platform]));
  return {
    platforms: SOCIAL_PLATFORMS.map((id, index) => {
      const platform = byId.get(id) || {};
      const active = !!platform.active;
      const url = safeExternalUrl(platform.url);
      if (active && !url) throw validationError(`Hibás ${id} social URL. Csak http/https profil URL adható meg.`);
      const order = Number(platform.order ?? index + 1);
      return { id, active, url: url || '', order: Number.isFinite(order) ? Math.trunc(order) : index + 1 };
    }),
  };
}

const docDefaults = () => structuredClone(DEFAULT_LEGAL_DOCUMENT_ITEMS);

function cleanLegal(input = {}) {
  const source = input.legalDocuments || {};
  const legacy = { terms: cleanPath(source.termsPdfPath), privacy: cleanPath(source.privacyPdfPath), cookie: cleanPath(source.cookiePdfPath) };
  const byType = new Map((Array.isArray(source.items) ? source.items : []).map((document) => [String(document.type), document]));
  const items = docDefaults().map((defaults) => {
    const document = byType.get(defaults.type) || {};
    const pdfPath = cleanPath(document.pdfPath || legacy[defaults.type] || '');
    const label = cleanText(document.label ?? defaults.label, 'label') || defaults.label;
    const order = Number(document.order ?? defaults.order);
    return { type: defaults.type, label, pdfPath, active: document.active === undefined ? defaults.active : !!document.active, order: Number.isFinite(order) ? Math.trunc(order) : defaults.order };
  });
  const by = Object.fromEntries(items.map((document) => [document.type, document]));
  return {
    termsPdfPath: by.terms.active ? by.terms.pdfPath : '',
    privacyPdfPath: by.privacy.active ? by.privacy.pdfPath : '',
    cookiePdfPath: by.cookie.active ? by.cookie.pdfPath : '',
    items,
  };
}

function cleanDefaultCta(input = {}) {
  const source = input.defaultCta || {};
  const defaults = DEFAULT_SITE_SETTINGS.defaultCta;
  const merged = { ...defaults, ...source };
  const hasLegacyButtonFields = ['primaryLabel','primaryUrl','secondaryLabel','secondaryUrl'].some((key) => hasOwn(source, key));
  const buttonSource = hasOwn(source, 'buttons') ? source : (hasLegacyButtonFields ? { ...merged, buttons: undefined } : defaults);
  if (hasTooManyCtaButtons(buttonSource)) throw validationError('Legfeljebb 4 CTA gomb adható meg.');
  const buttons = defaultCtaButtons(buttonSource);
  if (!buttons.length) throw validationError('Legalább egy CTA gomb szükséges.');
  const cleanedButtons = buttons.map((button) => {
    if (incompleteCtaButton(button)) throw validationError('A CTA gomb felirata és célja együtt kötelező.');
    const url = safePublicUrl(button.url);
    if (url === null) throw validationError('Hibás CTA URL. Csak biztonságos belső vagy http/https link adható meg.');
    return { ...button, label: cleanText(button.label, 'cta'), url: url || '', showInHeader: !!button.showInHeader };
  });
  return withLegacyDefaultFields({
    eyebrow: cleanText(merged.eyebrow, 'cta'),
    title: cleanText(merged.title, 'cta'),
    description: cleanText(merged.description, 'cta'),
  }, cleanedButtons);
}

export function normalizeSiteSettings(input = {}) {
  const analyticsSource = input.analytics || {};
  const enabled = !!analyticsSource.enabled;
  const provider = String(analyticsSource.provider || 'none');
  if (!['none','ga4'].includes(provider)) throw validationError('Hibás analytics szolgáltató.');
  const ga4 = String(analyticsSource.ga4MeasurementId || '').trim();
  if (ga4 && !/^G-[A-Z0-9]{4,}$/.test(ga4)) throw validationError('Hibás GA4 Measurement ID.');
  if (provider === 'ga4' && enabled && !ga4) throw validationError('GA4 Measurement ID szükséges.');
  const consentMode = String(analyticsSource.consentMode || 'basic');
  if (consentMode !== 'basic') throw validationError('Csak basic consent mode engedélyezett.');
  const consentConfigurationVersion = Number(analyticsSource.consentConfigurationVersion ?? 1);
  if (!Number.isInteger(consentConfigurationVersion) || consentConfigurationVersion < 1) throw validationError('A consent verzió pozitív egész legyen.');
  const searchVisibility = String(input.searchVisibility || 'blocked');
  if (!['blocked','indexable'].includes(searchVisibility)) throw validationError('Hibás keresőmotoros láthatóság.');
  return {
    analytics: { enabled, provider, ga4MeasurementId: ga4, consentMode, consentConfigurationVersion },
    legalDocuments: cleanLegal(input),
    contact: cleanContact(input),
    brand: cleanBrand(input),
    social: cleanSocial(input),
    defaultCta: cleanDefaultCta(input),
    searchVisibility,
  };
}

export function parseSiteSettingsRows(rows = []) {
  const out = structuredClone(DEFAULT_SITE_SETTINGS);
  for (const row of rows) {
    let value = row.value;
    try { value = typeof value === 'string' ? JSON.parse(value) : value; } catch {}
    if (value && typeof value === 'object' && row.key in out) {
      if (row.key === 'defaultCta' && !hasOwn(value, 'buttons')) delete out.defaultCta.buttons;
      out[row.key] = { ...out[row.key], ...value };
    }
    if (row.key === 'searchVisibility') out.searchVisibility = typeof value === 'string' ? value : (value?.value || out.searchVisibility);
  }
  try { return normalizeSiteSettings(out); }
  catch { return structuredClone(DEFAULT_SITE_SETTINGS); }
}

export function publicLegalDocuments(settings) {
  const documents = normalizeSiteSettings(settings).legalDocuments;
  const items = documents.items.filter((document) => document.active && document.pdfPath).sort((a, b) => a.order - b.order || LEGAL_DOCUMENT_TYPES.indexOf(a.type) - LEGAL_DOCUMENT_TYPES.indexOf(b.type));
  const by = Object.fromEntries(items.map((document) => [document.type, document.pdfPath]));
  return { termsPdfPath: by.terms || '', privacyPdfPath: by.privacy || '', cookiePdfPath: by.cookie || '', items };
}

export function publicContact(settings) { return normalizeSiteSettings(settings).contact; }

export function publicBrand(settings) {
  const brand = normalizeSiteSettings(settings).brand;
  return {
    headerLogoPath: brand.headerLogoPath || LEGACY_LOGO_PATH,
    headerLogoAlt: brand.headerLogoPath ? brand.headerLogoAlt : 'Easylink',
    footerLogoPath: brand.footerLogoPath || LEGACY_LOGO_PATH,
    footerLogoAlt: brand.footerLogoPath ? brand.footerLogoAlt : 'Easylink',
  };
}

export function publicSocial(settings) {
  return normalizeSiteSettings(settings).social.platforms.filter((platform) => platform.active && safeExternalUrl(platform.url)).sort((a, b) => a.order - b.order || SOCIAL_PLATFORMS.indexOf(a.id) - SOCIAL_PLATFORMS.indexOf(b.id));
}
