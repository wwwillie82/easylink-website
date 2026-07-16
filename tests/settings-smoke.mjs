import assert from 'node:assert/strict';
import { createAdminRepository } from '../src/lib/admin/repository.mjs';
import { normalizeSiteSettings, parseSiteSettingsRows } from '../src/lib/admin/settings.mjs';

assert.equal(normalizeSiteSettings({ analytics: { consentMode: 'basic', consentConfigurationVersion: 1 } }).analytics.provider, 'none');
assert.throws(() => normalizeSiteSettings({ analytics: { provider: 'ga4', ga4MeasurementId: 'UA-1' } }), /GA4/);
assert.throws(() => normalizeSiteSettings({ analytics: { consentMode: 'advanced' } }), /basic/);
const s=normalizeSiteSettings({ unknown: true, analytics: { enabled: true, provider: 'ga4', ga4MeasurementId: 'G-ABC1234', consentMode:'basic', consentConfigurationVersion: 2 }, legalDocuments: { termsPdfPath:'/assets/site-media/2026/07/a.pdf', evil:'x' }});
assert.equal(s.legalDocuments.termsPdfPath, '/assets/site-media/2026/07/a.pdf');
assert.equal(s.legalDocuments.evil, undefined);
assert.equal(parseSiteSettingsRows([{key:'legalDocuments', value: JSON.stringify({privacyPdfPath:'/assets/site-media/2026/07/p.pdf'})}]).legalDocuments.privacyPdfPath, '/assets/site-media/2026/07/p.pdf');

function poolFor(mediaRows = [], settingsRows = []) {
  const writes = [];
  const conn = { async beginTransaction(){ writes.push(['begin']); }, async execute(sql, params){ writes.push(params); }, async commit(){ writes.push(['commit']); }, async rollback(){ writes.push(['rollback']); }, release(){ writes.push(['release']); } };
  return { writes, async execute(sql, params){ writes.push(params); }, async query(sql, params) { if (sql.includes('site_media_assets') && sql.includes('id=?')) return [[mediaRows.find((m) => String(m.id) === String(params[0]))].filter(Boolean), null]; if (sql.includes('site_media_assets')) return [[mediaRows.find((m) => m.path === params[0])].filter(Boolean), null]; if (sql.includes('site_settings')) return [settingsRows, null]; return [[], null]; }, async getConnection(){ return conn; } };
}
const validPdf = { id: 1, path: '/assets/site-media/2026/07/terms.pdf', type: 'application/pdf', status: 'active', processing_status: 'ready' };
let pool = poolFor([validPdf]);
let repo = createAdminRepository(pool);
await repo.updateSiteSettings({ legalDocuments: { termsPdfPath: validPdf.path } }, { SITE_MEDIA_PUBLIC_BASE_URL: '/assets/site-media' });
assert.deepEqual(pool.writes.at(-2), ['commit']);
for (const bad of [
  { ...validPdf, status: 'archived' },
  { ...validPdf, processing_status: 'queued' },
  { ...validPdf, processing_status: 'processing' },
  { ...validPdf, processing_status: 'failed' },
  { ...validPdf, type: 'image/png' },
  { ...validPdf, type: 'video/mp4' },
]) {
  pool = poolFor([bad]);
  repo = createAdminRepository(pool);
  await assert.rejects(() => repo.updateSiteSettings({ legalDocuments: { termsPdfPath: validPdf.path } }, { SITE_MEDIA_PUBLIC_BASE_URL: '/assets/site-media' }), /PDF/);
}
pool = poolFor([validPdf]);
repo = createAdminRepository(pool);
await assert.rejects(() => repo.updateSiteSettings({ legalDocuments: { termsPdfPath: '/other/terms.pdf' } }, { SITE_MEDIA_PUBLIC_BASE_URL: '/assets/site-media' }), /feltöltött PDF/);
await repo.updateSiteSettings({ legalDocuments: { termsPdfPath: '', privacyPdfPath: '', cookiePdfPath: '' } }, { SITE_MEDIA_PUBLIC_BASE_URL: '/assets/site-media' });
const legalValue = (field, path = validPdf.path) => [{ key: 'legalDocuments', value: JSON.stringify({ [field]: path }) }];
for (const field of ['termsPdfPath','privacyPdfPath','cookiePdfPath']) {
  pool = poolFor([validPdf], legalValue(field));
  repo = createAdminRepository(pool);
  await assert.rejects(() => repo.archiveMedia(1), /jogi dokumentumként/);
  await assert.rejects(() => repo.updateMedia(1, { status: 'archived' }), /jogi dokumentumként/);
  await repo.updateMedia(1, { alt: 'Új alt' });
  await repo.updateMedia(1, { status: 'active' });
}
pool = poolFor([{ ...validPdf, id: 1 }], legalValue('termsPdfPath', '/assets/site-media/2026/07/other.pdf'));
repo = createAdminRepository(pool);
await repo.archiveMedia(1);
assert.equal(pool.writes.some((entry) => Array.isArray(entry) && entry[0] === 'archived'), true);
for (const media of [{ ...validPdf, id: 2, type: 'image/png' }, { ...validPdf, id: 3, type: 'video/mp4' }]) {
  pool = poolFor([media], legalValue('termsPdfPath'));
  repo = createAdminRepository(pool);
  await repo.updateMedia(media.id, { status: 'archived' });
  await repo.archiveMedia(media.id);
}
console.log('settings smoke ok');
