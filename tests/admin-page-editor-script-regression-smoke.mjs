import assert from 'node:assert/strict';
import vm from 'node:vm';
import { pageForm } from '../src/lib/admin/render/pages.mjs';

const pageTargetPages = [{ id: 30, title: 'Megoldásaink', route: '/megoldasaink/', status: 'published' }];
const blocks = [
  { id: 10, page_id: 1, block_key: 'page:cta', type: 'cta', title: 'CTA', body: 'Body', items: [{ ctaMode: 'custom', eyebrow: 'E', label: 'Demo', url: '/demo/' }], status: 'published', sort_order: 900 },
  { id: 11, page_id: 1, block_key: 'home:solutions', type: 'cards', title: 'Megoldásaink', body: 'Egy rendszer', items: [{ version: 2, cards: [{ title: 'Kártya', target_type: 'legacy', href: '/x/' }], action: { label: 'Összes megoldás', target_type: 'page', target_page_id: 30 } }], status: 'published', sort_order: 10 },
  { id: 12, page_id: 1, block_key: 'home:split', type: 'split-text', title: 'Split', body: '', items: [{ version: 1, heading: 'Heading', layout: 'split' }], status: 'published', sort_order: 20 },
  { id: 13, page_id: 1, block_key: 'home:ai', type: 'ai-assistant-preview', title: 'AI', body: '', items: [{ kind: 'heading', text: 'AI' }, { kind: 'source', title: 'CRM' }, { kind: 'message', role: 'user', text: 'Hi' }, { kind: 'message', role: 'assistant', text: 'Hello' }], status: 'published', sort_order: 30 },
  { id: 14, page_id: 1, block_key: 'home:integrations', type: 'integrations-strip', title: 'Integrációk', body: '', items: [{ kind: 'heading', text: 'Integrációk' }, { kind: 'node', id: 'crm', label: 'CRM' }], status: 'published', sort_order: 40 },
  { id: 15, page_id: 1, block_key: 'home:hero-meta', type: 'text', title: 'Hero meta', body: '', items: [], status: 'published', sort_order: 0 },
];
const html = pageForm({ page: { id: 1, type: 'home', title: 'Home', route: '/', status: 'published', slug: '', sort_order: 0 }, blocks, pageTargetPages, defaultCta: { title: 'Global', primaryLabel: 'Global CTA', primaryUrl: '/kapcsolat/' } });
const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1] || '';
assert.ok(html.includes('id="page-form"'), 'full pageForm HTML contains page-form');
assert.equal(html.includes('name="block_key" value="home:hero-meta"'), false, 'home:hero-meta stays excluded from generic block forms');
assert.doesNotThrow(() => new vm.Script(script), 'generated pageEditorJs script parses');
assert.doesNotMatch(script, /panelClasses/, 'generated script must not reference the removed panelClasses token');
assert.match(script, /document\.querySelectorAll\('\.block-form'\)\.forEach\(wireBlock\)/, 'block forms are wired by generated script');
assert.match(script, /e\.preventDefault\(\)/, 'generated submit handlers prevent native form submission');
assert.match(script, /fetch\('\/api\/admin\/blocks'/, 'generated block submit posts to the blocks API');
assert.match(script, /setupDirtyForm/, 'generated script contains dirty-state setup');
assert.match(script, /st\.sync/, 'generated block mutations resync dirty-state after serialization');
console.log('Admin page editor script regression smoke passed: generated pageEditorJs parses and keeps wiring tokens.');
