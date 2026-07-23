import { createAdminRepository as createBaseAdminRepository } from './repository.mjs';

function navigationDeleteError(code, message, details) {
  const error = new Error(message);
  error.code = code;
  error.status = 409;
  if (details) error.details = details;
  return error;
}

export function createAdminRepository(pool) {
  const repo = createBaseAdminRepository(pool);
  return {
    ...repo,
    async deleteNavigationItem(rawId) {
      const id = Number(rawId);
      if (!Number.isSafeInteger(id) || id < 1) return null;
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [items] = await conn.query('SELECT * FROM site_navigation_items WHERE id=? LIMIT 1 FOR UPDATE', [id]);
        const item = items[0] || null;
        if (!item) {
          await conn.commit();
          return null;
        }
        const [children] = await conn.query('SELECT id,title FROM site_navigation_items WHERE parent_id=? ORDER BY sort_order,id LIMIT 1 FOR UPDATE', [id]);
        if (children[0]) throw navigationDeleteError('NAVIGATION_ITEM_HAS_CHILDREN', 'A menüpont nem törölhető, amíg gyermek menüpont tartozik alá.', { childId: Number(children[0].id), childTitle: children[0].title || '' });
        const [result] = await conn.execute('DELETE FROM site_navigation_items WHERE id=?', [id]);
        if (Number(result.affectedRows || 0) !== 1) throw new Error(`Navigation delete failed: ${id}`);
        await conn.commit();
        return item;
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
    },
  };
}
