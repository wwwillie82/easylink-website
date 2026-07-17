import type { ContentBlock } from '@/content/types';
import type { SitePage } from '@/lib/content/static';
import { safeParseVideoConfig } from '@/lib/content/video.mjs';
import { resolveNavigationItem } from '@/lib/content/internal-links.mjs';

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
    heroVideo: safeParseVideoConfig(row.hero_video, { context: 'hero' }) ?? undefined,
    heroHeight: row.hero_height ?? undefined,
    heroImageFit: row.hero_image_fit ?? undefined,
    heroImagePositionX: row.hero_image_position_x ?? undefined,
    heroImagePositionY: row.hero_image_position_y ?? undefined,
    heroImagePositionMobileX: row.hero_image_position_mobile_x ?? undefined,
    heroImagePositionMobileY: row.hero_image_position_mobile_y ?? undefined,
    heroOverlayStrength: row.hero_overlay_strength ?? undefined,
    heroImageScale: row.hero_image_scale ?? undefined,
    status: row.status,
    sortOrder: row.sort_order ?? 0,
    blocks: blocks.map((block) => ({ blockKey: block.block_key, type: block.type, title: block.title, body: block.body ?? undefined, items: parseItems(block.items) } as ContentBlock)),
  };
}

export function createContentRepository(pool: Pool) {
  return {
    async getPageByRouteAny(route: string) {
      const [rows] = await pool.query('SELECT * FROM site_pages WHERE route = ? LIMIT 1', [route]);
      const page = rows[0];
      if (!page) return null;
      const [blocks] = await pool.query('SELECT * FROM site_content_blocks WHERE page_id = ? AND status = ? ORDER BY sort_order ASC, id ASC', [page.id, 'published']);
      return mapPageRow(page, blocks);
    },
    async getPageByRoute(route: string) {
      const page = await this.getPageByRouteAny(route);
      return page?.status === 'published' ? page : null;
    },
    async listContentPages() {
      const [pages] = await pool.query('SELECT * FROM site_pages WHERE status = ? AND type = ? ORDER BY sort_order ASC, id ASC', ['published', 'content_page']);
      const result = [];
      for (const page of pages) {
        const [blocks] = await pool.query('SELECT * FROM site_content_blocks WHERE page_id = ? AND status = ? ORDER BY sort_order ASC, id ASC', [page.id, 'published']);
        result.push(mapPageRow(page, blocks));
      }
      return result;
    },
    async listNavigation() {
      const [rows] = await pool.query(`SELECT n.title, n.href, n.target_type, n.target_page_id, n.title_override, n.sort_order AS sortOrder, n.status, p.route AS target_route, p.title AS target_title FROM site_navigation_items n LEFT JOIN site_pages p ON p.id = n.target_page_id WHERE n.status = ? ORDER BY n.sort_order ASC, n.id ASC`, ['published']);
      return rows.map((row) => resolveNavigationItem(row, (row.target_page_id && row.target_route ? { id: row.target_page_id, route: row.target_route, title: row.target_title } : null) as any));
    },
  };
}

export async function createMariaDbContentRepository() {
  const mod = await import('./client.mjs');
  const pool = (await mod.createPool()) as unknown as Pool;
  return createContentRepository(pool);
}
