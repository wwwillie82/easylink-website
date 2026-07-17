import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import { normalizeSiteSettings, parseSiteSettingsRows, publicBrand, publicSocial, safePublicUrl, DEFAULT_DEPLOY_URL } from '../src/lib/admin/settings.mjs';



const tmp = await mkdtemp(join(tmpdir(), 'easylink-settings-a1-'));
const settingsSource = (await readFile('src/lib/content/settings.ts', 'utf8'))
  .replace("from '@/lib/admin/settings.mjs'", `from 'file://${process.cwd()}/src/lib/admin/settings.mjs'`)
  .replace("from '@/lib/content/video.mjs'", `from 'file://${process.cwd()}/src/lib/content/video.mjs'`);
const settingsModulePath = join(tmp, 'settings.mjs');
await writeFile(settingsModulePath, ts.transpileModule(settingsSource, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText);
const { readPublicSiteSettingsFromPool } = await import(`file://${settingsModulePath}`);

const legacy = parseSiteSettingsRows([{ key: 'legalDocuments', value: JSON.stringify({ privacyPdfPath: '/assets/site-media/2026/07/privacy.pdf' }) }]);
assert.equal(legacy.brand.headerLogoPath, '');
assert.equal(publicBrand(legacy).headerLogoPath, '/assets/brand/easylink-logo-horizontal.png');
assert.equal(legacy.legalDocuments.privacyPdfPath, '/assets/site-media/2026/07/privacy.pdf');
assert.equal(legacy.legalDocuments.items.find((d) => d.type === 'privacy').label, 'Adatkezelési Tájékoztató');
assert.equal(legacy.searchVisibility, 'blocked');

const sameLogo = normalizeSiteSettings({ brand: { headerLogoPath: '/assets/site-media/2026/07/logo.png', footerLogoPath: '/assets/site-media/2026/07/logo.png' } });
assert.equal(sameLogo.brand.headerLogoPath, sameLogo.brand.footerLogoPath);

const social = normalizeSiteSettings({ social: { platforms: [
  { id: 'youtube', active: true, url: 'https://youtube.com/@easylink', order: 2 },
  { id: 'facebook', active: true, url: 'https://facebook.com/easylink', order: 1 },
  { id: 'instagram', active: false, url: 'https://instagram.com/easylink', order: 3 },
  { id: 'tiktok', active: false, url: '', order: 4 },
  { id: 'linkedin', active: true, url: 'https://www.linkedin.com/company/easylink', order: 5 },
] } });
assert.deepEqual(social.social.platforms.map((p) => p.id), ['facebook','instagram','tiktok','youtube','linkedin']);
assert.deepEqual(publicSocial(social).map((p) => p.id), ['facebook','youtube','linkedin']);
assert.throws(() => normalizeSiteSettings({ social: { platforms: [{ id: 'facebook', active: true, url: 'javascript:alert(1)' }] } }), /social URL/);
assert.equal(publicSocial(normalizeSiteSettings({})).length, 0);
assert.equal(safePublicUrl('/kapcsolat/'), '/kapcsolat/');
assert.equal(safePublicUrl('https://example.com/demo')?.startsWith('https://example.com/demo'), true);
assert.equal(safePublicUrl('data:text/html,evil'), null);

const cta = normalizeSiteSettings({});
assert.equal(cta.defaultCta.eyebrow, 'Következő lépés');
assert.equal(cta.defaultCta.title, 'Készen állsz könnyedebben vezetni a céged?');
assert.equal(cta.defaultCta.description, 'Kérj demót vagy próbáld ki ingyen a konfigurált Deploy felületen.');
assert.equal(cta.defaultCta.primaryLabel, 'Demót kérek');
assert.equal(cta.defaultCta.secondaryLabel, 'Próbáld ki ingyen');
assert.equal(cta.defaultCta.primaryUrl, DEFAULT_DEPLOY_URL);
assert.equal(cta.defaultCta.secondaryUrl, DEFAULT_DEPLOY_URL);
assert.equal(normalizeSiteSettings({ searchVisibility: 'indexable' }).searchVisibility, 'indexable');

const settingsPanelHtml = (await import('../src/lib/admin/render/settings.mjs')).settingsPanel(normalizeSiteSettings({}));
const settingsPanel = settingsPanelHtml;
assert.match(settingsPanel, /data-media-picker-target/);
assert.match(settingsPanel, /brand-header-logo-path/);
assert.match(settingsPanel, /brand-footer-logo-path/);
assert.match(settingsPanel, /legal-terms-pdf-path/);
assert.match(settingsPanel, /legal-privacy-pdf-path/);
assert.match(settingsPanel, /legal-cookie-pdf-path/);
assert.doesNotMatch(settingsPanel, /data-media-picker-target=\"input\[name=/);
assert.match(settingsPanel, /Kis címke/);
assert.match(settingsPanel, /Elsődleges gomb célja/);
assert.match(settingsPanel, /LinkedIn/);

function pool(settingsRows, mediaRows) {
  return { async query(sql) { return sql.includes('site_media_assets') ? [mediaRows, null] : [settingsRows, null]; } };
}
const logoPath = '/assets/site-media/2026/07/logo.png';
let publicSettings = await readPublicSiteSettingsFromPool(pool([
  { key: 'brand', value: JSON.stringify({ headerLogoPath: logoPath, headerLogoAlt: 'Custom', footerLogoPath: '/assets/site-media/2026/07/bad.gif', footerLogoAlt: 'Bad' }) },
  { key: 'legalDocuments', value: JSON.stringify({ items: [{ type: 'privacy', label: 'Privacy off', pdfPath: '/assets/site-media/2026/07/privacy.pdf', active: false, order: 1 }, { type: 'cookie', label: 'Cookie', pdfPath: '/assets/site-media/2026/07/cookie.pdf', active: true, order: 2 }] }) },
], [
  { path: logoPath, type: 'image/png', status: 'active', processing_status: 'ready' },
  { path: '/assets/site-media/2026/07/bad.gif', type: 'image/gif', status: 'active', processing_status: 'ready' },
  { path: '/assets/site-media/2026/07/cookie.pdf', type: 'application/pdf', status: 'active', processing_status: 'ready' },
]));
assert.equal(publicSettings.brand.headerLogoPath, logoPath);
assert.equal(publicSettings.brand.headerLogoAlt, 'Custom');
assert.equal(publicSettings.brand.footerLogoPath, '/assets/brand/easylink-logo-horizontal.png');
assert.equal(publicSettings.brand.footerLogoAlt, 'Easylink');
assert.equal(publicSettings.legalDocuments.privacyPdfPath, '');
assert.equal(publicSettings.consent.privacyPdfPath, '');
assert.equal(publicSettings.legalDocuments.cookiePdfPath, '/assets/site-media/2026/07/cookie.pdf');
assert.equal(publicSettings.consent.cookiePdfPath, '/assets/site-media/2026/07/cookie.pdf');

for (const media of [
  { path: logoPath, type: 'image/png', status: 'archived', processing_status: 'ready' },
  { path: logoPath, type: 'image/png', status: 'active', processing_status: 'processing' },
  { path: logoPath, type: 'application/pdf', status: 'active', processing_status: 'ready' },
]) {
  publicSettings = await readPublicSiteSettingsFromPool(pool([{ key: 'brand', value: JSON.stringify({ headerLogoPath: logoPath, headerLogoAlt: 'Bad' }) }], [media]));
  assert.equal(publicSettings.brand.headerLogoPath, '/assets/brand/easylink-logo-horizontal.png');
  assert.equal(publicSettings.brand.headerLogoAlt, 'Easylink');
}

const snapshotRows = [{ key: 'legalDocuments', value: JSON.stringify({ termsPdfPath: '/assets/site-media/2026/07/terms.pdf' }) }];
assert.equal(parseSiteSettingsRows(snapshotRows).legalDocuments.termsPdfPath, '/assets/site-media/2026/07/terms.pdf');

console.log('settings A1 smoke ok');
