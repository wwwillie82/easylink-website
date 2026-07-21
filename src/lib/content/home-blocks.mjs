import { rawCardTargetType } from './card-targets.mjs';
import { HOME_LEGACY_CTA_KEY, isRecognizedPageCta, resolvePageCtaBlock } from './page-cta-contract.mjs';
import { assertRootHomePage } from './root-invariant.mjs';
import { normalizeBlockItemsByType } from './block-contracts.mjs';
import { isSupportedBlockType } from './block-registry.mjs';

export const HOME_HERO_META_KEY = 'home:hero-meta';
const firstString = (...values) => { for (const value of values) if (value !== undefined && value !== null) return String(value); return ''; };
const blockKeyOf = (block = {}) => block?.blockKey ?? block?.block_key ?? '';
const sortOrderOf = (block = {}) => { const n = Number(block?.sortOrder ?? block?.sort_order ?? 0); return Number.isFinite(n) ? n : 0; };
const idOf = (block = {}) => { const n = Number(block?.id ?? 0); return Number.isFinite(n) ? n : 0; };
const parseItems = (value) => typeof value === 'string' && value.trim() ? JSON.parse(value) : (Array.isArray(value) ? value : []);
const homeError = (code, message, details = {}) => { const error = new Error(message); error.code = code; error.status = 409; error.details = details; return error; };

export function canonicalHomePage(page = {}) {
  return { ...page, heroEyebrow: firstString(page.heroEyebrow, page.hero_eyebrow), heroTitle: firstString(page.heroTitle, page.hero_title), heroDescription: firstString(page.heroDescription, page.hero_description), heroAsset: firstString(page.heroAsset, page.hero_asset) };
}
export function homeBlockMeta(block = {}) { return { id: block.id, page_id: block.page_id ?? block.pageId, pageId: block.pageId ?? block.page_id, block_key: blockKeyOf(block), blockKey: blockKeyOf(block), type: block.type, status: block.status, sort_order: sortOrderOf(block), sortOrder: sortOrderOf(block) }; }
export function validateHeroMetaBlock(block = {}) { return { subtitle: String(block.title || ''), benefits: parseItems(block.items).map((item) => ({ title: String(item?.title || ''), text: String(item?.text ?? '') })), block }; }
export function validateHomeHero(page = {}, { mode = 'static' } = {}) {
  const heroPage = canonicalHomePage(page);
  if (mode !== 'db-authoritative') return { hero: heroPage };
  for (const [field, code, message] of [['heroEyebrow','HOME_HERO_EYEBROW_REQUIRED','A DB-authoritative home Hero heroEyebrow mezője kötelező.'], ['heroTitle','HOME_HERO_TITLE_REQUIRED','A DB-authoritative home Hero heroTitle mezője kötelező.'], ['heroDescription','HOME_HERO_DESCRIPTION_REQUIRED','A DB-authoritative home Hero heroDescription mezője kötelező.'], ['heroAsset','HOME_HERO_ASSET_REQUIRED','A DB-authoritative home Hero heroAsset mezője kötelező.']]) if (!String(heroPage?.[field] || '').trim()) throw homeError(code, message, { route: heroPage?.route, pageId: heroPage?.id, field });
  return { hero: heroPage };
}

export const genericHomeMiddleTypes = Object.freeze(['text','feature-list','list','cards','card-grid','cta','image-text','video','faq','ai-preview','network-visual','split-text','ai-assistant-preview','integrations-strip']);
export function isHomeHeroMetaBlock(block = {}) { return blockKeyOf(block) === HOME_HERO_META_KEY; }
export function isGenericHomeMiddleBlock(block = {}) { return !isHomeHeroMetaBlock(block) && !isRecognizedPageCta(block) && genericHomeMiddleTypes.includes(String(block?.type || '')); }
export function homeMiddleContentBlocks({ page, routeIndex } = {}) {
  return (page?.blocks || [])
    .filter((block) => block?.status === 'published' && isGenericHomeMiddleBlock(block))
    .sort((a,b)=>sortOrderOf(a)-sortOrderOf(b)||idOf(a)-idOf(b))
    .map((block) => ({ ...block, routeIndex }));
}

export function validatePublishedHomeBlocksForSnapshot(content = {}) {
  const pages = Array.isArray(content.pages) ? content.pages : [];
  const home = pages.find((page) => page?.route === '/' && page?.type === 'home');
  if (!home || home.status !== 'published') return [];
  const homeBlocks = (content.blocks || []).filter((block) => Number(block.page_id) === Number(home.id));
  const published = homeBlocks.filter((block) => block.status === 'published');
  const errors = [];
  try {
    assertRootHomePage(home, 'Home snapshot reference validation');
    validateHomeHero(home, { mode: 'db-authoritative' });
    const parsedAll = homeBlocks.map((block) => ({ ...block, blockKey: block.block_key, sortOrder: block.sort_order, items: parseItems(block.items) }));
    resolvePageCtaBlock(parsedAll);
    const publishedContent = published.map((block) => ({ ...block, items: parseItems(block.items) }));
    for (const block of publishedContent.filter((block) => !isHomeHeroMetaBlock(block) && !isRecognizedPageCta(block))) {
      if (!isSupportedBlockType(block.type)) throw homeError('HOME_PUBLISHED_UNKNOWN_BLOCK_TYPE', `Ismeretlen published home blokk típus: ${block.type}`, { id: block.id, blockKey: block.block_key || block.blockKey, block_key: block.block_key || block.blockKey, type: block.type });
    }
    for (const block of homeMiddleContentBlocks({ page: { ...home, blocks: publishedContent }, routeIndex: { pages } })) {
      normalizeBlockItemsByType(block.type, block.items || [], { block, status: 'published', pages, requirePublishedTargets: ['cards','card-grid'].includes(block.type), path: `blocks.${block.block_key || block.id}.items` });
    }
  } catch (error) { errors.push({ code: error.code || 'HOME_CONTENT_INVALID', message: error.message, details: error.details || {} }); }
  return errors;
}

export { rawCardTargetType, HOME_LEGACY_CTA_KEY };
