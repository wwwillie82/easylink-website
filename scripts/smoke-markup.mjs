import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const badStrings = [
  '<aclass',
  '<spandata',
  '<lidata',
  '<h3data',
  '<idata',
  '<divclass',
  '<bdata',
  '<ahref',
  'cardcontent-card',
  'nodenode',
  '1pxsolid',
  '"data-astro',
  "'data-astro",
  'brand-logo-frame"data',
  'listing-card"data',
  'alt="Easylink"data',
  'egyátlátható',
  'napiadminisztráció',
  'acéged',
  'felületenirányíthatod',
  'rendezettebbdokumentumok',
  'rendszertadunk',
  'folyamatok,státuszok',
];

const badRegexes = [
  { name: '<tagdata-astro', regex: /<[a-z][a-z0-9-]*data-astro/gi },
  { name: 'double-quoted-attribute-data-astro-without-space', regex: /"data-astro/g },
  { name: 'single-quoted-attribute-data-astro-without-space', regex: /'data-astro/g },
  { name: 'href-attribute-data-without-space', regex: /href="[^"]+"data-astro/gi },
  { name: 'alt-attribute-data-without-space', regex: /alt="[^"]+"data/gi },
];

const targetArg = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
const target = targetArg ?? 'dist';

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(fullPath));
      continue;
    }

    if (/\.(html|css)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

function scanContent(content, label) {
  const failures = [];

  for (const pattern of badStrings) {
    if (content.includes(pattern)) {
      failures.push(`${label}: contains ${pattern}`);
    }
  }

  for (const { name, regex } of badRegexes) {
    regex.lastIndex = 0;
    const match = regex.exec(content);
    if (match) {
      failures.push(`${label}: matches ${name} (${match[0]})`);
    }
  }

  return failures;
}

async function scanLocal(dir) {
  try {
    const dirStat = await stat(dir);
    if (!dirStat.isDirectory()) {
      throw new Error(`${dir} is not a directory`);
    }
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
  const requiredAssets = [
    '/assets/brand/easylink-logo-horizontal.png',
    '/assets/nati/hero-bg-flow-03.webp',
    '/assets/nati/hero-bg-flow-01.webp',
    '/assets/nati/hero-bg-flow-02.webp',
  ];
  for (const asset of requiredAssets) {
    if (!allContent.includes(asset)) {
      failures.push(`${dir}: missing asset reference ${asset}`);
    }
  }

  return failures;
}

async function scanLive(baseUrl) {
  const routes = [
    '/',
    '/megoldasaink/',
    '/megoldasaink/penzugy-szamlazas/',
    '/kinek-szol/',
    '/kinek-szol/hotelek-szallashelyek/',
    '/integraciok/',
    '/arak/',
    '/kapcsolat/',
  ];
  const failures = [];

  for (const route of routes) {
    const url = new URL(route, baseUrl).toString();
    let response;
    try {
      response = await fetch(url);
    } catch (error) {
      failures.push(`${url}: ${error.message}`);
      continue;
    }

    if (!response.ok) {
      failures.push(`${url}: HTTP ${response.status}`);
      continue;
    }

    const content = await response.text();
    failures.push(...scanContent(content, url));
  }

  return failures;
}

const failures = target.startsWith('http://') || target.startsWith('https://')
  ? await scanLive(target)
  : await scanLocal(target);

if (failures.length > 0) {
  console.error('Markup smoke failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Markup smoke passed for ${target}.`);
