import { parseSiteSettingsRows, publicLegalDocuments } from '../admin/settings.mjs';

function safeCandidate(path, base = '/assets/site-media') {
  const value = String(path || '').trim();
  if (!value || value.startsWith('//') || value.includes('://') || value.toLowerCase().startsWith('javascript:') || value.includes('\0')) return '';
  if (!value.startsWith(`${base}/`)) return '';
  const rel = value.slice(base.length + 1);
  const parts = rel.split('/').filter(Boolean);
  if (parts.length < 3 || parts.some((part) => part === '.' || part === '..' || part.includes('\\'))) return '';
  return value;
}

export async function readPublicLegalDocumentsFromPoolForTest(pool, { publicBase = '/assets/site-media' } = {}) {
  const [rows] = await pool.query('SELECT `key`,`value` FROM site_settings WHERE `key` IN (?,?)', ['analytics','legalDocuments']);
  const docs = publicLegalDocuments(parseSiteSettingsRows(rows));
  const candidates = (docs.items || []).map((doc) => ({ ...doc, pdfPath: safeCandidate(doc.pdfPath, publicBase) })).filter((doc) => doc.pdfPath);
  const wanted = candidates.map((doc) => doc.pdfPath);
  if (wanted.length === 0) return { termsPdfPath: '', privacyPdfPath: '', cookiePdfPath: '', items: [] };
  const [mediaRows] = await pool.query('SELECT path,type,status,processing_status FROM site_media_assets WHERE path IN (?)', [wanted]);
  const allowed = new Set(mediaRows.filter((m) => m.status !== 'archived' && m.processing_status === 'ready' && m.type === 'application/pdf').map((m) => String(m.path)));
  const out = { termsPdfPath: '', privacyPdfPath: '', cookiePdfPath: '', items: candidates.filter((doc) => allowed.has(doc.pdfPath)) };
  for (const doc of out.items) {
    if (doc.type === 'terms') out.termsPdfPath = doc.pdfPath;
    if (doc.type === 'privacy') out.privacyPdfPath = doc.pdfPath;
    if (doc.type === 'cookie') out.cookiePdfPath = doc.pdfPath;
  }
  return out;
}

export async function getPublicLegalDocumentsFromPoolFactoryForTest(createPool, { shouldTryDb = true } = {}) {
  const fallback = () => publicLegalDocuments({ legalDocuments: { termsPdfPath: '', privacyPdfPath: '', cookiePdfPath: '' } });
  if (!shouldTryDb) return fallback();
  let pool = null;
  try {
    const createdPool = await createPool();
    pool = createdPool;
    return await readPublicLegalDocumentsFromPoolForTest(createdPool);
  } catch {
    return fallback();
  } finally {
    await pool?.end?.().catch(() => {});
  }
}
