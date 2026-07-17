import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeSiteSettings, publicBrand, LEGACY_LOGO_PATH } from '../src/lib/admin/settings.mjs';
import { settingsPanel, settingsAdminJs } from '../src/lib/admin/render/settings.mjs';

const settings = normalizeSiteSettings({});
const html = settingsPanel(settings);

const sections = [...html.matchAll(/<section class="admin-section[^>]*data-settings-section="([^"]+)"/g)].map((m) => m[1]);
assert.deepEqual(sections, ['contact','brand','social','legal','cta','analytics','search']);
assert.equal((html.match(/data-social-platform=/g) || []).length, 5);
for (const id of ['facebook','instagram','tiktok','youtube','linkedin']) {
  assert.match(html, new RegExp(`<article class="admin-subcard social-card" data-social-platform="${id}"[\\s\\S]*?<label class="admin-toggle-row">[\\s\\S]*?name="social\\.${id}\\.active"[\\s\\S]*?Megjelenik a footerben[\\s\\S]*?</label>`));
}
for (const type of ['terms','privacy','cookie']) {
  const card = html.match(new RegExp(`<article class="admin-subcard legal-card"[^>]*data-legal-document="${type}"[\\s\\S]*?</article>`))?.[0] || '';
  assert.ok(card);
  assert.equal((card.match(new RegExp(`name="legalDocuments\\.${type}\\.active"`, 'g')) || []).length, 1);
  assert.match(card, /Megjelenik a footerben/);
}
assert.match(html, /Ez egy előkészített sablon\./);
assert.equal((html.match(/A jelenlegi Easylink alaplogó fog megjelenni/g) || []).length, 2);
assert.match(html, /<div class="admin-save-bar">[\s\S]*<button type="submit">Beállítások mentése és élesítés<\/button>/);
assert.match(settingsAdminJs(), /setupDirtyForm\(form,\(\)=>JSON\.stringify\(payload\(\)\)\)/);

const layout = await readFile('src/lib/admin/render/layout.mjs', 'utf8');
assert.match(layout, /\.admin-section/);
assert.match(layout, /\.admin-grid[^}]*grid-template-columns:repeat\(auto-fit,minmax\(240px,1fr\)\)/);
assert.match(layout, /@media\(max-width:680px\)\{\.admin-grid,\.grid,\.admin-grid--compact,\.admin-grid--social\{grid-template-columns:1fr\}/);

const publicCssFiles = ['src/styles/global.css'];
for (const file of publicCssFiles) {
  const css = await readFile(file, 'utf8');
  assert.doesNotMatch(css, /admin-section|admin-grid|admin-save-bar/);
}

const normalized = normalizeSiteSettings({ brand: { headerLogoPath: '/assets/site-media/2026/07/logo.webp', footerLogoPath: '/assets/site-media/2026/07/logo-footer.webp', headerLogoAlt: 'Header alt', footerLogoAlt: 'Footer alt' } });
assert.equal(normalized.brand.headerLogoPath, '/assets/site-media/2026/07/logo.webp');
assert.equal(publicBrand(normalized).footerLogoPath, '/assets/site-media/2026/07/logo-footer.webp');
assert.equal(publicBrand(normalizeSiteSettings({})).headerLogoPath, LEGACY_LOGO_PATH);

console.log('Admin visual contract smoke passed.');
