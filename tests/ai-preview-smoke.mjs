import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeAiPreviewItems, normalizeAiPreviewHref } from '../src/lib/content/ai-preview.mjs';

const kinds = ['risk', 'metric', 'opportunity', 'recommendation', 'success', 'info'];
const normalized = normalizeAiPreviewItems([
  ...kinds.map((kind) => ({ kind, title: `${kind} title`, detail: 'Detail', value: 'Value', href: '/safe/' })),
  'Legacy string',
  { title: 'Legacy title' },
  { text: 'Legacy text' },
  { label: 'Legacy label' },
  { kind: 'unknown', title: 'Unknown kind' },
  { kind: 'risk', title: '' },
  { kind: 'info', title: 'Bad href', href: 'javascript:alert(1)' },
]);
assert.deepEqual(normalized.slice(0, 6).map((item) => item.kind), kinds);
assert.ok(normalized.find((item) => item.title === 'Legacy string' && item.kind === 'info'));
assert.ok(normalized.find((item) => item.title === 'Legacy title' && item.kind === 'info'));
assert.ok(normalized.find((item) => item.title === 'Legacy text' && item.kind === 'info'));
assert.ok(normalized.find((item) => item.title === 'Legacy label' && item.kind === 'info'));
assert.ok(normalized.find((item) => item.title === 'Unknown kind' && item.kind === 'info'));
assert.equal(normalized.find((item) => item.title === 'Bad href').href, undefined);
assert.equal(normalizeAiPreviewHref('example.com/x'), 'https://example.com/x');
assert.equal(normalizeAiPreviewHref('/belső/'), '/belső/');
assert.equal(normalizeAiPreviewHref('javascript:alert(1)'), '');

const component = await readFile('src/components/AiPreviewBlock.astro', 'utf8');
assert.match(component, /data-ai-preview-block/);
assert.match(component, /class=\"content-card type-ai-preview ai-preview-card\"/);
assert(!component.includes('AI üzleti pillanatkép'), 'AI preview title fallback must be removed');
assert(!component.includes("AI ASSZISZTENS DEMÓ"), 'AI preview eyebrow must be explicit editorial data, not a component fallback');
assert(!component.includes('Példa arra, hogyan emelhet ki'), 'AI preview intro fallback must be removed');
assert(!component.includes('Az Easylink AI-rétege'), 'AI preview context fallback must be removed');
assert.doesNotMatch(component, /Az AI megtalálta|automatikusan felismerte|Élő AI elemzés|Valós idejű AI riport/);
assert.match(component, /\.ai-preview-card \{[^}]*padding: clamp\(24px, 4vw, 40px\)/);
assert.match(component, /\.ai-preview-card h2 \{ color: #fff/);
assert.match(component, /role=\"list\"/);
assert.match(component, /role=\"listitem\"/);
for (const kind of kinds) assert.match(component, new RegExp(`is-${kind}`));
assert.match(component, /ai-preview-value/);
assert.match(component, /ai-preview-header/);
assert.match(component, /gap: clamp\(18px, 2\.4vw, 26px\)/);
assert.match(component, /padding: clamp\(20px, 2\.6vw, 26px\)/);
assert.match(component, /class="ai-preview-cta"/);
assert.match(component, /Részletek →/);
assert.match(component, /target=\{publicHrefTarget\(item.href\)\} rel=\{publicHrefRel\(item.href\)\}/);
assert.match(component, /a:focus-visible/);
assert.match(component, /@media \(max-width: 700px\)[\s\S]*grid-template-columns: 1fr/);
assert.doesNotMatch(component, /<ul>/);

const contentBlocks = await readFile('src/components/ContentBlocks.astro', 'utf8');
assert.match(contentBlocks, /import AiPreviewBlock from/);
assert.match(contentBlocks, /if \(type === 'ai-preview'\)/);
assert.match(contentBlocks, /<AiPreviewBlock block=\{block\}/);
assert.match(contentBlocks, /\.type-network-visual h2, \.type-cta h2 \{ color: white; \}/);

console.log('AI preview smoke passed: contract, legacy normalization, safe href, public/admin markup contracts.');
