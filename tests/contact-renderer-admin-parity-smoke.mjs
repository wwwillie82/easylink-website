import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const renderer = readFileSync(new URL('../src/components/page-renderers/ContactRenderer.astro', import.meta.url), 'utf8');

assert.match(renderer, /const contactCta = ctaBlock\?\.items\?\.\[0\] \?\? null;/);
assert.match(renderer, /const contactIntro = safeContactIntro\(ctaBlock\?\.body\) \|\| String\(ctaBlock\?\.body \?\? ''\)\.trim\(\);/);
assert.match(renderer, /const primaryHref = normalizePublicHref\(contactCta\?\.url \|\| ''\);/);
assert.match(renderer, /const secondaryHref = normalizePublicHref\(contactCta\?\.secondaryUrl \|\| ''\);/);
assert.match(renderer, /\{ctaBlock && <article class="card polished contact">/);
assert.match(renderer, /\{ctaBlock\.title && <h2>\{ctaBlock\.title\}<\/h2>\}/);
assert.match(renderer, /\{contactIntro && <p class="contact-copy">\{contactIntro\}<\/p>\}/);
assert.match(renderer, /\{contactCta\.label\}<\/a>/);
assert.match(renderer, /\{contactCta\.secondaryLabel\}<\/a>/);
assert.match(renderer, /data-easylink-cta="email"/);
assert.match(renderer, /data-easylink-cta="demo"/);
assert.match(renderer, /\{featureBlock && <article class="card polished contact">/);
assert.match(renderer, /helpItems\.map\(\(item\) => <li>\{item\}<\/li>\)/);
assert.doesNotMatch(renderer, /getPublicSiteSettings/);
assert.doesNotMatch(renderer, /PUBLIC_DEPLOY_URL/);
assert.doesNotMatch(renderer, /contactSettings/);
assert.doesNotMatch(renderer, />Demót kérek<\/a>/);

console.log('Contact renderer admin parity smoke passed: contact main content and CTA come from the admin block while the feature block remains intact.');
