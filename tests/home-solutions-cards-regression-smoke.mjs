import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blockForm, serializeEditorItems } from '../src/lib/admin/render/blocks.mjs';
import { publicCardsFromItems } from '../src/lib/content/block-contracts.mjs';

const descriptions = [
  'Számlák, fizetési státuszok és pénzügyi teendők egy átlátható vezetői nézetben.',
  'Csapatadatok, munkaügyi dokumentumok és adminisztratív teendők rendezettebb kezelése.',
  'Ügyfelek, előzmények, dokumentumok és következő lépések tiszta üzleti nézetben.'
];
const pageTargetPages = [{ id: 30, route: '/megoldasaink/', title: 'Megoldásaink', type: 'solutions_index', status: 'published' }, { id: 31, route: '/hr/', title: 'HR', type: 'solution', status: 'published' }];
const cards = [
  { title_override: 'Pénzügy és számlázás', text_override: descriptions[0], target_type: 'legacy', href: '/penzugy/', linkLabel: 'Részletek', badge: '1' },
  { title: 'HR és Munkaügy', text_override: descriptions[1], target_type: 'page', target_page_id: 31, linkLabel: 'Részletek', badge: '2' },
  { title: 'CRM és ügyfélkezelés', text_override: descriptions[2], target_type: 'legacy', href: '/crm/', linkLabel: 'Részletek', badge: '3' },
  { title: 'Canonical cím', title_override: '', text: 'Canonical leírás', text_override: '', target_type: 'legacy', href: '/canonical/' },
  { title: 'Whitespace cím', title_override: '   ', text: 'Whitespace leírás', text_override: '   ', target_type: 'legacy', href: '/whitespace/' },
  { title_override: 'Statikus kártya', text_override: 'Link nélküli statikus leírás.', target_type: 'legacy' }
];
const items = [{ version: 2, variant: 'default', cards, action: { label: 'Összes megoldás', target_type: 'page', target_page_id: 30 } }];
const html = blockForm({ id: 140, page_id: 1, block_key: 'home:solutions', type: 'cards', title: 'Megoldások', body: '', items, status: 'published', sort_order: 20 }, { pageTargetPages });
for (const text of descriptions) assert.match(html, new RegExp(`data-item-text value="${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
assert.match(html, /data-item-title value="Pénzügy és számlázás"/);
assert.match(html, /data-item-title value="Canonical cím"/);
assert.match(html, /data-item-text value="Canonical leírás"/);
assert.match(html, /data-item-title value="Whitespace cím"/);
assert.match(html, /data-item-text value="Whitespace leírás"/);
assert.match(html, /data-cards-action-page>[\s\S]*<option value="30" selected>/);
assert.match(html, /data-card-target-page>[\s\S]*<option value="31" selected>/);

const hydratedTitle = (raw) => String(raw.title_override || '').trim() ? raw.title_override : raw.title;
const hydratedText = (raw) => String(raw.text_override || '').trim() ? raw.text_override : raw.text;
const serialized = serializeEditorItems({ type: 'cards', rows: Object.assign(cards.map((raw) => ({ raw, title: hydratedTitle(raw), text: hydratedText(raw), target_type: raw.target_type, target_page_id: raw.target_page_id || '', url: raw.href || '', linkLabel: raw.linkLabel || '', order: raw.badge || '' })), { action: { enabled: true, label: 'Minden megoldás', target_type: 'page', target_page_id: 30, href: '' } }) });
const out = serialized[0];
assert.equal(out.action.target_type, 'page');
assert.equal(out.action.target_page_id, 30);
assert.equal(Object.hasOwn(out.action, 'href'), false);
assert.deepEqual(out.cards.slice(0, 3).map((card) => card.text_override), descriptions);
assert.equal(out.cards.some((card) => card.text === ''), false);
assert.equal(Object.hasOwn(out.cards[0], 'title_override'), true);
const canonicalCard = out.cards.find((card) => card.title === 'Canonical cím');
assert.ok(canonicalCard, 'canonical title/text kártya nem tűnhet el');
assert.equal(canonicalCard.text, 'Canonical leírás');
assert.equal(String(canonicalCard.title_override || '').trim(), '');
assert.equal(String(canonicalCard.text_override || '').trim(), '');
const whitespaceCard = out.cards.find((card) => card.title === 'Whitespace cím');
assert.ok(whitespaceCard, 'whitespace-only override fallback kártya nem tűnhet el');
assert.equal(whitespaceCard.text, 'Whitespace leírás');
assert.equal(String(whitespaceCard.title_override || '').trim(), '');
assert.equal(String(whitespaceCard.text_override || '').trim(), '');
const staticCard = out.cards.find((card) => card.title_override === 'Statikus kártya');
assert.ok(staticCard, 'link nélküli title_override/text_override statikus kártya nem tűnhet el');
assert.equal(staticCard.text_override, 'Link nélküli statikus leírás.');
assert.equal(Object.hasOwn(staticCard, 'href'), false);


const isolatedSerializeEditorItems = new Function(`return (${serializeEditorItems.toString()});`)();
const isolatedCards = isolatedSerializeEditorItems({ type: 'cards', rows: Object.assign([{ raw: { title_override: '', text_override: '', target_type: 'legacy', href: '/isolated/' }, title: 'Isolated cím', text: 'Isolated leírás', target_type: 'legacy', url: '/isolated/', linkLabel: '', order: '' }], { action: { enabled: false } }) })[0].cards;
assert.deepEqual(isolatedCards, [{ target_type: 'legacy', href: '/isolated/', title: 'Isolated cím', text: 'Isolated leírás' }]);

const vm = publicCardsFromItems(items, { pages: pageTargetPages });
assert.deepEqual(vm.cards.slice(0, 3).map((card) => card.text), descriptions);
assert.equal(vm.action.href, '/megoldasaink/');
assert.equal(vm.action.label, 'Összes megoldás');

const contentBlocks = readFileSync(new URL('../src/components/ContentBlocks.astro', import.meta.url), 'utf8');
assert.match(contentBlocks, /\.home-content-blocks \.type-cards > \.more \{[^}]*margin-top: 28px;[^}]*\}/s);
assert.match(contentBlocks, /\.home-content-blocks \.type-cards > \.more \.button-secondary \{[^}]*color: var\(--color-navy\);[^}]*border-color: var\(--color-line\);[^}]*background: var\(--color-white\);[^}]*\}/s);
console.log('Home solutions cards regression smoke passed.');