import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const LEGACY_LOGO_PATH = '/assets/brand/easylink-logo-horizontal.png';
const SITE_MEDIA_PREFIX = '/assets/site-media/';
const NATI_HERO_ASSETS = ['/assets/nati/hero-bg-flow-03.webp', '/assets/nati/hero-bg-flow-01.webp', '/assets/nati/hero-bg-flow-02.webp'];

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

function getAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}=("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return match?.[2] ?? match?.[3] ?? match?.[4] ?? '';
}

function decodePathForValidation(src) {
  try {
    return decodeURIComponent(src);
  } catch {
    return src;
  }
}

function isSafeBrandLogoSrc(src) {
  if (!src) return false;

  const decodedSrc = decodePathForValidation(src);
  for (const candidate of [src, decodedSrc]) {
    if (/^(?:https?:)?\/\//i.test(candidate)) return false;
    if (/^javascript:/i.test(candidate)) return false;
    if (candidate.includes('\\')) return false;
    if (candidate.split('/').includes('..')) return false;
  }

  if (src === LEGACY_LOGO_PATH && decodedSrc === LEGACY_LOGO_PATH) return true;
  return src.startsWith(SITE_MEDIA_PREFIX)
    && decodedSrc.startsWith(SITE_MEDIA_PREFIX)
    && decodedSrc.length > SITE_MEDIA_PREFIX.length;
}

function assertSafeBrandLogoSrc(src, label) {
  if (!isSafeBrandLogoSrc(src)) {
    return `${label}: invalid brand logo src ${JSON.stringify(src)}`;
  }
  return null;
}

function findElementSection(content, tagName) {
  return content.match(new RegExp(`<${tagName}\\b[\\s\\S]*?</${tagName}>`, 'i'))?.[0] ?? '';
}

function findBrandAnchor(section) {
  return section.match(/<a\b(?=[^>]*\bclass=(?:"[^"]*\bbrand\b[^"]*"|'[^']*\bbrand\b[^']*'))[\s\S]*?<\/a>/i)?.[0] ?? '';
}

function findBrandLogoImg(section) {
  const brandAnchor = findBrandAnchor(section);
  if (!brandAnchor) return null;
  return brandAnchor.match(/<img\b[^>]*>/i)?.[0] ?? null;
}

function scanBrandLogoContract(content, label) {
  const failures = [];
  const headerSection = findElementSection(content, 'header');
  const headerLogoImg = findBrandLogoImg(headerSection);
  if (!headerLogoImg) {
    failures.push(`${label}: missing header brand logo markup`);
  } else {
    const srcFailure = assertSafeBrandLogoSrc(getAttribute(headerLogoImg, 'src'), `${label}: header brand logo`);
    if (srcFailure) failures.push(srcFailure);
  }

  const footerSection = findElementSection(content, 'footer');
  const footerBrandAnchor = findBrandAnchor(footerSection);
  if (footerBrandAnchor) {
    const footerLogoImg = footerBrandAnchor.match(/<img\b[^>]*>/i)?.[0] ?? null;
    if (!footerLogoImg) {
      failures.push(`${label}: missing footer brand logo markup`);
    } else {
      const srcFailure = assertSafeBrandLogoSrc(getAttribute(footerLogoImg, 'src'), `${label}: footer brand logo`);
      if (srcFailure) failures.push(srcFailure);
    }
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

  const brandFixtures = [
    { name: 'legacy logo', src: LEGACY_LOGO_PATH, valid: true },
    { name: 'site media logo', src: '/assets/site-media/2026/07/custom-logo.webp', valid: true },
    { name: 'empty logo src', src: '', valid: false },
    { name: 'https logo src', src: 'https://example.com/logo.png', valid: false },
    { name: 'protocol-relative logo src', src: '//example.com/logo.png', valid: false },
    { name: 'traversal logo src', src: '/assets/site-media/../logo.png', valid: false },
    { name: 'encoded backslash traversal logo src', src: '/assets/site-media/%5c..%5clogo.png', valid: false },
    { name: 'encoded parent logo src', src: '/assets/site-media/%2e%2e/logo.png', valid: false },
    { name: 'nested encoded parent logo src', src: '/assets/site-media/2026/%2e%2e/logo.png', valid: false },
  ];
  for (const { name, src, valid } of brandFixtures) {
    const html = `<header class="site-header"><a class="brand" href="/"><span class="brand-logo-frame"><img src="${src}" alt="Easylink" /></span></a></header><footer class="footer"><a class="brand" href="/"><img src="${src}" alt="Easylink" /></a></footer>`;
    const passed = scanBrandLogoContract(html, `self-test ${name}`).length === 0;
    if (passed !== valid) {
      console.error(`Markup smoke brand-logo self-test failed: ${name}`);
      process.exit(1);
    }
  }

  const headerFooterFixtures = [
    {
      name: 'empty header with valid footer brand logo',
      html: `<header class="site-header"></header><footer class="footer"><a class="brand" href="/"><img src="${LEGACY_LOGO_PATH}" alt="Easylink" /></a></footer>`,
      valid: false,
    },
    {
      name: 'header brand anchor without image followed by another image',
      html: `<header class="site-header"><a class="brand" href="/"></a><img src="${LEGACY_LOGO_PATH}" alt="Decorative" /></header>`,
      valid: false,
    },
    {
      name: 'valid header and valid footer brand logos',
      html: `<header class="site-header"><a class="brand" href="/"><img src="${LEGACY_LOGO_PATH}" alt="Easylink" /></a></header><footer class="footer"><a class="brand" href="/"><img src="/assets/site-media/2026/07/custom-logo.webp" alt="Easylink" /></a></footer>`,
      valid: true,
    },
    {
      name: 'valid header brand logo without footer',
      html: `<header class="site-header"><a class="brand" href="/"><img src="${LEGACY_LOGO_PATH}" alt="Easylink" /></a></header>`,
      valid: true,
    },
    {
      name: 'footer brand anchor without image',
      html: `<header class="site-header"><a class="brand" href="/"><img src="${LEGACY_LOGO_PATH}" alt="Easylink" /></a></header><footer class="footer"><a class="brand" href="/"></a></footer>`,
      valid: false,
    },
  ];
  for (const { name, html, valid } of headerFooterFixtures) {
    const passed = scanBrandLogoContract(html, `self-test ${name}`).length === 0;
    if (passed !== valid) {
      console.error(`Markup smoke brand-logo self-test failed: ${name}`);
      process.exit(1);
    }
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
    if (path.basename(file) === 'index.html') failures.push(...scanBrandLogoContract(content, file));
  }
  const allContent = combined.join('\n');
  for (const asset of NATI_HERO_ASSETS) {
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
      const content = await response.text();
      failures.push(...scanContent(content, url));
      failures.push(...scanBrandLogoContract(content, url));
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
