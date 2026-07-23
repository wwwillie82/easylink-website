import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseSiteSettingsRows } from '../admin/settings.mjs';
import { CTA_SECTION_ROLE, PRICING_CTA_ROLE } from './cta-contract.mjs';
import { HOME_LEGACY_CTA_ROLE, resolvePageCtaBlock } from './page-cta-contract.mjs';

export const PUBLIC_SMOKE_METADATA_PATH = '/smoke-live-metadata.json';

export function publicRendererPageCtaRole(page = {}) {
  if (page.route === '/' || page.type === 'home') return HOME_LEGACY_CTA_ROLE;
  if (page.route === '/arak/' || page.type === 'pricing') return PRICING_CTA_ROLE;
  return CTA_SECTION_ROLE;
}

function minimalCtaBlock(block) {
  if (!block) return null;
  return {
    block_key: block.block_key ?? block.blockKey ?? '',
    type: block.type ?? 'cta',
    title: block.title ?? '',
    body: block.body ?? '',
    items: block.items ?? [],
    status: block.status ?? 'published',
  };
}

function smokeText(value) {
  return String(value ?? '').trim();
}

function pageSmokeContent(page = {}) {
  return {
    heroTitle: smokeText(page.hero_title ?? page.heroTitle ?? page.title),
    heroDescription: smokeText(page.hero_description ?? page.heroDescription),
  };
}

export function buildPublicSmokeMetadataFromSnapshot(content = {}) {
  const settings = parseSiteSettingsRows(content.settings || []);
  const blocksByPageId = new Map();
  for (const block of content.blocks || []) {
    const pageId = Number(block.page_id ?? block.pageId ?? 0);
    if (!pageId) continue;
    if (!blocksByPageId.has(pageId)) blocksByPageId.set(pageId, []);
    blocksByPageId.get(pageId).push(block);
  }
  const pages = (content.pages || [])
    .filter((page) => page.status === undefined || page.status === 'published')
    .map((page) => {
      const role = publicRendererPageCtaRole(page);
      const blocks = blocksByPageId.get(Number(page.id ?? 0)) || page.blocks || [];
      const ctaBlock = resolvePageCtaBlock(blocks, { role });
      return {
        route: page.route,
        type: page.type,
        ctaRole: role,
        ctaBlock: minimalCtaBlock(ctaBlock),
        smokeContent: pageSmokeContent(page),
      };
    });
  return { version: 2, source: 'admin-publish-snapshot', defaultCta: settings.defaultCta, pages };
}

export async function writePublicSmokeMetadata(releasePath, content) {
  const target = path.join(releasePath, PUBLIC_SMOKE_METADATA_PATH.replace(/^\//, ''));
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(buildPublicSmokeMetadataFromSnapshot(content))}\n`);
  return target;
}
