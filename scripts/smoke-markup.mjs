import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const badPatterns = [
  'nodenode',
  '<spandata',
  '<aclass',
  '<lidata',
  'cardcontent-card',
  '<divclass',
  '<bdata',
  '<ahref',
  '1pxsolid',
];

const args = new Set(process.argv.slice(2));
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

  for (const file of files) {
    const content = await readFile(file, 'utf8');
    for (const pattern of badPatterns) {
      if (content.includes(pattern)) {
        failures.push(`${file}: contains ${pattern}`);
      }
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
    for (const pattern of badPatterns) {
      if (content.includes(pattern)) {
        failures.push(`${url}: contains ${pattern}`);
      }
    }
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
