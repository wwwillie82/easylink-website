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
  const candidates = Object.entries(docs).map(([key, path]) => [key, safeCandidate(path, publicBase)]);
  const wanted = candidates.map(([, path]) => path).filter(Boolean);
  if (wanted.length === 0) return { termsPdfPath: '', privacyPdfPath: '', cookiePdfPath: '' };
  const [mediaRows] = await pool.query('SELECT path,type,status,processing_status FROM site_media_assets WHERE path IN (?)', [wanted]);
  const allowed = new Set(mediaRows.filter((m) => m.status !== 'archived' && m.processing_status === 'ready' && m.type === 'application/pdf').map((m) => String(m.path)));
  return Object.fromEntries(candidates.map(([key, path]) => [key, path && allowed.has(path) ? path : '']));
}
