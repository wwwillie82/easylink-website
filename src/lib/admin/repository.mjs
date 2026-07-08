import crypto from 'node:crypto';
import { parseJsonItems } from './validation.mjs';

export function createAdminRepository(pool) {
  return {
    async findAdminUserByEmail(email) { const [r] = await pool.query('SELECT * FROM site_admin_users WHERE email=? LIMIT 1', [email]); return r[0] || null; },
    async markAdminLogin(id) { await pool.execute('UPDATE site_admin_users SET last_login_at=CURRENT_TIMESTAMP WHERE id=?', [id]); },
    async pages() { const [r] = await pool.query('SELECT id, route, slug, type, title, status, sort_order FROM site_pages ORDER BY sort_order, id'); return r; },
    async page(id) { const [p] = await pool.query('SELECT * FROM site_pages WHERE id=?', [id]); if (!p[0]) return null; const [b] = await pool.query('SELECT * FROM site_content_blocks WHERE page_id=? ORDER BY sort_order,id', [id]); return { page: p[0], blocks: b }; },
    async updatePage(id, p) { await pool.execute('UPDATE site_pages SET title=?, seo_title=?, seo_description=?, hero_eyebrow=?, hero_title=?, hero_description=?, hero_asset=?, status=?, sort_order=? WHERE id=?', [p.title, p.seo_title, p.seo_description, p.hero_eyebrow, p.hero_title, p.hero_description, p.hero_asset, p.status, Number(p.sort_order || 0), id]); },
    async upsertBlock(p) {
      const items = parseJsonItems(p.items);
      if (p.id) {
        await pool.execute('UPDATE site_content_blocks SET type=?, title=?, body=?, items=?, sort_order=?, status=? WHERE id=?', [p.type, p.title, p.body, JSON.stringify(items), Number(p.sort_order || 0), p.status, p.id]);
        return { id: p.id };
      }
      const blockKey = p.block_key || `manual:${crypto.randomUUID()}`;
      await pool.execute('INSERT INTO site_content_blocks (page_id, block_key, type, title, body, items, sort_order, status) VALUES (?,?,?,?,?,?,?,?)', [p.page_id, blockKey, p.type, p.title, p.body, JSON.stringify(items), Number(p.sort_order || 0), p.status]);
      return { block_key: blockKey };
    },
    async deleteBlock(id) { await pool.execute('UPDATE site_content_blocks SET status=? WHERE id=?', ['archived', id]); },
    async nav() { const [r] = await pool.query('SELECT * FROM site_navigation_items ORDER BY sort_order,id'); return r; },
    async updateNav(items) { for (const item of items) { const [existing] = await pool.query('SELECT id FROM site_navigation_items WHERE id=? LIMIT 1', [item.id]); if (!existing[0]) throw new Error(`Navigation item not found: ${item.id}`); await pool.execute('UPDATE site_navigation_items SET title=?, href=?, sort_order=?, status=? WHERE id=?', [item.title, item.href, Number(item.sort_order || 0), item.status, item.id]); } },
  };
}
