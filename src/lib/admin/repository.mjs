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
    async exportContentSnapshot() {
      const [pages] = await pool.query('SELECT * FROM site_pages ORDER BY id');
      const [blocks] = await pool.query('SELECT * FROM site_content_blocks ORDER BY id');
      const [navigation] = await pool.query('SELECT * FROM site_navigation_items ORDER BY id');
      const [settings] = await pool.query('SELECT * FROM site_settings ORDER BY `key`');
      const [media] = await pool.query('SELECT * FROM site_media_assets ORDER BY id');
      return { pages, blocks, navigation, settings, media };
    },
    async importContentSnapshot(content) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query('DELETE FROM site_content_blocks');
        await conn.query('DELETE FROM site_pages');
        await conn.query('DELETE FROM site_navigation_items');
        await conn.query('DELETE FROM site_settings');
        await conn.query('DELETE FROM site_media_assets');
        for (const p of content.pages || []) await conn.query('INSERT INTO site_pages SET ?', [p]);
        for (const b of content.blocks || []) await conn.query('INSERT INTO site_content_blocks SET ?', [b]);
        for (const n of content.navigation || []) await conn.query('INSERT INTO site_navigation_items SET ?', [n]);
        for (const st of content.settings || []) await conn.query('INSERT INTO site_settings SET ?', [st]);
        for (const m of content.media || []) await conn.query('INSERT INTO site_media_assets SET ?', [m]);
        await conn.commit();
      } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
    },
    async createPublishSnapshot(snapshot) { const [r] = await pool.execute('INSERT INTO site_publish_snapshots (created_by_admin_id,label,content_json,content_hash,status) VALUES (?,?,?,?,?)', [snapshot.created_by_admin_id, snapshot.label, JSON.stringify(snapshot.content_json), snapshot.content_hash, snapshot.status]); return r.insertId; },
    async markPublishStarted(id) { await pool.execute('UPDATE site_publish_snapshots SET build_started_at=CURRENT_TIMESTAMP WHERE id=?', [id]); },
    async markPublishFinished(id, p) { if (p.status === 'success') await pool.execute('UPDATE site_publish_snapshots SET is_current=0 WHERE status=\'success\''); await pool.execute('UPDATE site_publish_snapshots SET status=?, build_finished_at=CURRENT_TIMESTAMP, build_log_excerpt=?, release_path=?, is_current=? WHERE id=?', [p.status, p.build_log_excerpt || null, p.release_path || null, p.status === 'success' ? 1 : 0, id]); },
    async prunePublishSnapshots(limit = 20) { await pool.execute('DELETE FROM site_publish_snapshots WHERE status=\'success\' AND id NOT IN (SELECT id FROM (SELECT id FROM site_publish_snapshots WHERE status=\'success\' ORDER BY created_at DESC, id DESC LIMIT ?) keepers)', [limit]); },
    async publishSnapshots(limit = 20) { const [r] = await pool.query('SELECT id, created_at, created_by_admin_id, label, content_hash, status, build_started_at, build_finished_at, build_log_excerpt, release_path, is_current FROM site_publish_snapshots WHERE status=\'success\' ORDER BY created_at DESC, id DESC LIMIT ?', [limit]); return r; },
    async publishStatus() { const [success] = await pool.query('SELECT id, created_at, content_hash, is_current FROM site_publish_snapshots WHERE status=\'success\' ORDER BY created_at DESC, id DESC LIMIT 1'); const [failed] = await pool.query('SELECT id, build_finished_at, build_log_excerpt FROM site_publish_snapshots WHERE status=\'failed\' ORDER BY created_at DESC, id DESC LIMIT 1'); return { lastSuccess: success[0] || null, lastError: failed[0] || null }; },
    async publishSnapshot(id) { const [r] = await pool.query('SELECT * FROM site_publish_snapshots WHERE id=? AND status=\'success\' LIMIT 1', [id]); if (!r[0]) return null; return { ...r[0], content_json: typeof r[0].content_json === 'string' ? JSON.parse(r[0].content_json) : r[0].content_json }; },
  };
}
