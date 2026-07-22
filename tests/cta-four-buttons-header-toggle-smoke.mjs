import assert from 'node:assert/strict';
import { normalizeSiteSettings } from '../src/lib/admin/settings.mjs';
import { normalizeCtaItems } from '../src/lib/content/block-contracts.mjs';
import { resolvePageCta, resolvePageHeaderCta } from '../src/lib/content/page-cta-contract.mjs';
import { ctaAdminEnhancementJs } from '../src/lib/admin/render/cta-admin.mjs';

const buttons = [
  { label: 'Első', url: '/egy/', showInHeader: true },
  { label: 'Második', url: '/ketto/', showInHeader: true },
  { label: 'Harmadik', url: '/harom/', showInHeader: false },
  { label: 'Negyedik', url: '/negy/', showInHeader: true },
];
const settings = normalizeSiteSettings({ defaultCta: { eyebrow: 'CTA', title: 'Négy gomb', description: 'Teszt', buttons } });
assert.equal(settings.defaultCta.buttons.length, 4);
assert.equal(settings.defaultCta.primaryLabel, 'Első');
assert.equal(settings.defaultCta.secondaryLabel, 'Második');
assert.throws(() => normalizeSiteSettings({ defaultCta: { title: 'Túl sok', buttons: [...buttons, { label: 'Ötödik', url: '/ot/' }] } }), /Legfeljebb 4/);
assert.throws(() => normalizeSiteSettings({ defaultCta: { title: 'Hiányos', buttons: [{ label: 'Csak felirat', url: '' }] } }), /együtt kötelező/);

const item = normalizeCtaItems([{ ctaMode: 'custom', headerHidden: true, buttons, presentationRole: 'cta-section' }])[0];
assert.equal(item.buttons.length, 4);
assert.equal(item.headerHidden, true);
assert.equal(item.label, 'Első');
assert.equal(item.secondaryLabel, 'Második');

const globalBlock = { type: 'cta', title: 'CTA', body: 'Leírás', items: [{ ctaMode: 'global', headerHidden: false, presentationRole: 'cta-section' }] };
assert.equal(resolvePageCta(globalBlock, settings.defaultCta).content.buttons.length, 4);
assert.deepEqual(resolvePageHeaderCta(globalBlock, settings.defaultCta).buttons.map((button) => button.label), ['Első','Második','Negyedik']);

const lowerHidden = { ...globalBlock, items: [{ ...globalBlock.items[0], ctaMode: 'hidden' }] };
assert.equal(resolvePageCta(lowerHidden, settings.defaultCta).shouldRender, false);
assert.equal(resolvePageHeaderCta(lowerHidden, settings.defaultCta).shouldRender, true);
const allHidden = { ...lowerHidden, items: [{ ...lowerHidden.items[0], headerHidden: true }] };
assert.equal(resolvePageHeaderCta(allHidden, settings.defaultCta).shouldRender, false);

const adminJs = ctaAdminEnhancementJs();
assert.match(adminJs, /Header CTA kikapcsolása ezen az oldalon/);
assert.match(adminJs, /legfeljebb 4/);
assert.match(adminJs, /cta-mode-selector/);
console.log('CTA four-button/header-toggle smoke passed');
