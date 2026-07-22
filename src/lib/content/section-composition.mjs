import { isRecognizedPageCta } from './page-cta-contract.mjs';
import { normalizeRelatedLinksItems } from './block-contracts.mjs';

const clean = (v) => String(v ?? '').trim();
const obj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const allowedLayouts = new Set(['stack', 'grid']);
const allowedThemes = new Set(['default', 'light', 'gradient-light']);
const allowedSurfaces = new Set(['default', 'polished']);
const allowedColumns = new Set([1, 2, 3, 4]);
const safeSectionOrder = (value) => { const n = Number(value); return Number.isFinite(n) && n > 0 && n < 1000 ? n : Number.MAX_SAFE_INTEGER; };

export function pageHeroVariant(page = {}) {
  return clean(page?.presentation?.heroVariant) === 'detail' ? 'detail' : 'listing';
}

export function blockPresentation(block = {}) {
  return obj(block.presentation) ? block.presentation : {};
}

export function normalizeSectionPresentation(presentation = {}) {
  const layout = allowedLayouts.has(clean(presentation.layout)) ? clean(presentation.layout) : 'grid';
  const requestedColumns = Number(presentation.gridColumns);
  const gridColumns = allowedColumns.has(requestedColumns) ? requestedColumns : (layout === 'grid' ? 2 : 1);
  const sectionTheme = allowedThemes.has(clean(presentation.sectionTheme)) ? clean(presentation.sectionTheme) : 'default';
  const surface = allowedSurfaces.has(clean(presentation.surface)) ? clean(presentation.surface) : 'default';
  return { layout, gridColumns, columnRatio: safeColumnRatio(presentation.columnRatio, gridColumns), sectionTheme, surface, sectionOrder: safeSectionOrder(presentation.sectionOrder ?? presentation.section_order) };
}

export function safeColumnRatio(value, columns = 2) {
  const raw = clean(value);
  if (!raw) return '';
  const parts = raw.split(':').map((part) => Number(part));
  if (parts.length !== columns || parts.some((n) => !Number.isFinite(n) || n <= 0 || n > 12)) return '';
  return parts.map((n) => `${Math.round(n * 1000) / 1000}fr`).join(' ');
}

function columnPosition(block) {
  const value = Number(blockPresentation(block).columnPosition);
  return Number.isFinite(value) && value > 0 ? value : Number.MAX_SAFE_INTEGER;
}

export function composePublicSections(blocks = []) {
  const sections = [];
  const groups = new Map();
  let ungroupedRun = null;
  const closeUngroupedRun = () => { ungroupedRun = null; };
  for (const [index, block] of (Array.isArray(blocks) ? blocks : []).entries()) {
    if (!block || isRecognizedPageCta(block)) continue;
    const presentation = blockPresentation(block);
    if (block.type === 'related-links') {
      closeUngroupedRun();
      sections.push({ kind: 'blocks', groupKey: '', firstIndex: index, blocks: [{ block, index }], presentation: normalizeSectionPresentation(presentation) });
      continue;
    }
    const key = clean(presentation.sectionGroupKey);
    if (!key) {
      if (!ungroupedRun) {
        ungroupedRun = { kind: 'blocks', groupKey: '', firstIndex: index, blocks: [], presentation: normalizeSectionPresentation(presentation) };
        sections.push(ungroupedRun);
      }
      ungroupedRun.blocks.push({ block, index });
      continue;
    }
    const normalizedPresentation = normalizeSectionPresentation(presentation);
    if (normalizedPresentation.sectionOrder === Number.MAX_SAFE_INTEGER) closeUngroupedRun();
    let section = groups.get(key);
    if (!section) {
      section = { kind: 'blocks', groupKey: key, firstIndex: index, blocks: [], presentation: normalizedPresentation };
      groups.set(key, section);
      sections.push(section);
    }
    section.blocks.push({ block, index });
  }
  return sections
    .sort((a, b) => a.presentation.sectionOrder - b.presentation.sectionOrder || a.firstIndex - b.firstIndex)
    .map((section) => ({ ...section, blocks: section.blocks.sort((a, b) => columnPosition(a.block) - columnPosition(b.block) || a.index - b.index).map((entry) => entry.block) }));
}

export function resolveRelatedLinksBlock(block, routeIndex) {
  const items = normalizeRelatedLinksItems(Array.isArray(block?.items) ? block.items : [], { pages: routeIndex?.pages || [], requirePublishedTargets: true });
  return items.map((item) => {
    const page = routeIndex?.byId?.get(String(item.target_page_id));
    if (!page || page.status !== 'published') throw new Error(`Nem feloldható related-links target: target_page_id=${item.target_page_id}`);
    return { title: item.title_override || page.title, href: page.route };
  });
}
