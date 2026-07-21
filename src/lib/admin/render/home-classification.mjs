import { esc } from './utils.mjs';

const rowSummary = (row) => `ID: ${esc(row.id ?? '')} | block_key: ${esc(row.block_key || '')} | type: ${esc(row.type || '')} | title: ${esc(row.title || '')} | sort_order: ${esc(row.sort_order ?? '')}`;

export function homeClassificationNotice(classification) {
  if (!classification) return '';
  if (classification.state === 'partial' || classification.state === 'unknown' || !classification.hero) {
    const rows = (classification.unknown?.length ? classification.unknown : classification.rows || []).filter((row) => row.status === 'published' && row.role !== 'hero-meta');
    const details = rows.length ? `<ul>${rows.map((row) => `<li>${rowSummary(row)} | role: ${esc(row.role || '')}</li>`).join('')}</ul>` : '';
    return `<div class="msg err" data-home-classification-warning><strong>A főoldali canonical blokkállapot javítandó (${esc(classification.state)}).</strong>${!classification.hero ? '<p>Hiányzik a hero-meta rekord.</p>' : ''}${details}</div>`;
  }
  if (classification.validManual?.length) return '<p class="msg info" data-home-valid-manual-info>A főoldal további egyedi tartalmi blokkokat tartalmaz.</p>';
  return '';
}
