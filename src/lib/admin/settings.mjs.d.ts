export const DEFAULT_SITE_SETTINGS: { analytics: { enabled: boolean; provider: string; ga4MeasurementId: string; consentMode: string; consentConfigurationVersion: number }; legalDocuments: { termsPdfPath: string; privacyPdfPath: string; cookiePdfPath: string } };
export function normalizeSiteSettings(input?: unknown): typeof DEFAULT_SITE_SETTINGS;
export function parseSiteSettingsRows(rows?: Array<{ key: string; value: unknown }>): typeof DEFAULT_SITE_SETTINGS;
export function publicLegalDocuments(settings: typeof DEFAULT_SITE_SETTINGS): { termsPdfPath: string; privacyPdfPath: string; cookiePdfPath: string };
