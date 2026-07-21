import { buildPageIndexById, resolveCardTarget, rawCardTargetType } from './card-targets.mjs';
import { HOME_LEGACY_CTA_KEY, isRecognizedPageCta, resolvePageCtaBlock } from './page-cta-contract.mjs';
import { assertRootHomePage } from './root-invariant.mjs';
import { normalizeBlockItemsByType } from './block-contracts.mjs';
import { isSupportedBlockType } from './block-registry.mjs';

export const HOME_HERO_META_KEY = 'home:hero-meta';
export const HOME_INTRO_KEY = 'home:intro';
export const HOME_SOLUTIONS_KEY = 'home:solutions';
export const HOME_AI_KEY = 'home:ai-assistant';
export const HOME_INTEGRATIONS_KEY = 'home:integrations';
export const HOME_AUDIENCES_KEY = 'home:audiences';

export const canonicalHomeBlocks = Object.freeze({
  [HOME_HERO_META_KEY]: { key: HOME_HERO_META_KEY, type: 'hero-meta', zone: 'hero' },
  [HOME_INTRO_KEY]: { key: HOME_INTRO_KEY, type: 'text', zone: 'middle' },
  [HOME_SOLUTIONS_KEY]: { key: HOME_SOLUTIONS_KEY, type: 'cards', zone: 'middle', allowedPageTypes: ['solution_detail'], actionPageTypes: ['solutions_index'] },
  [HOME_AI_KEY]: { key: HOME_AI_KEY, type: 'ai-preview', zone: 'middle' },
  [HOME_INTEGRATIONS_KEY]: { key: HOME_INTEGRATIONS_KEY, type: 'network-visual', zone: 'middle' },
  [HOME_AUDIENCES_KEY]: { key: HOME_AUDIENCES_KEY, type: 'cards', zone: 'middle', allowedPageTypes: ['audience_detail'] },
});
export const middleHomeBlockKeys = Object.freeze([HOME_INTRO_KEY, HOME_SOLUTIONS_KEY, HOME_AI_KEY, HOME_INTEGRATIONS_KEY, HOME_AUDIENCES_KEY]);
export const allCanonicalHomeBlockKeys = Object.freeze([HOME_HERO_META_KEY, ...middleHomeBlockKeys]);

export const homeIntroText = 'Az Easylink a pénzügy, adminisztráció, ügyfélkezelés és vezetői kontroll közös nyelvét készíti elő. A cél: gyorsabb döntés, kevesebb kézi egyeztetés és később AI-val is kérdezhető üzleti adatok.';

export const staticHomeBlocksFixture = Object.freeze([
  { blockKey: HOME_HERO_META_KEY, block_key: HOME_HERO_META_KEY, type: 'hero-meta', title: 'Cégvezetés, könnyedén.', body: '', items: [
    { title: 'Átlátható működés', text: 'Valós idejű adatok, tiszta kép.' },
    { title: 'Időmegtakarítás', text: 'Automatizált folyamatok, kevesebb manuális munka.' },
    { title: 'Biztonság & megbízhatóság', text: 'Magyarországi háttér, stabil rendszer.' },
  ], sortOrder: 0, sort_order: 0, status: 'published' },
  { blockKey: HOME_INTRO_KEY, block_key: HOME_INTRO_KEY, type: 'text', title: 'Public site előkészítés', body: homeIntroText, items: [{ heading: 'Nem még egy táblázat, hanem egy átlátható vezetői felület.' }], sortOrder: 10, sort_order: 10, status: 'published' },
  { blockKey: HOME_SOLUTIONS_KEY, block_key: HOME_SOLUTIONS_KEY, type: 'cards', title: 'Megoldásaink', body: 'Egy rendszer a napi működés kulcspontjaira.', items: [
    { kind: 'card', target_type: 'legacy', title: 'Pénzügy és számlázás', href: '/megoldasaink/penzugy-szamlazas/', text: 'Számlák, fizetési státuszok és pénzügyi teendők egy átlátható vezetői nézetben.', linkLabel: 'Részletek →', badge: 1 },
    { kind: 'card', target_type: 'legacy', title: 'HR és Munkaügy', href: '/megoldasaink/hr-munkaugy/', text: 'Csapatadatok, munkaügyi dokumentumok és adminisztratív teendők rendezettebb kezelése.', linkLabel: 'Részletek →', badge: 2 },
    { kind: 'card', target_type: 'legacy', title: 'CRM és ügyfélkezelés', href: '/megoldasaink/crm-ugyfelkezeles/', text: 'Ügyfelek, előzmények, dokumentumok és következő lépések tiszta üzleti nézetben.', linkLabel: 'Részletek →', badge: 3 },
    { kind: 'section-action', target_type: 'legacy', title: 'Összes megoldás', href: '/megoldasaink/' },
  ], sortOrder: 20, sort_order: 20, status: 'published' },
  { blockKey: HOME_AI_KEY, block_key: HOME_AI_KEY, type: 'ai-preview', title: 'AI asszisztens', body: 'Az AI blokk a háttérben látható adatáramlásra épít: pénzügy, CRM és adminisztráció adatai vezetői szintű válaszokká rendeződhetnek.', items: [
    { kind: 'heading', text: 'Kérdezz, és a rendszered válaszol.' },
    { kind: 'source', title: 'NAV' }, { kind: 'source', title: 'CRM' }, { kind: 'source', title: 'Banki státusz' }, { kind: 'source', title: 'Admin' },
    { kind: 'message', role: 'user', text: 'Mely ügyek igényelnek vezetői figyelmet ezen a héten?' },
    { kind: 'message', role: 'assistant', title: 'Javaslat', text: '3 pénzügyi és 2 adminisztratív pontnál érdemes utánkövetést előkészíteni.' },
  ], sortOrder: 30, sort_order: 30, status: 'published' },
  { blockKey: HOME_INTEGRATIONS_KEY, block_key: HOME_INTEGRATIONS_KEY, type: 'network-visual', title: 'Integrációs adatáramlás', body: 'A blokk nem kész runtime integrációkat állít, hanem a későbbi adatkapcsolatok üzleti térképét mutatja.', items: [
    { kind: 'heading', text: 'Kapcsolódási irányok csomópontokként.' },
    { kind: 'node', id: 'nav-online-szamla', label: 'NAV Online Számla' },
    { kind: 'node', id: 'magyar-bankok-psd2-aggreg8', label: 'Magyar bankok / PSD2 / Aggreg8' },
    { kind: 'node', id: 'hostware', label: 'Hostware' },
    { kind: 'node', id: 'szamlazz-hu', label: 'Számlázz.hu' },
    { kind: 'node', id: 'billingo', label: 'Billingo' },
    { kind: 'node', id: 'cegjelzo', label: 'Cégjelző' },
  ], sortOrder: 40, sort_order: 40, status: 'published' },
  { blockKey: HOME_AUDIENCES_KEY, block_key: HOME_AUDIENCES_KEY, type: 'cards', title: 'Kinek szól?', body: 'Hoteleknek, vendéglátóhelyeknek és szolgáltató vállalkozásoknak.', items: [
    { kind: 'card', target_type: 'legacy', title: 'Hoteleknek és szálláshelyeknek', href: '/kinek-szol/hotelek-szallashelyek/', text: 'Vendég-, pénzügyi és adminisztrációs folyamatok átláthatóbb működéséhez.', linkLabel: 'Részletek →', badge: 1 },
    { kind: 'card', target_type: 'legacy', title: 'Vendéglátóhelyeknek', href: '/kinek-szol/vendeglatohelyek/', text: 'Gyors napi adminisztráció és tisztább működési áttekintés vendéglátásban.', linkLabel: 'Részletek →', badge: 2 },
    { kind: 'card', target_type: 'legacy', title: 'Szolgáltató vállalkozásoknak', href: '/kinek-szol/szolgaltato-vallalkozasok/', text: 'Ügyfélkezelés, dokumentumok és számlázási folyamatok egy helyen.', linkLabel: 'Részletek →', badge: 3 },
  ], sortOrder: 50, sort_order: 50, status: 'published' },
]);

function blockKeyOf(block) { return block?.blockKey ?? block?.block_key ?? ''; }
function sortOrderOf(block) { const n = Number(block?.sortOrder ?? block?.sort_order ?? 0); return Number.isFinite(n) ? n : 0; }
function idOf(block) { const n = Number(block?.id ?? 0); return Number.isFinite(n) ? n : 0; }
function itemsOf(block) { return Array.isArray(block?.items) ? block.items : []; }
function homeError(code, message, details = {}) { const error = new Error(message); error.code = code; error.status = 409; error.details = details; return error; }
const firstString = (...values) => { for (const value of values) { if (value !== undefined && value !== null) return String(value); } return ''; };

export function canonicalHomePage(page = {}) {
  return {
    ...page,
    heroEyebrow: firstString(page.heroEyebrow, page.hero_eyebrow),
    heroTitle: firstString(page.heroTitle, page.hero_title),
    heroDescription: firstString(page.heroDescription, page.hero_description),
    heroAsset: firstString(page.heroAsset, page.hero_asset),
  };
}

export function homeBlockMeta(block = {}) {
  return { id: block.id, page_id: block.page_id ?? block.pageId, pageId: block.pageId ?? block.page_id, block_key: blockKeyOf(block), blockKey: blockKeyOf(block), type: block.type, status: block.status, sort_order: sortOrderOf(block), sortOrder: sortOrderOf(block) };
}

function assertNoNestedCards(block) {
  if (itemsOf(block).some((item) => item && typeof item === 'object' && Array.isArray(item.cards))) throw homeError('HOME_BLOCK_NESTED_CARDS_INVALID', `Nested cards wrapper nem támogatott: ${blockKeyOf(block)}`, { blockKey: blockKeyOf(block) });
}

export function validateIntroBlock(block) {
  const items = itemsOf(block);
  if (!block.title || !block.body || items.length !== 1 || !String(items[0]?.heading || '').trim()) throw homeError('HOME_INTRO_SCHEMA_INVALID', 'A home:intro blokk pontosan egy heading itemet, title-t és body-t igényel.', { blockKey: blockKeyOf(block) });
  return { kind: 'intro', key: HOME_INTRO_KEY, block, eyebrow: block.title, heading: String(items[0].heading), body: block.body, sortOrder: sortOrderOf(block), id: idOf(block) };
}

export function validateHeroMetaBlock(block) {
  const benefits = itemsOf(block).map((item, index) => {
    if (!String(item?.title || '').trim()) throw homeError('HOME_HERO_META_SCHEMA_INVALID', 'Hero benefit title kötelező.', { blockKey: blockKeyOf(block), index });
    return { title: String(item.title), text: String(item.text ?? '') };
  });
  return { subtitle: String(block.title || ''), benefits, block };
}

export function validateHomeHero(page = {}, { mode = 'static' } = {}) {
  const heroPage = canonicalHomePage(page);
  if (mode !== 'db-authoritative') return { hero: heroPage };
  const required = [
    ['heroEyebrow', 'HOME_HERO_EYEBROW_REQUIRED', 'A DB-authoritative home Hero heroEyebrow mezője kötelező.'],
    ['heroTitle', 'HOME_HERO_TITLE_REQUIRED', 'A DB-authoritative home Hero heroTitle mezője kötelező.'],
    ['heroDescription', 'HOME_HERO_DESCRIPTION_REQUIRED', 'A DB-authoritative home Hero heroDescription mezője kötelező.'],
    ['heroAsset', 'HOME_HERO_ASSET_REQUIRED', 'A DB-authoritative home Hero heroAsset mezője kötelező.'],
  ];
  for (const [field, code, message] of required) {
    if (!String(heroPage?.[field] || '').trim()) throw homeError(code, message, { route: heroPage?.route, pageId: heroPage?.id, field });
  }
  return { hero: heroPage };
}

export function normalizeCardsBlock(block, { pagesById, allowedPageTypes, actionPageTypes, strictSectionAction = false, allowSectionAction = true } = {}) {
  assertNoNestedCards(block);
  const cards = [];
  const actions = [];
  for (const [index, item] of itemsOf(block).entries()) {
    const kind = String(item?.kind || 'card');
    if (kind === 'card') {
      const card = resolveCardTarget(item, { pagesById, allowedPageTypes, blockKey: blockKeyOf(block), itemIndex: index });
      cards.push(card);
      continue;
    }
    if (kind === 'section-action') {
      if (!allowSectionAction) throw homeError('HOME_SECTION_ACTION_NOT_ALLOWED', `Section-action nem engedélyezett ebben a blokkban: ${blockKeyOf(block)}`, { blockKey: blockKeyOf(block), index });
      if (strictSectionAction && item.target_type !== 'page') throw homeError('HOME_SECTION_ACTION_TARGET_INVALID', 'DB-authoritative section-action csak page target lehet.', { blockKey: blockKeyOf(block), index, target_type: item.target_type });
      if (strictSectionAction && !String(item.title_override || '').trim()) throw homeError('HOME_SECTION_ACTION_LABEL_REQUIRED', 'DB-authoritative section-action title_override/gombfelirat kötelező.', { blockKey: blockKeyOf(block), index });
      const action = resolveCardTarget({ ...item, linkLabel: item.title_override || item.title || item.label }, { pagesById, allowedPageTypes: actionPageTypes, blockKey: blockKeyOf(block), itemIndex: index });
      actions.push({ ...action, label: item.title_override || action.title || action.linkLabel });
      continue;
    }
    throw homeError('HOME_CARD_KIND_INVALID', `Ismeretlen cards item kind: ${kind}`, { blockKey: blockKeyOf(block), index });
  }
  if (actions.length > 1) throw homeError('HOME_SECTION_ACTION_DUPLICATE', `Legfeljebb egy section-action lehet: ${blockKeyOf(block)}`, { blockKey: blockKeyOf(block) });
  if (!block.title || !block.body || cards.length === 0) throw homeError('HOME_CARDS_SCHEMA_INVALID', `A cards blokk title/body/card listát igényel: ${blockKeyOf(block)}`, { blockKey: blockKeyOf(block) });
  return { kind: 'cards', key: blockKeyOf(block), block, eyebrow: block.title, heading: block.body, cards, action: actions[0] || null, sortOrder: sortOrderOf(block), id: idOf(block) };
}

export function validateAiBlock(block) {
  const items = itemsOf(block);
  const headings = items.filter((item) => item?.kind === 'heading' && String(item.text || '').trim());
  const sources = items.filter((item) => item?.kind === 'source' && String(item.title || '').trim()).map((item) => ({ title: String(item.title) }));
  const messages = items.filter((item) => item?.kind === 'message').map((item) => ({ role: String(item.role || ''), title: String(item.title || ''), text: String(item.text || '') }));
  if (!block.title || !block.body || headings.length !== 1 || sources.length < 1 || !messages.some((m) => m.role === 'user' && m.text) || !messages.some((m) => m.role === 'assistant' && m.text)) throw homeError('HOME_AI_SCHEMA_INVALID', 'A home:ai-assistant blokk heading/source/user/assistant elemeket igényel.', { blockKey: blockKeyOf(block) });
  return { kind: 'ai-preview', key: HOME_AI_KEY, block, eyebrow: block.title, heading: headings[0].text, body: block.body, sources, messages, sortOrder: sortOrderOf(block), id: idOf(block) };
}

export function validateIntegrationsBlock(block) {
  const items = itemsOf(block);
  const headings = items.filter((item) => item?.kind === 'heading' && String(item.text || '').trim());
  const nodeIds = new Set();
  const nodes = [];
  for (const item of items.filter((entry) => entry?.kind === 'node')) {
    const id = String(item.id || '').trim();
    const label = String(item.label || '').trim();
    if (!id || !label) throw homeError('HOME_INTEGRATION_NODE_INVALID', 'Integration node id és label kötelező.', { blockKey: blockKeyOf(block), id });
    if (nodeIds.has(id)) throw homeError('HOME_INTEGRATION_NODE_DUPLICATE', `Duplikált integration node id: ${id}`, { blockKey: blockKeyOf(block), id });
    nodeIds.add(id); nodes.push({ id, label });
  }
  if (!block.title || !block.body || headings.length !== 1 || nodes.length < 1) throw homeError('HOME_INTEGRATIONS_SCHEMA_INVALID', 'A home:integrations blokk heading és node elemeket igényel.', { blockKey: blockKeyOf(block) });
  return { kind: 'network-visual', key: HOME_INTEGRATIONS_KEY, block, eyebrow: block.title, heading: headings[0].text, body: block.body, nodes, sortOrder: sortOrderOf(block), id: idOf(block) };
}

function validateBlockByKey(block, context) {
  const key = blockKeyOf(block);
  if (key === HOME_INTRO_KEY) return validateIntroBlock(block);
  if (key === HOME_SOLUTIONS_KEY) return normalizeCardsBlock(block, { ...context, allowedPageTypes: ['solution_detail'], actionPageTypes: ['solutions_index'], strictSectionAction: context.mode === 'db-authoritative' });
  if (key === HOME_AI_KEY) return validateAiBlock(block);
  if (key === HOME_INTEGRATIONS_KEY) return validateIntegrationsBlock(block);
  if (key === HOME_AUDIENCES_KEY) return normalizeCardsBlock(block, { ...context, allowedPageTypes: ['audience_detail'], allowSectionAction: false });
  throw homeError('HOME_CANONICAL_UNKNOWN', `Ismeretlen canonical home blokk: ${key}`, { blockKey: key });
}

function findByKey(list, key) { return (list || []).find((block) => blockKeyOf(block) === key); }

export function normalizeHomePage({ page, mode = 'static', routeIndex } = {}) {
  const canonicalPage = canonicalHomePage(page);
  validateHomeHero(canonicalPage, { mode });
  const pagesById = buildPageIndexById(routeIndex?.pages || []);
  const sourceBlocks = mode === 'static' ? staticHomeBlocksFixture : (canonicalPage?.blocks || []);
  const allMeta = mode === 'static' ? staticHomeBlocksFixture.map(homeBlockMeta) : (canonicalPage?.allBlockMeta || canonicalPage?.allBlocksMeta || []);
  const publishedByKey = new Map(sourceBlocks.map((block) => [blockKeyOf(block), block]));
  const metaByKey = new Map(allMeta.map((block) => [blockKeyOf(block), block]));
  for (const meta of allMeta) {
    const key = blockKeyOf(meta);
    if (key.startsWith('home:') && !canonicalHomeBlocks[key]) throw homeError('HOME_CANONICAL_UNKNOWN', `Ismeretlen home:* blokk: ${key}`, { blockKey: key });
  }
  const hidden = [];
  for (const key of allCanonicalHomeBlockKeys) {
    const spec = canonicalHomeBlocks[key];
    const meta = metaByKey.get(key);
    if (!meta) {
      if (mode === 'db-authoritative') throw homeError('HOME_CANONICAL_MISSING', `Hiányzó canonical home blokk metadata: ${key}`, { blockKey: key });
      continue;
    }
    if (meta.type !== spec.type) throw homeError('HOME_CANONICAL_TYPE_MISMATCH', `Home canonical blokk type eltérés: ${key}`, { blockKey: key, expectedType: spec.type, actualType: meta.type });
    if (meta.status !== 'published') { hidden.push(homeBlockMeta(meta)); continue; }
    const published = publishedByKey.get(key);
    if (!published) throw homeError('HOME_CANONICAL_PUBLISHED_CONTENT_MISSING', `Published canonical home blokk tartalma hiányzik: ${key}`, { blockKey: key });
  }
  const heroMetaBlock = findByKey(sourceBlocks, HOME_HERO_META_KEY);
  const heroMeta = heroMetaBlock ? validateHeroMetaBlock(heroMetaBlock) : { subtitle: '', benefits: [], block: null };
  const middle = [];
  for (const key of middleHomeBlockKeys) {
    const meta = metaByKey.get(key);
    if (meta?.status !== 'published') continue;
    const block = publishedByKey.get(key);
    if (block) middle.push(validateBlockByKey(block, { pagesById, mode }));
  }
  middle.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id || String(a.key).localeCompare(String(b.key)));
  return { heroMeta, middle, hidden, allMeta: allMeta.map(homeBlockMeta) };
}


export function validateInitialHomeAdoptBlocks(blocks = [], { pages = [], routeIndex } = {}) {
  const errors = [];
  const pagesById = buildPageIndexById(routeIndex?.pages || pages || []);
  for (const block of blocks.filter((entry) => [HOME_SOLUTIONS_KEY, HOME_AUDIENCES_KEY].includes(entry?.block_key || entry?.blockKey))) {
    const blockKey = block.block_key || block.blockKey;
    for (const [index, item] of itemsOf(block).entries()) {
      if (item?.kind === 'section-action') {
        if (blockKey !== HOME_SOLUTIONS_KEY) continue;
        const pageId = Number(item.target_page_id);
        const page = pagesById.get(pageId);
        if (item.target_type !== 'page') errors.push({ code: 'HOME_INITIAL_SECTION_ACTION_TARGET_INVALID', block_key: blockKey, index });
        if (!Number.isSafeInteger(pageId) || pageId <= 0) errors.push({ code: 'HOME_INITIAL_SECTION_ACTION_PAGE_ID_REQUIRED', block_key: blockKey, index });
        if (!String(item.title_override || '').trim()) errors.push({ code: 'HOME_INITIAL_SECTION_ACTION_LABEL_REQUIRED', block_key: blockKey, index });
        if (!page) errors.push({ code: 'HOME_INITIAL_SECTION_ACTION_PAGE_MISSING', block_key: blockKey, index, target_page_id: item.target_page_id });
        else {
          if (page.status !== 'published') errors.push({ code: 'HOME_INITIAL_SECTION_ACTION_PAGE_NOT_PUBLISHED', block_key: blockKey, index, target_page_id: item.target_page_id, pageStatus: page.status });
          if (page.type !== 'solutions_index') errors.push({ code: 'HOME_INITIAL_SECTION_ACTION_PAGE_TYPE_INVALID', block_key: blockKey, index, target_page_id: item.target_page_id, pageType: page.type });
        }
        continue;
      }
      if ((item?.kind || 'card') !== 'card') continue;
      if (item.target_type !== 'page') errors.push({ code: 'HOME_INITIAL_CARD_TARGET_INVALID', block_key: blockKey, index });
      if (!Number.isSafeInteger(Number(item.target_page_id)) || Number(item.target_page_id) <= 0) errors.push({ code: 'HOME_INITIAL_CARD_PAGE_ID_REQUIRED', block_key: blockKey, index });
      if (!String(item.text_override || '').trim()) errors.push({ code: 'HOME_INITIAL_CARD_TEXT_REQUIRED', block_key: blockKey, index });
    }
  }
  return errors;
}

export function validatePublishedHomeBlocksForSnapshot(content = {}) {
  const pages = Array.isArray(content.pages) ? content.pages : [];
  const home = pages.find((page) => page?.route === '/' && page?.type === 'home');
  if (!home || home.status !== 'published') return [];
  const homeBlocks = (content.blocks || []).filter((block) => Number(block.page_id) === Number(home.id));
  const published = homeBlocks.filter((block) => block.status === 'published');
  const errors = [];
  const routeIndex = { pages };
  try {
    assertRootHomePage(home, 'Home snapshot reference validation');
    const parsedPublished = published.map((block) => ({ ...block, blockKey: block.block_key, sortOrder: block.sort_order, items: typeof block.items === 'string' && block.items ? JSON.parse(block.items) : (Array.isArray(block.items) ? block.items : []) }));
    const parsedAll = homeBlocks.map((block) => ({ ...block, blockKey: block.block_key, sortOrder: block.sort_order, items: typeof block.items === 'string' && block.items ? JSON.parse(block.items) : (Array.isArray(block.items) ? block.items : []) }));
    resolvePageCtaBlock(parsedAll);
    const classification = classifyHomeContentBlocks(parsedAll);
    const state = homeContentMode(parsedAll);
    if (['partial','unknown'].includes(classification.state)) throw homeError('HOME_PUBLISHED_EXTRAS_BLOCKER', 'A főoldal canonical állapota nem élesíthető partial/unknown publikus blokkokkal.', { state: classification.state, blocks: classification.unknown.map(({id,block_key,type,title,sort_order})=>({id,block_key,type,title,sort_order})) });
    if (state === 'legacy' || state === 'empty') normalizeHomePage({ page: canonicalHomePage({ ...home, blocks: parsedPublished, allBlockMeta: parsedAll.map(homeBlockMeta) }), mode: 'db-authoritative', routeIndex });
    const middle = homeMiddleContentBlocks({ page: { ...home, blocks: parsedPublished }, mode: 'db-authoritative', routeIndex });
    for (const block of middle) {
      if (!isSupportedBlockType(block.type)) throw homeError('HOME_PUBLISHED_UNKNOWN_BLOCK_TYPE', `Ismeretlen published home blokk típus: ${block.type}`, { blockKey: block.block_key || block.blockKey, type: block.type });
      normalizeBlockItemsByType(block.type, block.items || [], { block, status: 'published', pages, requirePublishedTargets: ['cards','card-grid'].includes(block.type), path: `blocks.${block.block_key || block.id}.items` });
    }
  }
  catch (error) { errors.push({ code: error.code || 'HOME_CONTENT_INVALID', message: error.message, details: error.details || {} }); }
  return errors;
}

export function canonicalHomeBlockFixture() { return JSON.parse(JSON.stringify(staticHomeBlocksFixture)); }
export { rawCardTargetType, HOME_LEGACY_CTA_KEY };

export const genericHomeMiddleTypes = Object.freeze(['text','feature-list','list','cards','card-grid','cta','image-text','video','faq','ai-preview','network-visual','split-text','ai-assistant-preview','integrations-strip']);
const genericCanonicalHomeTypes = Object.freeze({ [HOME_INTRO_KEY]: 'split-text', [HOME_SOLUTIONS_KEY]: 'cards', [HOME_AI_KEY]: 'ai-assistant-preview', [HOME_INTEGRATIONS_KEY]: 'integrations-strip', [HOME_AUDIENCES_KEY]: 'cards' });
export function isHomeHeroMetaBlock(block = {}) { return blockKeyOf(block) === HOME_HERO_META_KEY; }
export function isLegacyCanonicalHomeMiddleBlock(block = {}) { const spec = canonicalHomeBlocks[blockKeyOf(block)]; if (!middleHomeBlockKeys.includes(blockKeyOf(block)) || spec?.type !== block?.type) return false; if (block?.type === 'cards' && itemsOf(block)[0]?.version === 2) return false; return true; }
export function isGenericHomeMiddleBlock(block = {}) { return !isHomeHeroMetaBlock(block) && !isLegacyCanonicalHomeMiddleBlock(block) && genericHomeMiddleTypes.includes(String(block?.type || '')); }
function legacyCardItemsToV2(items = []) {
  const cards = [];
  let action = null;
  for (const item of items || []) {
    if (item?.kind === 'section-action') action = { target_type: item.target_type || 'legacy', target_page_id: item.target_page_id, href: item.href || item.url || '', label: item.title_override || item.title || item.label || '' };
    else cards.push({ target_type: item?.target_type || 'legacy', target_page_id: item?.target_page_id, href: item?.href || item?.url || '', title: item?.title_override || item?.title || '', title_override: item?.title_override || '', text: item?.text_override || item?.text || '', text_override: item?.text_override || '', linkLabel: item?.linkLabel || item?.label || '', badge: item?.badge ?? item?.order ?? '' });
  }
  return [{ version: 2, variant: 'default', cards, action }];
}
export function legacyHomeBlockToGenericBlock(block = {}) {
  const key = blockKeyOf(block);
  const base = { ...block, blockKey: key, block_key: key, sortOrder: sortOrderOf(block), sort_order: sortOrderOf(block), status: block.status || 'published' };
  if (key === HOME_INTRO_KEY) return { ...base, type: 'split-text', items: [{ version: 1, heading: itemsOf(block)[0]?.heading || itemsOf(block)[0]?.text || '', layout: 'split' }] };
  if (key === HOME_SOLUTIONS_KEY || key === HOME_AUDIENCES_KEY) return { ...base, type: 'cards', items: legacyCardItemsToV2(itemsOf(block)) };
  if (key === HOME_AI_KEY) return { ...base, type: 'ai-assistant-preview' };
  if (key === HOME_INTEGRATIONS_KEY) return { ...base, type: 'integrations-strip' };
  return base;
}
export function classifyHomeContentBlocks(blocks = []) {
  const source = Array.isArray(blocks) ? blocks : [];
  const rows = source.map((block) => {
    const key = blockKeyOf(block);
    let role = 'unknown/invalid';
    if (isHomeHeroMetaBlock(block)) role = 'hero-meta';
    else if (isRecognizedPageCta(block)) role = 'recognized page CTA';
    else if (isLegacyCanonicalHomeMiddleBlock(block)) role = 'canonical legacy middle';
    else if (middleHomeBlockKeys.includes(key) && genericCanonicalHomeTypes[key] === String(block?.type || '')) role = 'canonical generic middle';
    else if (middleHomeBlockKeys.includes(key)) role = 'unknown/invalid';
    else if (block?.status === 'published' && genericHomeMiddleTypes.includes(String(block?.type || ''))) role = 'valid manual generic middle';
    else if (block?.status === 'draft') role = 'manual draft';
    else if (block?.status === 'archived') role = 'manual archived';
    return { ...homeBlockMeta(block), title: block?.title || '', role };
  });
  const pub = (role) => rows.filter((b) => b.status === 'published' && b.role === role);
  const legacy = pub('canonical legacy middle');
  const generic = pub('canonical generic middle');
  const validManual = pub('valid manual generic middle');
  const unknown = rows.filter((b) => b.status === 'published' && b.role === 'unknown/invalid');
  const hero = rows.some((b) => b.role === 'hero-meta');
  const hasExactCanonicalSet = (canonicalRows) => middleHomeBlockKeys.every((key) => canonicalRows.filter((row) => row.block_key === key).length === 1) && canonicalRows.length === middleHomeBlockKeys.length;
  let state = 'partial';
  if (unknown.length) state = 'unknown';
  else if (!hero && (legacy.length || generic.length)) state = 'partial';
  else if (legacy.length && generic.length) state = 'partial';
  else if (legacy.length) state = hasExactCanonicalSet(legacy) ? (validManual.length ? 'legacy-with-valid-manual' : 'legacy-clean') : 'partial';
  else if (generic.length) state = hasExactCanonicalSet(generic) ? (validManual.length ? 'generic-with-valid-manual' : 'generic-clean') : 'partial';
  else state = 'empty';
  return { state, hero, rows, validManual, extras: validManual, reconcileRequired: [], unknown, legacy, generic };
}
export function homeContentMode(blocks = []) {
  const state = classifyHomeContentBlocks(blocks).state;
  if (state.startsWith('generic')) return 'generic';
  if (state.startsWith('legacy')) return 'legacy';
  if (state === 'empty') return 'empty';
  return state;
}
export function homeMiddleContentBlocks({ page, mode = 'static', routeIndex } = {}) {
  const blocks = page?.blocks || [];
  const state = homeContentMode(blocks);
  const withRouteIndex = (block) => ({ ...block, routeIndex });
  const middle = blocks
    .filter((block) => block?.status === 'published' && !isHomeHeroMetaBlock(block) && !isRecognizedPageCta(block))
    .map((block) => isLegacyCanonicalHomeMiddleBlock(block) ? legacyHomeBlockToGenericBlock(block) : block)
    .filter((block) => genericHomeMiddleTypes.includes(String(block?.type || '')))
    .sort((a,b)=>sortOrderOf(a)-sortOrderOf(b)||idOf(a)-idOf(b))
    .map(withRouteIndex);
  if (middle.length || state !== 'empty') return middle;
  if (mode === 'static') return staticHomeBlocksFixture.filter(isLegacyCanonicalHomeMiddleBlock).map((block) => withRouteIndex(legacyHomeBlockToGenericBlock(block)));
  return [];
}
