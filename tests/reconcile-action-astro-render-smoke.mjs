import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
const major = Number(process.versions.node.split('.')[0]);
if (major < 22) { console.log('reconcile action Astro render smoke skipped: Node 22+ required.'); process.exit(0); }
const routeBasename = `home-reconcile-action-${process.pid}`;
const routeDir = join('src/pages', routeBasename);
const outDir = await mkdtemp(join(tmpdir(), `${routeBasename}-out-`));
await mkdir(routeDir, { recursive: true });
try {
  await writeFile(join(routeDir, 'index.astro'), `---\nimport ContentBlocks from '../../components/ContentBlocks.astro';\nconst routeIndex = { pages: [{ id: 2, route: '/megoldasaink/', type: 'solutions_index', status: 'published', title: 'Megoldásaink' }] };\nconst blocks = [{ block_key: 'manual:solutions', type: 'cards', title: 'Megoldásaink', body: 'Egy rendszer', status: 'published', sort_order: 1, items: [{ version: 2, cards: [{ title: 'Kártya', target_type: 'legacy', href: '/x/' }], action: { target_type: 'page', target_page_id: 2, label: 'Összes megoldás' } }] }];\n---\n<html><body><ContentBlocks blocks={blocks} routeIndex={routeIndex} layout=\"stacked-sections\" context=\"home\" /></body></html>\n`);
  execFileSync(process.execPath, ['./node_modules/astro/bin/astro.mjs', 'build', '--outDir', outDir], { stdio: 'pipe', env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' } });
  const htmlPath = join(outDir, routeBasename, 'index.html');
  assert.equal(existsSync(htmlPath), true);
  const html = await readFile(htmlPath, 'utf8');
  assert.match(html, /home-content-blocks/);
  assert.match(html, /href="\/megoldasaink\/"/);
  assert.match(html, />Összes megoldás<\/a>/);
  console.log('reconcile action Astro render smoke ok');
} finally {
  await rm(routeDir, { recursive: true, force: true });
  await rm(outDir, { recursive: true, force: true });
}
