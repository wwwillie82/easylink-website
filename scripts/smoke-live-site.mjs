import { staticPagesData } from '../src/lib/content/static-seed-data.mjs';

const requiredContentRoutes = new Set(['/', '/megoldasaink/', '/kinek-szol/', '/integraciok/', '/arak/', '/kapcsolat/']);
const explicitRequiredRoutes = [...requiredContentRoutes];

function normalizeBaseUrl(value) {
  if (!value) throw new Error('Usage: node scripts/smoke-live-site.mjs "https://site-dev.easylink.hu"');
  return value.endsWith('/') ? value : `${value}/`;
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function decodeHtmlEntities(value) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return value
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
      if (entity[0] === '#') {
        const codePoint = entity[1]?.toLowerCase() === 'x' ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
      }
      return named[entity.toLowerCase()] ?? match;
    });
}

function normalizeHtmlForSearch(html) {
  return normalizeWhitespace(decodeHtmlEntities(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '));
}

function expected(field, value) {
  return { field, value: normalizeWhitespace(value) };
}

function representativeBody(body) {
  if (!body) return undefined;
  const sentence = body.split(/[.!?]/).map((part) => part.trim()).find((part) => part.length >= 24);
  return sentence ?? body.trim();
}

export function getPublishedSeedPages() {
  return staticPagesData.filter((page) => page.status === 'published').sort((a, b) => a.sortOrder - b.sortOrder);
}

export function buildLiveSmokePlan() {
  const pages = getPublishedSeedPages();
  const routeSet = new Set(pages.map((page) => page.route));
  for (const route of explicitRequiredRoutes) routeSet.add(route);

  const contentChecks = [
    { route: '/', checks: [
      expected('home.hero.title', 'easyLink ERP'),
      expected('home.hero.subtitle', 'Cégvezetés, könnyedén.'),
      expected('home.hero.secondaryCta', 'Próbáld ki ingyen'),
      expected('home.hero.primaryCta', 'Demót kérek'),
      expected('home.hero.benefit', 'Átlátható működés'),
    ] },
    { route: '/megoldasaink/', checks: [expected('solutions.heading', 'Megoldásaink'), expected('solutions.card', 'Pénzügy és számlázás')] },
    { route: '/kinek-szol/', checks: [expected('audiences.heading', 'Kinek szól?'), expected('audiences.card', 'Hoteleknek és szálláshelyeknek')] },
    { route: '/integraciok/', checks: [expected('integrations.heading', 'Csomópontok'), expected('integrations.card', 'NAV Online Számla')] },
    { route: '/arak/', checks: [expected('pricing.grid', 'Mitől függhet az ár?'), expected('pricing.cta', 'Demó alapján pontosítunk')] },
    { route: '/kapcsolat/', checks: [expected('contact.grid', 'Miben tudunk segíteni?'), expected('contact.demo', 'Demót kérek')] },
  ];

  return { routes: [...routeSet].sort(), contentChecks };
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, { redirect: 'manual', signal: controller.signal });
    const text = await response.text().catch(() => '');
    return { response, text };
  } finally {
    clearTimeout(timeout);
  }
}


function countMatches(value, pattern) {
  return (value.match(pattern) || []).length;
}

function assertPageCtaMarkup(route, html, failures) {
  if (!['/', '/arak/', '/kapcsolat/'].includes(route)) return;
  const ctaSections = countMatches(html, /<section\b[^>]*class=["'][^"']*\bcta\b[^"']*["'][^>]*>/gi);
  if (ctaSections !== 1) failures.push(`${route}: expected exactly one page CTA section, got ${ctaSections}`);
  if (!/data-easylink-cta-id=["']cta-section-primary["']/i.test(html)) failures.push(`${route}: missing page CTA primary tracking markup`);
  if (!/data-easylink-cta-id=["']cta-section-secondary["']/i.test(html)) failures.push(`${route}: missing page CTA secondary tracking markup`);
  if (route === '/arak/' && /content-card type-cta|type-cta content-card|Felhívás/i.test(html)) failures.push('/arak/: pricing page CTA must not render as generic ContentBlocks type-cta card');
}

function assertContains(normalizedHtml, route, check, failures) {
  if (!normalizedHtml.includes(check.value)) {
    failures.push(`${route}: missing expected content from ${check.field}: ${check.value}`);
  }
}

async function run(baseUrl) {
  const { routes, contentChecks } = buildLiveSmokePlan();
  const failures = [];

  for (const route of routes) {
    const url = new URL(route, baseUrl).toString();
    try {
      const { response } = await fetchText(url);
      if (response.status !== 200) failures.push(`${route}: expected HTTP 200, got HTTP ${response.status}`);
    } catch (error) {
      failures.push(`${route}: request failed: ${error.message}`);
    }
  }

  const robotsUrl = new URL('/robots.txt', baseUrl).toString();
  try {
    const { response, text } = await fetchText(robotsUrl);
    if (response.status !== 200) failures.push(`/robots.txt: expected HTTP 200, got HTTP ${response.status}`);
    if (!text.includes('Disallow: /')) failures.push('/robots.txt: missing expected content from robots.disallow: Disallow: /');
  } catch (error) {
    failures.push(`/robots.txt: request failed: ${error.message}`);
  }

  for (const { route, checks } of contentChecks) {
    const url = new URL(route, baseUrl).toString();
    try {
      const { response, text } = await fetchText(url);
      if (response.status !== 200) continue;
      const rawHtml = decodeHtmlEntities(text);
      if (!/<meta\s+[^>]*name=["']robots["'][^>]*content=["']noindex,nofollow["']/i.test(rawHtml)) {
        failures.push(`${route}: missing expected content from layout.meta.robots: noindex,nofollow`);
      }
      assertPageCtaMarkup(route, rawHtml, failures);
      const normalizedHtml = normalizeHtmlForSearch(text);
      for (const check of checks) assertContains(normalizedHtml, route, check, failures);
    } catch (error) {
      failures.push(`${route}: content request failed: ${error.message}`);
    }
  }

  if (failures.length > 0) {
    console.error('Live site smoke failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log(`Live site smoke passed for ${baseUrl}`);
  console.log(`HTTP routes checked: ${routes.join(', ')}`);
  console.log(`Content routes checked: ${contentChecks.map(({ route }) => route).join(', ')}`);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) await run(normalizeBaseUrl(process.argv[2]));
