import { createAdminRepository as createBaseAdminRepository } from './repository-navigation-delete.mjs';

const pageIdKeys = new Set(['target_page_id', 'targetPageId']);
const routeKeys = new Set(['url', 'href', 'primaryUrl', 'secondaryUrl', 'primary_url', 'secondary_url']);

function pageDeleteError(code, message, details) {
  const error = new Error(message);
  error.code = code;
  error.status = 409;
  if (details) error.details = details;
  return error;
}

function normalizeInternalRoute(value) {
  const raw = String(value ?? '').trim();
  if (!raw.startsWith('/')) return raw;
  return raw === '/' || raw.endsWith('/') ? raw : `${raw}/`;
}

function parseJson(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return null; }
}

export function findPageReferences(value, { pageId, route }, path = '$', found = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findPageReferences(item, { pageId, route }, `${path}[${index}]`, found));
    return found;
  }
  if (!value || typeof value !== 'object') return found;
  for (const [key, entry] of Object.entries(value)) {
    const nextPath = `${path}.${key}`;
    if (pageIdKeys.has(key) && Number(entry) === Number(pageId)) found.push({ kind: 'page_id', path: nextPath });
    if (routeKeys.has(key) && normalizeInternalRoute(entry) === normalizeInternalRoute(route)) found.push({ kind: 'route', path: nextPath });
    findPageReferences(entry, { pageId, route }, nextPath, found);
  }
  return found;
}

function navigationLabel(row = {}) {
  return String(row.title_override || row.title || `#${row.id || '?'}`);
}

function blockLabel(row = {}) {
  return `${row.page_title || `Oldal #${row.page_id}`} / ${row.title || row.block_key || `blokk #${row.id}`}`;
}

function buildBlockedMessage({ navigationUsages, activeBlocks, contentReferences, settingReferences }) {
  const parts = [];
  if (navigationUsages.length) {
    parts.push(`Menüpont hivatkozik az oldalra: ${navigationUsages.map(navigationLabel).join(', ')}. Előbb töröld vagy állítsd át ezeket a menüpontokat a Menü adminban.`);
  }
  if (activeBlocks.length > 1) {
    parts.push(`Az oldal ${activeBlocks.length} nem archivált tartalmi blokkot tartalmaz. Archiváld a felesleges blokkokat úgy, hogy legfeljebb egy nem archivált blokk maradjon.`);
  }
  if (contentReferences.length || settingReferences.length) {
    const labels = [
      ...contentReferences.map((usage) => blockLabel(usage)),
      ...settingReferences.map((usage) => `Alapadatok / ${usage.key}`),
    ];
    parts.push(`Más aktív tartalom hivatkozik az oldalra: ${labels.join(', ')}. Előbb szüntesd meg ezeket a hivatkozásokat, vagy archiváld az érintett tartalmi blokkot.`);
  }
  return `Az oldal nem törölhető. ${parts.join(' ')}`;
}

export function createAdminRepository(pool) {
  const repo = createBaseAdminRepository(pool);
  return {
    ...repo,
    async deletePage(rawId) {
      const id = Number(rawId);
      if (!Number.isSafeInteger(id) || id < 1) return null;
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [pageRows] = await conn.query('SELECT * FROM site_pages WHERE id=? LIMIT 1 FOR UPDATE', [id]);
        const page = pageRows[0] || null;
        if (!page) {
          await conn.commit();
          return null;
        }
        if (String(page.route) === '/' || String(page.type) === 'home') {
          throw pageDeleteError('PAGE_DELETE_HOME_PROTECTED', 'A főoldal nem törölhető.', { pageId: id, route: page.route });
        }

        const [navigationUsages] = await conn.query(
          "SELECT id,title,title_override,status,target_type,target_page_id FROM site_navigation_items WHERE target_type='page' AND target_page_id=? ORDER BY id FOR UPDATE",
          [id],
        );
        const [ownBlocks] = await conn.query(
          'SELECT id,page_id,block_key,title,status FROM site_content_blocks WHERE page_id=? ORDER BY sort_order,id FOR UPDATE',
          [id],
        );
        const activeBlocks = ownBlocks.filter((block) => String(block.status) !== 'archived');

        const [candidateBlocks] = await conn.query(
          "SELECT b.id,b.page_id,b.block_key,b.title,b.status,b.items,p.title AS page_title FROM site_content_blocks b JOIN site_pages p ON p.id=b.page_id WHERE b.page_id<>? AND b.status<>'archived' AND b.items IS NOT NULL ORDER BY b.id FOR UPDATE",
          [id],
        );
        const contentReferences = [];
        for (const block of candidateBlocks) {
          const references = findPageReferences(parseJson(block.items), { pageId: id, route: page.route });
          if (references.length) contentReferences.push({ ...block, references });
        }

        const [settingRows] = await conn.query('SELECT `key`,`value` FROM site_settings ORDER BY `key` FOR UPDATE');
        const settingReferences = [];
        for (const setting of settingRows) {
          const references = findPageReferences(parseJson(setting.value), { pageId: id, route: page.route });
          if (references.length) settingReferences.push({ key: setting.key, references });
        }

        if (navigationUsages.length || activeBlocks.length > 1 || contentReferences.length || settingReferences.length) {
          const details = {
            pageId: id,
            navigationUsages: navigationUsages.map((row) => ({ id: Number(row.id), title: navigationLabel(row), status: row.status })),
            activeBlocks: activeBlocks.map((row) => ({ id: Number(row.id), title: row.title || row.block_key, status: row.status })),
            contentReferences: contentReferences.map((row) => ({ id: Number(row.id), pageId: Number(row.page_id), pageTitle: row.page_title, title: row.title || row.block_key, references: row.references })),
            settingReferences,
          };
          throw pageDeleteError('PAGE_DELETE_BLOCKED', buildBlockedMessage({ navigationUsages, activeBlocks, contentReferences, settingReferences }), details);
        }

        const [result] = await conn.execute('DELETE FROM site_pages WHERE id=?', [id]);
        if (Number(result.affectedRows || 0) !== 1) throw new Error(`Page delete failed: ${id}`);
        await conn.commit();
        return { ...page, deletedBlockCount: ownBlocks.length };
      } catch (error) {
        await conn.rollback();
        throw error;
      } finally {
        conn.release();
      }
    },
  };
}
