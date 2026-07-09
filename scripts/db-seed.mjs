import { fileURLToPath } from 'node:url';
import { createPool } from '../src/lib/db/client.mjs';
import { staticPagesData, staticNavigationData } from '../src/lib/content/static-seed-data.mjs';

export const seedBlockKey = (page, block, index) => `${page.route}:${block.type}:${index}`;
export function staleSeedKeys(existingBlocks, currentKeys, route) {
  const keep = new Set(currentKeys);
  return existingBlocks
    .filter((block) => String(block.block_key || '').startsWith(`${route}:`))
    .filter((block) => !String(block.block_key || '').startsWith('manual:'))
    .filter((block) => !keep.has(block.block_key))
    .map((block) => block.block_key);
}

export async function seedContent({ pool, pages = staticPagesData, nav = staticNavigationData, dryRun = false, log = console.log } = {}) {
  const blockCount = pages.reduce((sum, page) => sum + (page.blocks?.length || 0), 0);
  if (dryRun) {
    log(`Seed dry-run: ${pages.length} pages, ${blockCount} blocks, ${nav.length} navigation items. Upsert keys: route/href/page+block_key. Stale seed block cleanup: archive route-prefixed seed blocks not present in current seed; manual:* blocks are preserved.`);
    return { pages: pages.length, blocks: blockCount, navigation: nav.length, archivedStaleSeedBlocks: 0 };
  }
  let archivedStaleSeedBlocks = 0;
  for (const page of pages) {
    await pool.execute(`INSERT INTO site_pages (route, slug, type, title, seo_title, seo_description, hero_eyebrow, hero_title, hero_description, hero_asset, status, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE slug=VALUES(slug), type=VALUES(type), title=VALUES(title), seo_title=VALUES(seo_title), seo_description=VALUES(seo_description), hero_eyebrow=VALUES(hero_eyebrow), hero_title=VALUES(hero_title), hero_description=VALUES(hero_description), hero_asset=VALUES(hero_asset), status=VALUES(status), sort_order=VALUES(sort_order)`, [page.route, page.slug, page.type, page.title, page.seoTitle, page.seoDescription, page.heroEyebrow, page.heroTitle, page.heroDescription, page.heroAsset, page.status, page.sortOrder]);
    const [pageRows] = await pool.query('SELECT id FROM site_pages WHERE route=? LIMIT 1', [page.route]);
    const pageId = pageRows[0]?.id ?? pageRows[0]?.col0;
    const currentKeys = [];
    for (const [index, block] of (page.blocks || []).entries()) {
      const key = seedBlockKey(page, block, index);
      currentKeys.push(key);
      await pool.execute(`INSERT INTO site_content_blocks (page_id, block_key, type, title, body, items, sort_order, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'published') ON DUPLICATE KEY UPDATE type=VALUES(type), title=VALUES(title), body=VALUES(body), items=VALUES(items), sort_order=VALUES(sort_order), status=VALUES(status)`, [pageId, key, block.type, block.title, block.body || null, JSON.stringify(block.items || null), index + 1]);
    }
    const [existingBlocks] = await pool.query('SELECT block_key FROM site_content_blocks WHERE page_id=? AND block_key LIKE ?', [pageId, `${page.route}:%`]);
    const staleKeys = staleSeedKeys(existingBlocks, currentKeys, page.route);
    for (const key of staleKeys) {
      const [result] = await pool.execute('UPDATE site_content_blocks SET status=? WHERE page_id=? AND block_key=? AND block_key NOT LIKE ?', ['archived', pageId, key, 'manual:%']);
      archivedStaleSeedBlocks += Number(result.affectedRows || 0);
    }
  }
  for (const item of nav) await pool.execute(`INSERT INTO site_navigation_items (title, href, sort_order, status) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE title=VALUES(title), sort_order=VALUES(sort_order), status=VALUES(status)`, [item.title, item.href, item.sortOrder, item.status]);
  log(`Seed completed: ${pages.length} pages, ${blockCount} blocks, ${nav.length} navigation items. Archived stale seed blocks: ${archivedStaleSeedBlocks}.`);
  return { pages: pages.length, blocks: blockCount, navigation: nav.length, archivedStaleSeedBlocks };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) await seedContent({ dryRun });
  else {
    const pool = await createPool();
    try { await seedContent({ pool }); }
    finally { await pool.end(); }
  }
}
