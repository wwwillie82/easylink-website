import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const footer = await readFile(new URL('../src/components/Footer.astro', import.meta.url), 'utf8');

assert.doesNotMatch(footer, /Statikus Astro marketing site staging környezethez\./);
assert.doesNotMatch(footer, /Belépés \/ demo/);
assert.doesNotMatch(footer, /footer-demo/);
assert.match(footer, /<img src="\/assets\/brand\/easylink-logo-horizontal\.png" alt="Easylink"/);
assert.match(footer, /class="footer-brand-column"[\s\S]*class="brand"[\s\S]*class="footer-legal-navigation"/);
assert.match(footer, /class="footer-legal-navigation"[\s\S]*legalLinks\.map[\s\S]*data-easylink-open-cookie-settings/);
assert.match(footer, /Általános Szerződési Feltételek/);
assert.match(footer, /Adatkezelési Tájékoztató/);
assert.match(footer, /Cookie Tájékoztató/);
assert.match(footer, /class="footer-contact-column"[\s\S]*<b>Kapcsolat<\/b>[\s\S]*emailHref[\s\S]*phoneHref[\s\S]*addressLines/);
assert.doesNotMatch(footer.match(/class="footer-contact-column"[\s\S]*?<\/div>/)?.[0] ?? '', /footer-legal-navigation|Cookie-beállítások|legalLinks|demo|PUBLIC_DEPLOY_URL/);
assert.match(footer, /const contact = publicSettings\.contact;/);
assert.match(footer, /contact\.email/);
assert.match(footer, /contact\.phone/);
assert.match(footer, /contact\.companyName/);
assert.match(footer, /contact\.postalCode/);
assert.match(footer, /contact\.city/);
assert.match(footer, /contact\.addressLine/);
assert.match(footer, /contact\.country/);
assert.match(footer, /const legalDocuments = publicSettings\.legalDocuments;/);
assert.match(footer, /legalDocuments\.termsPdfPath/);
assert.match(footer, /legalDocuments\.privacyPdfPath/);
assert.match(footer, /legalDocuments\.cookiePdfPath/);
assert.match(footer, /publicSettings\.consent\.active && <button[^>]*data-easylink-open-cookie-settings/);
assert.match(footer, /target="_blank"/);
assert.match(footer, /rel="noopener noreferrer"/);
assert.match(footer, /grid-template-columns: minmax\(0, 1fr\) minmax\(280px, 420px\)/);
assert.match(footer, /@media \(max-width: 700px\)[\s\S]*grid-template-columns: 1fr/);
assert.match(footer, /\.foot a:focus-visible, \.cookie-settings-button:focus-visible/);

console.log('footer smoke ok');
