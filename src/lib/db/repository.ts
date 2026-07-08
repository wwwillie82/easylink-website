import type { ContentBlock } from '@/content/types';
import type { SitePage } from '@/lib/content/static';

type Pool = { query(sql: string, params?: unknown[]): Promise<[any[], unknown]>; execute(sql: string, params?: unknown[]): Promise<[any, unknown]>; end?: () => Promise<void> };

const parseItems = (value: unknown) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.length > 0) return JSON.parse(value);
  return undefined;
};

export function mapPageRow(row: any, blocks: any[] = []): SitePage {
  return {
    id: row.id,
    route: row.route,
    slug: row.slug,
    type: row.type,
    title: row.title,
    seoTitle: row.seo_title ?? row.title,
    seoDescription: row.seo_description ?? '',
    heroEyebrow: row.hero_eyebrow ?? '',
    heroTitle: row.hero_title ?? row.title,
    heroDescription: row.hero_description ?? '',
    heroAsset: row.hero_asset ?? '',
    status: row.status,
    sortOrder: row.sort_order ?? 0,
    blocks: blocks.map((block) => ({ type: block.type, title: block.title, body: block.body ?? undefined, items: parseItems(block.items) } as ContentBlock)),
  };
}

export function createContentRepository(pool: Pool) {
  return {
    async getPageByRoute(route: string) {
      const [rows] = await pool.query('SELECT * FROM site_pages WHERE route = ? AND status = ? LIMIT 1', [route, 'published']);
      const page = rows[0];
      if (!page) return null;
      const [blocks] = await pool.query('SELECT * FROM site_content_blocks WHERE page_id = ? AND status = ? ORDER BY sort_order ASC, id ASC', [page.id, 'published']);
      return mapPageRow(page, blocks);
    },
    async listNavigation() {
      const [rows] = await pool.query('SELECT title, href, sort_order AS sortOrder, status FROM site_navigation_items WHERE status = ? ORDER BY sort_order ASC, id ASC', ['published']);
      return rows;
    },
  };
}

export async function createMariaDbContentRepository() {
  const mod = await import('./client.mjs');
  const pool = (await mod.createPool()) as unknown as Pool;
  return createContentRepository(pool);
}
