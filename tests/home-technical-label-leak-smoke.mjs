import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < 22) {
  console.warn('home technical label leak smoke skipped: Astro rendered HTML harness requires Node 22+.');
  process.exit(0);
}

const pagePath = 'src/pages/__home-render-smoke.astro';
const outDir = await mkdtemp(join(tmpdir(), 'easylink-home-render-smoke-'));
const pageSource = `---
import ContentBlocks from '../components/ContentBlocks.astro';
const emptyBlocks = [
  { id: 1, block_key: 'empty:text', type: 'text', title: '', body: '', items: [] },
  { id: 2, block_key: 'empty:cta', type: 'cta', title: '', body: '', items: [{}] },
  { id: 3, block_key: 'empty:faq', type: 'faq', title: '', body: '', items: [{ question: 'Kérdés?', answer: '' }] },
  { id: 4, block_key: 'empty:ai', type: 'ai-assistant-preview', title: '', body: '', items: [{ kind: 'message', role: 'assistant', title: '', text: '' }] },
  { id: 5, block_key: 'empty:ai-preview', type: 'ai-preview', title: '', body: '', items: [] },
  { id: 6, block_key: 'empty:network', type: 'network-visual', title: '', body: '', items: [] },
];
const editorialBlocks = [
  { id: 10, block_key: 'editorial:text', type: 'text', eyebrow: 'EXPLICIT EYEBROW', title: 'Explicit title', body: 'Explicit body', items: [] },
  { id: 11, block_key: 'editorial:list', type: 'feature-list', title: '', body: '', items: [{ title: 'Explicit item' }] },
];
---
<html><body><ContentBlocks blocks={[...emptyBlocks, ...editorialBlocks]} layout="stacked-sections" /></body></html>
`;
try {
  await writeFile(pagePath, pageSource);
  const build = spawnSync(process.execPath, ['./node_modules/astro/bin/astro.mjs', 'build', '--outDir', outDir, '--silent'], { encoding: 'utf8' });
  assert.equal(build.status, 0, build.stderr || build.stdout);
  const htmlPath = join(outDir, '__home-render-smoke', 'index.html');
  assert(existsSync(htmlPath), `missing rendered HTML: ${htmlPath}`);
  const html = readFileSync(htmlPath, 'utf8');
  for (const forbidden of ['AI ASSZISZTENS DEMÓ', 'AI üzleti pillanatkép', 'ADATKAPCSOLAT', 'Adatkapcsolati ábra', 'Tartalom', 'Kártyák', 'Felsorolás']) assert(!html.includes(forbidden), forbidden);
  assert(!/<span class="eyebrow"\s*>\s*<\/span>/.test(html));
  assert(!/<h2\s*>\s*<\/h2>/.test(html));
  assert(!/<p\s*>\s*<\/p>/.test(html));
  assert(!/<p class="cta-actions"\s*>\s*<\/p>/.test(html));
  assert(html.includes('EXPLICIT EYEBROW'));
  assert(html.includes('Explicit title'));
  assert(html.includes('Explicit body'));
  assert(html.includes('Explicit item'));
} finally {
  await rm(pagePath, { force: true });
  await rm(outDir, { recursive: true, force: true });
}
console.log('home technical label leak smoke ok');
