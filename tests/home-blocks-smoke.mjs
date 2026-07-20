import assert from 'node:assert/strict';
import { HOME_AI_KEY, HOME_AUDIENCES_KEY, HOME_HERO_META_KEY, HOME_INTEGRATIONS_KEY, HOME_INTRO_KEY, HOME_SOLUTIONS_KEY, canonicalHomeBlockFixture, normalizeHomePage, validateInitialHomeAdoptBlocks, validatePublishedHomeBlocksForSnapshot } from '../src/lib/content/home-blocks.mjs';

const page = (id, type, route, title, status = 'published') => ({ id, type, route, title, slug: route.split('/').filter(Boolean).pop() || 'home', status, seoDescription: `${title} seo`, heroEyebrow: `${title} eyebrow`, heroTitle: title, heroDescription: `${title} hero`, heroAsset: '/assets/test.webp' });
const pages = [page(2, 'solutions_index', '/megoldasaink/', 'Megoldásaink'), page(3, 'solution_detail', '/megoldasaink/penzugy-szamlazas/', 'Pénzügy és számlázás'), page(4, 'solution_detail', '/megoldasaink/hr-munkaugy/', 'HR és Munkaügy'), page(5, 'solution_detail', '/megoldasaink/crm-ugyfelkezeles/', 'CRM és ügyfélkezelés'), page(21, 'audience_detail', '/kinek-szol/hotelek-szallashelyek/', 'Hoteleknek és szálláshelyeknek'), page(22, 'audience_detail', '/kinek-szol/vendeglatohelyek/', 'Vendéglátóhelyeknek'), page(23, 'audience_detail', '/kinek-szol/szolgaltato-vallalkozasok/', 'Szolgáltató vállalkozásoknak')];
const routeIndex = { pages };
const dbBlocks = canonicalHomeBlockFixture().map((block, index) => {
  const items = structuredClone(block.items);
  if (block.blockKey === HOME_SOLUTIONS_KEY) {
    items[0] = { kind: 'card', target_type: 'page', target_page_id: 3, title_override: null, text_override: 'Számlák, fizetési státuszok és pénzügyi teendők egy átlátható vezetői nézetben.', linkLabel: 'Részletek →', badge: 1 };
    items[1] = { kind: 'card', target_type: 'page', target_page_id: 4, title_override: null, text_override: 'Csapatadatok, munkaügyi dokumentumok és adminisztratív teendők rendezettebb kezelése.', linkLabel: 'Részletek →', badge: 2 };
    items[2] = { kind: 'card', target_type: 'page', target_page_id: 5, title_override: 'CRM saját', text_override: 'Ügyfelek, előzmények, dokumentumok és következő lépések tiszta üzleti nézetben.', linkLabel: 'Részletek →', badge: 3 };
    items[3] = { kind: 'section-action', target_type: 'page', target_page_id: 2, title_override: 'Összes megoldás' };
  }
  if (block.blockKey === HOME_AUDIENCES_KEY) {
    items[0] = { kind: 'card', target_type: 'page', target_page_id: 21, title_override: null, text_override: 'Vendég-, pénzügyi és adminisztrációs folyamatok átláthatóbb működéséhez.', linkLabel: 'Részletek →', badge: 1 };
    items[1] = { kind: 'card', target_type: 'page', target_page_id: 22, title_override: null, text_override: 'Gyors napi adminisztráció és tisztább működési áttekintés vendéglátásban.', linkLabel: 'Részletek →', badge: 2 };
    items[2] = { kind: 'card', target_type: 'page', target_page_id: 23, title_override: null, text_override: 'Ügyfélkezelés, dokumentumok és számlázási folyamatok egy helyen.', linkLabel: 'Részletek →', badge: 3 };
  }
  return { ...block, id: index + 10, page_id: 1, pageId: 1, items };
});
const meta = (blocks = dbBlocks) => blocks.map(({ id, page_id, pageId, block_key, blockKey, type, status, sort_order, sortOrder }) => ({ id, page_id, pageId, block_key, blockKey, type, status, sort_order, sortOrder }));
const home = (blocks = dbBlocks, allBlockMeta = meta(blocks), overrides = {}) => ({ id: 1, route: '/', type: 'home', status: 'published', heroEyebrow: 'Home eyebrow', heroTitle: 'Home title', heroDescription: 'Home description', heroAsset: '/assets/home.webp', blocks, allBlockMeta, ...overrides });

const rawSnapshotBlocks = () => dbBlocks.map((b) => ({ ...b, page_id: 1, block_key: b.blockKey, sort_order: b.sortOrder, items: JSON.stringify(b.items) }));
const rawSnapshot = (homeOverrides = {}) => ({ pages: [
  { id: 1, route: '/', type: 'home', title: 'Easylink', status: 'published', hero_eyebrow: 'Home eyebrow', hero_title: 'Home title', hero_description: 'Home description', hero_asset: '/assets/home.webp', ...homeOverrides },
  ...pages,
], blocks: rawSnapshotBlocks() });
assert.deepEqual(validatePublishedHomeBlocksForSnapshot(rawSnapshot()), []);
assert.equal(validatePublishedHomeBlocksForSnapshot(rawSnapshot({ hero_eyebrow: '' }))[0].code, 'HOME_HERO_EYEBROW_REQUIRED');
assert.equal(validatePublishedHomeBlocksForSnapshot(rawSnapshot({ hero_title: '' }))[0].code, 'HOME_HERO_TITLE_REQUIRED');
assert.equal(validatePublishedHomeBlocksForSnapshot(rawSnapshot({ hero_description: '' }))[0].code, 'HOME_HERO_DESCRIPTION_REQUIRED');
assert.equal(validatePublishedHomeBlocksForSnapshot(rawSnapshot({ hero_asset: '' }))[0].code, 'HOME_HERO_ASSET_REQUIRED');
assert.equal(validatePublishedHomeBlocksForSnapshot(rawSnapshot({ title: 'Easylink', hero_title: null }))[0].code, 'HOME_HERO_TITLE_REQUIRED');


assert.throws(() => normalizeHomePage({ page: home(dbBlocks, meta(), { heroEyebrow: '' }), mode: 'db-authoritative', routeIndex }), /heroEyebrow/);
assert.throws(() => normalizeHomePage({ page: home(dbBlocks, meta(), { heroDescription: '' }), mode: 'db-authoritative', routeIndex }), /heroDescription/);
assert.throws(() => normalizeHomePage({ page: home(dbBlocks, meta(), { heroAsset: '' }), mode: 'db-authoritative', routeIndex }), /heroAsset/);
normalizeHomePage({ page: { route: '/', type: 'home', status: 'published', blocks: [] }, mode: 'static', routeIndex });

const invalidInitialSectionActionBlocks = structuredClone(dbBlocks);
invalidInitialSectionActionBlocks.find((b) => b.blockKey === HOME_SOLUTIONS_KEY).items[3].target_page_id = 3;
assert.deepEqual(validateInitialHomeAdoptBlocks(invalidInitialSectionActionBlocks, { pages }).some((e) => e.code === 'HOME_INITIAL_SECTION_ACTION_PAGE_TYPE_INVALID'), true);
invalidInitialSectionActionBlocks.find((b) => b.blockKey === HOME_SOLUTIONS_KEY).items[3].target_page_id = 2;
pages[0].status = 'draft';
assert.deepEqual(validateInitialHomeAdoptBlocks(invalidInitialSectionActionBlocks, { pages }).some((e) => e.code === 'HOME_INITIAL_SECTION_ACTION_PAGE_NOT_PUBLISHED'), true);
pages[0].status = 'published';

let normalized = normalizeHomePage({ page: home(), mode: 'db-authoritative', routeIndex });
assert.equal(normalized.heroMeta.subtitle, 'Cégvezetés, könnyedén.');
assert.equal(normalized.middle.map((s) => s.key).join(','), [HOME_INTRO_KEY, HOME_SOLUTIONS_KEY, HOME_AI_KEY, HOME_INTEGRATIONS_KEY, HOME_AUDIENCES_KEY].join(','));
assert.equal(normalized.middle.find((s) => s.key === HOME_SOLUTIONS_KEY).cards[0].href, '/megoldasaink/penzugy-szamlazas/');
assert.equal(normalized.middle.find((s) => s.key === HOME_SOLUTIONS_KEY).cards[2].title, 'CRM saját');
assert.equal(normalized.middle.find((s) => s.key === HOME_SOLUTIONS_KEY).action.label, 'Összes megoldás');

const runtimeMixed = dbBlocks.map((b) => b.blockKey === HOME_SOLUTIONS_KEY ? { ...b, items: [
  { kind: 'card', target_type: 'page', target_page_id: 3, title_override: null, linkLabel: 'Részletek →', badge: 1 },
  { kind: 'card', target_type: 'legacy', title: 'Legacy belső', href: '/kezi-belso/', text: 'Legacy text', linkLabel: 'Tovább →', badge: 2 },
  { kind: 'card', target_type: 'external', title: 'External docs', href: 'https://example.com/docs', text: 'External text', linkLabel: 'Megnyitás →', badge: 3 },
  { kind: 'section-action', target_type: 'page', target_page_id: 2, title_override: 'Összes megoldás' },
] } : b);
normalized = normalizeHomePage({ page: home(runtimeMixed, meta(runtimeMixed)), mode: 'db-authoritative', routeIndex });
const mixedSolutions = normalized.middle.find((s) => s.key === HOME_SOLUTIONS_KEY);
assert.equal(mixedSolutions.cards[0].text, 'Pénzügy és számlázás seo');
assert.equal(mixedSolutions.cards[0].href, '/megoldasaink/penzugy-szamlazas/');
pages[1].route = '/megoldasaink/penzugy-uj/';
normalized = normalizeHomePage({ page: home(runtimeMixed, meta(runtimeMixed)), mode: 'db-authoritative', routeIndex });
assert.equal(normalized.middle.find((s) => s.key === HOME_SOLUTIONS_KEY).cards[0].href, '/megoldasaink/penzugy-uj/');
pages[1].route = '/megoldasaink/penzugy-szamlazas/';
assert.equal(mixedSolutions.cards[1].href, '/kezi-belso/');
assert.equal(mixedSolutions.cards[2].href, 'https://example.com/docs');
assert.throws(() => normalizeHomePage({ page: home(runtimeMixed.map((b) => b.blockKey === HOME_SOLUTIONS_KEY ? { ...b, items: [{ kind: 'card', target_type: 'legacy', href: 'javascript:alert(1)' }, b.items[3]] } : b), meta(runtimeMixed)), mode: 'db-authoritative', routeIndex }), /Legacy kártya/);
assert.throws(() => normalizeHomePage({ page: home(runtimeMixed.map((b) => b.blockKey === HOME_SOLUTIONS_KEY ? { ...b, items: [{ kind: 'card', target_type: 'external', href: 'ftp://example.com' }, b.items[3]] } : b), meta(runtimeMixed)), mode: 'db-authoritative', routeIndex }), /Külső kártya/);
assert.throws(() => normalizeHomePage({ page: home(runtimeMixed.map((b) => b.blockKey === HOME_SOLUTIONS_KEY ? { ...b, items: [{ kind: 'card', target_type: 'free', href: '/x/' }, b.items[3]] } : b), meta(runtimeMixed)), mode: 'db-authoritative', routeIndex }), /Invalid card/);
assert.throws(() => normalizeHomePage({ page: home(runtimeMixed.map((b) => b.blockKey === HOME_SOLUTIONS_KEY ? { ...b, items: [...b.items.slice(0, 3), { kind: 'section-action', target_type: 'legacy', title: 'Összes', href: '/megoldasaink/' }] } : b), meta(runtimeMixed)), mode: 'db-authoritative', routeIndex }), /section-action csak page/);
assert.throws(() => normalizeHomePage({ page: home(runtimeMixed.map((b) => b.blockKey === HOME_SOLUTIONS_KEY ? { ...b, items: [...b.items.slice(0, 3), { kind: 'section-action', target_type: 'external', title: 'Összes', href: 'https://example.com' }] } : b), meta(runtimeMixed)), mode: 'db-authoritative', routeIndex }), /section-action csak page/);
assert.throws(() => normalizeHomePage({ page: home(runtimeMixed.map((b) => b.blockKey === HOME_SOLUTIONS_KEY ? { ...b, items: [...b.items.slice(0, 3), { kind: 'section-action', target_type: 'page', target_page_id: 3, title_override: 'Rossz' }] } : b), meta(runtimeMixed)), mode: 'db-authoritative', routeIndex }), /típusa hibás/);
pages[0].status = 'draft';
assert.throws(() => normalizeHomePage({ page: home(runtimeMixed, meta(runtimeMixed)), mode: 'db-authoritative', routeIndex }), /nem publikus/);
pages[0].status = 'published';
assert.throws(() => normalizeHomePage({ page: home(runtimeMixed.map((b) => b.blockKey === HOME_SOLUTIONS_KEY ? { ...b, items: [...b.items.slice(0, 3), { kind: 'section-action', target_type: 'page', target_page_id: 2, title_override: '' }] } : b), meta(runtimeMixed)), mode: 'db-authoritative', routeIndex }), /gombfelirat/);
assert.throws(() => normalizeHomePage({ page: home(runtimeMixed.map((b) => b.blockKey === HOME_SOLUTIONS_KEY ? { ...b, items: [...b.items, { kind: 'section-action', target_type: 'page', target_page_id: 2, title_override: 'Dupla' }] } : b), meta(runtimeMixed)), mode: 'db-authoritative', routeIndex }), /Legfeljebb egy section-action/);
assert.throws(() => normalizeHomePage({ page: home(dbBlocks.map((b) => b.blockKey === HOME_AUDIENCES_KEY ? { ...b, items: [...b.items, { kind: 'section-action', target_type: 'page', target_page_id: 2, title_override: 'Tiltott' }] } : b), meta()), mode: 'db-authoritative', routeIndex }), /Section-action nem engedélyezett/);
assert.throws(() => normalizeHomePage({ page: home(dbBlocks.map((b) => b.blockKey === HOME_AUDIENCES_KEY ? { ...b, items: [...b.items, { kind: 'section-action', target_type: 'legacy', href: '/x/', title: 'Tiltott' }] } : b), meta()), mode: 'db-authoritative', routeIndex }), /Section-action nem engedélyezett/);
assert.throws(() => normalizeHomePage({ page: home(dbBlocks.map((b) => b.blockKey === HOME_AUDIENCES_KEY ? { ...b, items: [...b.items, { kind: 'section-action', target_type: 'external', href: 'https://example.com', title: 'Tiltott' }] } : b), meta()), mode: 'db-authoritative', routeIndex }), /Section-action nem engedélyezett/);
assert.equal(normalizeHomePage({ page: home(), mode: 'db-authoritative', routeIndex }).middle.find((s) => s.key === HOME_AUDIENCES_KEY).action, null);
normalizeHomePage({ page: { route: '/', type: 'home', status: 'published', blocks: [] }, mode: 'static', routeIndex });

const hiddenMeta = meta().map((m) => m.blockKey === HOME_AI_KEY ? { ...m, status: 'draft' } : m);
const hiddenContent = dbBlocks.filter((b) => b.blockKey !== HOME_AI_KEY);
normalized = normalizeHomePage({ page: home(hiddenContent, hiddenMeta), mode: 'db-authoritative', routeIndex });
assert.equal(normalized.middle.some((s) => s.key === HOME_AI_KEY), false);
assert.equal(normalized.hidden.some((b) => b.blockKey === HOME_AI_KEY), true);

const archivedMeta = meta().map((m) => m.blockKey === HOME_INTEGRATIONS_KEY ? { ...m, status: 'archived' } : m);
normalized = normalizeHomePage({ page: home(dbBlocks.filter((b) => b.blockKey !== HOME_INTEGRATIONS_KEY), archivedMeta), mode: 'db-authoritative', routeIndex });
assert.equal(normalized.middle.some((s) => s.key === HOME_INTEGRATIONS_KEY), false);

assert.throws(() => normalizeHomePage({ page: home(dbBlocks.filter((b) => b.blockKey !== HOME_INTRO_KEY), meta().filter((b) => b.blockKey !== HOME_INTRO_KEY)), mode: 'db-authoritative', routeIndex }), /Hiányzó canonical home blokk/);
assert.throws(() => normalizeHomePage({ page: home(dbBlocks.filter((b) => b.blockKey !== HOME_INTRO_KEY), meta()), mode: 'db-authoritative', routeIndex }), /tartalma hiányzik/);
assert.throws(() => normalizeHomePage({ page: home(dbBlocks, meta().map((b) => b.blockKey === HOME_INTRO_KEY ? { ...b, type: 'cards' } : b)), mode: 'db-authoritative', routeIndex }), /type eltérés/);
assert.throws(() => normalizeHomePage({ page: home([...dbBlocks, { blockKey: 'home:unknown', block_key: 'home:unknown', type: 'text', title: 'X', body: '', items: [], status: 'published', sortOrder: 99, sort_order: 99 }], [...meta(), { blockKey: 'home:unknown', block_key: 'home:unknown', type: 'text', status: 'published', sortOrder: 99, sort_order: 99 }]), mode: 'db-authoritative', routeIndex }), /Ismeretlen home/);
assert.throws(() => normalizeHomePage({ page: home(dbBlocks.map((b) => b.blockKey === HOME_INTRO_KEY ? { ...b, items: [] } : b), meta()), mode: 'db-authoritative', routeIndex }), /home:intro/);
assert.throws(() => normalizeHomePage({ page: home(dbBlocks.map((b) => b.blockKey === HOME_AI_KEY ? { ...b, items: [{ kind: 'heading', text: 'Only' }] } : b), meta()), mode: 'db-authoritative', routeIndex }), /home:ai-assistant/);
assert.throws(() => normalizeHomePage({ page: home(dbBlocks.map((b) => b.blockKey === HOME_INTEGRATIONS_KEY ? { ...b, items: [{ kind: 'heading', text: 'H' }, { kind: 'node', id: 'x', label: 'X' }, { kind: 'node', id: 'x', label: 'Y' }] } : b), meta()), mode: 'db-authoritative', routeIndex }), /Duplikált integration/);
assert.throws(() => normalizeHomePage({ page: home(dbBlocks.map((b) => b.blockKey === HOME_SOLUTIONS_KEY ? { ...b, items: [{ cards: [] }] } : b), meta()), mode: 'db-authoritative', routeIndex }), /Nested cards/);
assert.throws(() => normalizeHomePage({ page: home(dbBlocks.map((b) => b.blockKey === HOME_SOLUTIONS_KEY ? { ...b, items: [{ kind: 'card', target_type: 'free' }] } : b), meta()), mode: 'db-authoritative', routeIndex }), /Canonical initial home card|Invalid card/);

const withUnpublished = { pages: [{ id: 1, route: '/', type: 'home', status: 'published', heroEyebrow: 'Home eyebrow', heroTitle: 'Home title', heroDescription: 'Home description', heroAsset: '/assets/home.webp' }, ...pages.map((p) => p.id === 3 ? { ...p, status: 'draft' } : p)], blocks: dbBlocks.map((b) => ({ ...b, block_key: b.blockKey, sort_order: b.sortOrder, items: JSON.stringify(b.items), page_id: 1 })) };
assert.equal(validatePublishedHomeBlocksForSnapshot(withUnpublished)[0].code, 'CARD_TARGET_PAGE_NOT_PUBLISHED');
console.log('Home blocks smoke passed: missing/hidden/schema/card targets/preflight.');
