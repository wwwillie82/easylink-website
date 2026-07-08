import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const badStrings = [
  '<sectionclass',
  '<divclass',
  '<articleclass',
  '<aclass',
  '<spandata',
  '<lidata',
  '<span class="brand-logo-frame"data',
  '<span class="eyebrow"data',
  '<a class="listing-card"href',
  '<h2data',
  '<h3data',
  '<idata',
  '<bdata',
  '<ahref',
  'cardcontent-card',
  'nodenode',
  '1pxsolid',
  'brand-logo-frame"data',
  'eyebrow"data',
  'listing-card"href',
  'listing-card"data',
  '"data-astro',
  "'data-astro",
  'alt="Easylink"data',
  'egyátlátható',
  'napiadminisztráció',
  'acéged',
  'felületenirányíthatod',
  'rendezettebbdokumentumok',
  'rendszertadunk',
  'folyamatok,státuszok',
  'szintűválaszokká',
  'ingyena',
  'pénzügyiés',
  'tisztábbműködési',
  'integrációsirányként',
  'éskockázati',
  'Belépés /demo',
  'Mirejó',
];

const badRegexes = [
  { name: '<tagclass-without-space', regex: /<[a-z][a-z0-9-]*class=/gi },
  { name: '<taghref-without-space', regex: /<[a-z][a-z0-9-]*href=/gi },
  { name: '<tagdata-astro', regex: /<[a-z][a-z0-9-]*data-astro/gi },
  { name: 'double-quoted-attribute-data-astro-without-space', regex: /"data-astro/g },
  { name: 'single-quoted-attribute-data-astro-without-space', regex: /'data-astro/g },
  { name: 'href-attribute-followed-by-attribute-without-space', regex: /href="[^"]+"(?=[a-z_:][\w:.-]*=)/gi },
  { name: 'alt-attribute-followed-by-attribute-without-space', regex: /alt="[^"]+"(?=[a-z_:][\w:.-]*=)/gi },
  { name: 'quoted-attribute-followed-by-data-astro-without-space', regex: /["']data-astro/gi },
];

function scanContent(content, label) {
  const failures = [];
  for (const pattern of badStrings) {
    if (content.includes(pattern)) failures.push(`${label}: contains ${pattern}`);
  }
  for (const { name, regex } of badRegexes) {
    regex.lastIndex = 0;
    const match = regex.exec(content);
    if (match) failures.push(`${label}: matches ${name} (${match[0]})`);
  }
  return failures;
}

function assertSelfTest() {
  const fixtures = [
    '<sectionclass="section"',
    '<span class="brand-logo-frame"data-astro',
    '<a class="listing-card"href=',
    'Kérj demót vagy próbáld ki ingyena konfigurált Deploy felületen',
  ];
  const missed = fixtures.filter((fixture) => scanContent(fixture, 'self-test').length === 0);
  if (missed.length > 0) {
    console.error('Markup smoke self-test failed:');
    for (const fixture of missed) console.error(`- missed fixture: ${fixture}`);
    process.exit(1);
  }
}

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(fullPath));
    else if (/\.(html|css)$/.test(entry.name)) files.push(fullPath);
  }
  return files;
}

async function scanLocal(dir) {
  try {
    const dirStat = await stat(dir);
    if (!dirStat.isDirectory()) throw new Error(`${dir} is not a directory`);
  } catch (error) {
    console.error(`Markup smoke target not found: ${dir}`);
    console.error(error.message);
    process.exit(1);
  }
  const files = await collectFiles(dir);
  const failures = [];
  const combined = [];
  for (const file of files) {
    const content = await readFile(file, 'utf8');
    combined.push(content);
    failures.push(...scanContent(content, file));
  }
  const allContent = combined.join('\n');
  for (const asset of ['/assets/brand/easylink-logo-horizontal.png', '/assets/nati/hero-bg-flow-03.webp', '/assets/nati/hero-bg-flow-01.webp', '/assets/nati/hero-bg-flow-02.webp']) {
    if (!allContent.includes(asset)) failures.push(`${dir}: missing asset reference ${asset}`);
  }
  return failures;
}

async function scanLive(baseUrl) {
  const routes = ['/', '/megoldasaink/', '/megoldasaink/penzugy-szamlazas/', '/kinek-szol/', '/kinek-szol/hotelek-szallashelyek/', '/integraciok/', '/arak/', '/kapcsolat/'];
  const failures = [];
  for (const route of routes) {
    const url = new URL(route, baseUrl).toString();
    try {
      const response = await fetch(url);
      if (!response.ok) { failures.push(`${url}: HTTP ${response.status}`); continue; }
      failures.push(...scanContent(await response.text(), url));
    } catch (error) {
      failures.push(`${url}: ${error.message}`);
    }
  }
  return failures;
}

assertSelfTest();
const targetArg = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
const target = targetArg ?? 'dist';
const failures = target.startsWith('http://') || target.startsWith('https://') ? await scanLive(target) : await scanLocal(target);
if (failures.length > 0) {
  console.error('Markup smoke failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Markup smoke passed for ${target}.`);
