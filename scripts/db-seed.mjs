import { createPool } from '../src/lib/db/client.mjs';
import { staticPagesData, staticNavigationData } from '../src/lib/content/static-seed-data.mjs';
const dryRun = process.argv.includes('--dry-run');
const pages = staticPagesData;
const nav = staticNavigationData;
const blockCount = pages.reduce((sum, page) => sum + (page.blocks?.length || 0), 0);
if (dryRun) { console.log(`Seed dry-run: ${pages.length} pages, ${blockCount} blocks, ${nav.length} navigation items. Upsert keys: route/href/page+block_key.`); process.exit(0); }
const pool = await createPool();
for (const page of pages) {
  await pool.execute(`INSERT INTO site_pages (route, slug, type, title, seo_title, seo_description, hero_eyebrow, hero_title, hero_description, hero_asset, status, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE slug=VALUES(slug), type=VALUES(type), title=VALUES(title), seo_title=VALUES(seo_title), seo_description=VALUES(seo_description), hero_eyebrow=VALUES(hero_eyebrow), hero_title=VALUES(hero_title), hero_description=VALUES(hero_description), hero_asset=VALUES(hero_asset), status=VALUES(status), sort_order=VALUES(sort_order)`, [page.route, page.slug, page.type, page.title, page.seoTitle, page.seoDescription, page.heroEyebrow, page.heroTitle, page.heroDescription, page.heroAsset, page.status, page.sortOrder]);
  const [pageRows] = await pool.query('SELECT id FROM site_pages WHERE route=? LIMIT 1', [page.route]);
  const pageId = pageRows[0]?.id ?? pageRows[0]?.col0;
  for (const [index, block] of (page.blocks || []).entries()) {
    const key = `${page.route}:${block.type}:${index}`;
    await pool.execute(`INSERT INTO site_content_blocks (page_id, block_key, type, title, body, items, sort_order, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'published') ON DUPLICATE KEY UPDATE type=VALUES(type), title=VALUES(title), body=VALUES(body), items=VALUES(items), sort_order=VALUES(sort_order), status=VALUES(status)`, [pageId, key, block.type, block.title, block.body || null, JSON.stringify(block.items || null), index + 1]);
  }
}
for (const item of nav) await pool.execute(`INSERT INTO site_navigation_items (title, href, sort_order, status) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE title=VALUES(title), sort_order=VALUES(sort_order), status=VALUES(status)`, [item.title, item.href, item.sortOrder, item.status]);
await pool.end();
console.log(`Seed completed: ${pages.length} pages, ${blockCount} blocks, ${nav.length} navigation items.`);
