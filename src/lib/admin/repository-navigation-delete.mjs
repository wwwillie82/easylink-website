import { createAdminRepository as createBaseAdminRepository } from './repository.mjs';
import { validateNavigationHierarchy } from '../content/navigation-hierarchy.mjs';

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
        const [navigation] = await conn.query('SELECT * FROM site_navigation_items ORDER BY id FOR UPDATE');
        const item = navigation.find((row) => Number(row.id) === id) || null;
        if (!item) {
          await conn.commit();
          return null;
        }
        const child = navigation.find((row) => Number(row.parent_id) === id);
        if (child) throw navigationDeleteError('NAVIGATION_ITEM_HAS_CHILDREN', 'A menüpont nem törölhető, amíg gyermek menüpont tartozik alá.', { childId: Number(child.id), childTitle: child.title || '' });
        const [pages] = await conn.query('SELECT id,status FROM site_pages ORDER BY id FOR UPDATE');
        const pagesById = new Map((pages || []).map((page) => [Number(page.id), page]));
        const planned = navigation.filter((row) => Number(row.id) !== id).map((row) => ({ ...row, parent_ref: row.parent_id ? `id:${row.parent_id}` : null }));
        const hierarchy = validateNavigationHierarchy(planned, { pagesById });
        if (!hierarchy.ok) {
          const publishedEmptyGroup = hierarchy.errors.find((error) => error.code === 'NAVIGATION_PUBLISHED_EMPTY_GROUP');
          const hierarchyCode = publishedEmptyGroup?.code || hierarchy.errors[0]?.code || 'INVALID_NAVIGATION_HIERARCHY';
          const message = publishedEmptyGroup
            ? 'A menüpont nem törölhető, mert a szülőcsoport egyetlen látható gyermeke. Előbb archiváld ezt a menüpontot és a szülőcsoportot, majd mentsd és élesítsd a módosítást. Ezután töröld először a gyermek menüpontot, végül az üres szülőcsoportot.'
            : 'A menüpont törlése érvénytelen menühierarchiát hozna létre. Előbb archiváld vagy rendezd át az érintett menüágat.';
          throw navigationDeleteError('NAVIGATION_DELETE_INVALID_HIERARCHY', message, { hierarchyCode });
        }
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
