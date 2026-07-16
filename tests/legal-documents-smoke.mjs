import assert from 'node:assert/strict';
import { validateMediaFile, safeMediaFilename, mediaConfig } from '../src/lib/admin/media-storage.mjs';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { readPublicLegalDocumentsFromPoolForTest, getPublicLegalDocumentsFromPoolFactoryForTest } from '../src/lib/content/settings.test-helper.mjs';
import { mediaMatchesKind, mediaPanel, mediaPickerJs } from '../src/lib/admin/render/media.mjs';
const pdf=Buffer.from('%PDF-1.7\n');
assert.equal(validateMediaFile({filename:'aszf.pdf', contentType:'application/pdf', buffer:pdf, size:pdf.length}).type, 'application/pdf');
assert.throws(()=>validateMediaFile({filename:'aszf.txt', contentType:'application/pdf', buffer:pdf, size:pdf.length}), /PDF|WebP/);
assert.throws(()=>validateMediaFile({filename:'aszf.pdf', contentType:'text/plain', buffer:pdf, size:pdf.length}), /MIME/);
assert.throws(()=>validateMediaFile({filename:'aszf.pdf', contentType:'application/pdf', buffer:Buffer.from('nope'), size:4}), /PDF/);
assert.throws(()=>validateMediaFile({filename:'aszf.pdf', contentType:'application/pdf', buffer:Buffer.alloc(0), size:0}), /Üres/);
assert.throws(()=>validateMediaFile({filename:'aszf.pdf', contentType:'application/pdf', buffer:pdf, size:11, documentMaxBytes:10}), /túl nagy/);
assert.throws(()=>safeMediaFilename('../x.pdf'), /fájlnév/);
assert.notEqual(safeMediaFilename('aszf.pdf', Buffer.from('1234')), safeMediaFilename('aszf.pdf', Buffer.from('5678')));
assert.equal(mediaConfig({SITE_MEDIA_DOCUMENT_MAX_BYTES:'123'}).documentMaxBytes, 123);
assert.equal(validateMediaFile({ filename:'large.pdf', contentType:'application/pdf', buffer:pdf, size:6*1024*1024, maxBytes:5*1024*1024, documentMaxBytes:10*1024*1024 }).mediaKind, 'document');
const readyPdf = { path: '/assets/site-media/2026/07/a.pdf', type: 'application/pdf', status: 'active', processing_status: 'ready' };
const readyImage = { path: '/assets/site-media/2026/07/a.png', type: 'image/png', status: 'active', processing_status: 'ready' };
const readyVideo = { path: '/assets/site-media/2026/07/a.mp4', type: 'video/mp4', status: 'active', processing_status: 'ready' };
assert.equal(mediaMatchesKind(readyPdf, 'document'), true);
assert.equal(mediaMatchesKind(readyPdf, 'any'), false);
assert.equal(mediaMatchesKind(readyImage, 'any'), true);
assert.equal(mediaMatchesKind(readyVideo, 'any'), true);
const panel = mediaPanel({ maxBytes: 5*1024*1024, videoMaxBytes: 20*1024*1024, documentMaxBytes: 10*1024*1024 });
assert.match(panel, /PDF max: 10 MB/);
assert.match(panel, /function isPdfFile/);
assert.match(panel, /PDF dokumentum/);
const script = panel.match(/<script>([\s\S]*)<\/script>/)[1];
const videoFn = script.match(/function isVideoFile\(file\)\{[^}]+\}/)[0];
const pdfFn = script.match(/function isPdfFile\(file\)\{[^}]+\}/)[0];
const runtime = vm.runInNewContext(`${videoFn};${pdfFn};({ isVideoFile, isPdfFile })`);
assert.equal(runtime.isPdfFile({ name: 'test.pdf', type: '' }), true);
assert.equal(runtime.isPdfFile({ name: 'TEST.PDF', type: '' }), true);
assert.equal(runtime.isVideoFile({ name: 'test.mp4', type: '' }), true);
assert.equal(runtime.isPdfFile({ name: 'filexpdf', type: '' }), false);
assert.equal(runtime.isVideoFile({ name: 'filexmp4', type: '' }), false);
assert.equal(runtime.isPdfFile({ name: 'kep.png', type: 'image/png' }), false);
const picker = mediaPickerJs();
assert.match(picker, /kind === 'document'|kind==='document'/);
assert.match(picker, /PDF dokumentum/);
assert.match(picker, /<img src=.*alt=/);
const publicRows = [{ key: 'legalDocuments', value: JSON.stringify({ termsPdfPath: '/assets/site-media/2026/07/terms.pdf', privacyPdfPath: '/assets/site-media/2026/07/privacy.pdf', cookiePdfPath: '' }) }];
let docs = await readPublicLegalDocumentsFromPoolForTest({ async query(sql){ if (sql.includes('site_media_assets')) return [[{ path: '/assets/site-media/2026/07/terms.pdf', type: 'application/pdf', status: 'active', processing_status: 'ready' }, { path: '/assets/site-media/2026/07/privacy.pdf', type: 'application/pdf', status: 'active', processing_status: 'ready' }], null]; return [publicRows, null]; } });
assert.equal(docs.termsPdfPath, '/assets/site-media/2026/07/terms.pdf');
assert.equal(docs.privacyPdfPath, '/assets/site-media/2026/07/privacy.pdf');
assert.equal(docs.cookiePdfPath, '');
const invalidMediaCases = [
  { path: '/assets/site-media/2026/07/terms.pdf', type: 'application/pdf', status: 'archived', processing_status: 'ready' },
  { path: '/assets/site-media/2026/07/terms.pdf', type: 'application/pdf', status: 'active', processing_status: 'processing' },
  { path: '/assets/site-media/2026/07/terms.pdf', type: 'image/png', status: 'active', processing_status: 'ready' },
];
for (const media of invalidMediaCases) {
  docs = await readPublicLegalDocumentsFromPoolForTest({ async query(sql){ if (sql.includes('site_media_assets')) return [[media], null]; return [[{ key: 'legalDocuments', value: JSON.stringify({ termsPdfPath: media.path }) }], null]; } });
  assert.equal(docs.termsPdfPath, '');
}
docs = await readPublicLegalDocumentsFromPoolForTest({ async query(sql){ if (sql.includes('site_media_assets')) return [[], null]; return [[{ key: 'legalDocuments', value: JSON.stringify({ termsPdfPath: '/assets/site-media/2026/07/missing.pdf' }) }], null]; } });
assert.equal(docs.termsPdfPath, '');
for (const badPath of ['https://example.com/a.pdf', 'javascript:alert(1)', '/other/2026/07/a.pdf']) {
  docs = await readPublicLegalDocumentsFromPoolForTest({ async query(sql){ if (sql.includes('site_media_assets')) return [[{ path: badPath, type: 'application/pdf', status: 'active', processing_status: 'ready' }], null]; return [[{ key: 'legalDocuments', value: JSON.stringify({ termsPdfPath: badPath }) }], null]; } });
  assert.equal(docs.termsPdfPath, '');
}
docs = await readPublicLegalDocumentsFromPoolForTest({ async query(){ return [[{ key: 'legalDocuments', value: '{bad' }], null]; } });
assert.equal(docs.termsPdfPath, '');

let endCalls = 0;
let queryCalls = [];
docs = await getPublicLegalDocumentsFromPoolFactoryForTest(async () => ({
  async query(sql) {
    queryCalls.push(sql);
    if (sql.includes('site_media_assets')) return [[{ path: '/assets/site-media/2026/07/terms.pdf', type: 'application/pdf', status: 'active', processing_status: 'ready' }], null];
    return [[{ key: 'legalDocuments', value: JSON.stringify({ termsPdfPath: '/assets/site-media/2026/07/terms.pdf' }) }], null];
  },
  async end() { endCalls += 1; },
}));
assert.equal(docs.termsPdfPath, '/assets/site-media/2026/07/terms.pdf');
assert.equal(queryCalls.some((sql) => sql.includes('site_settings')), true);
assert.equal(queryCalls.some((sql) => sql.includes('site_media_assets')), true);
assert.equal(endCalls, 1);
endCalls = 0;
docs = await getPublicLegalDocumentsFromPoolFactoryForTest(async () => ({
  async query() { throw new Error('query failed'); },
  async end() { endCalls += 1; },
}));
assert.deepEqual(docs, { termsPdfPath: '', privacyPdfPath: '', cookiePdfPath: '' });
assert.equal(endCalls, 1);
docs = await getPublicLegalDocumentsFromPoolFactoryForTest(async () => { throw new Error('no db'); });
assert.deepEqual(docs, { termsPdfPath: '', privacyPdfPath: '', cookiePdfPath: '' });
const publicSettingsSource = await readFile(new URL('../src/lib/content/settings.ts', import.meta.url), 'utf8');
assert.match(publicSettingsSource, /const createdPool = \(await mod\.createPool\(\)\) as unknown as DbPool;/);
assert.match(publicSettingsSource, /readPublicLegalDocumentsFromPool\(createdPool\)/);
assert.match(publicSettingsSource, /finally \{[\s\S]*pool\?\.end\?\.\(\)/);
const footer = await readFile(new URL('../src/components/Footer.astro', import.meta.url), 'utf8');
assert.match(footer, /Általános Szerződési Feltételek/);
assert.match(footer, /Adatkezelési Tájékoztató/);
assert.match(footer, /Cookie Tájékoztató/);
assert.match(footer, /target="_blank"/);
assert.match(footer, /rel="noopener noreferrer"/);
console.log('legal documents smoke ok');
