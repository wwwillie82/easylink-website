import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAdminRepository, findPageReferences } from '../src/lib/admin/repository-page-delete.mjs';
import { pageDeleteClientScript, pageForm, pagesTable } from '../src/lib/admin/render/pages-delete.mjs';

function pageDeletePool({ page, navigation = [], ownBlocks = [], candidateBlocks = [], settings = [] } = {}) {
  const state = {
    page: page ? { ...page } : null,
    navigation: navigation.map((row) => ({ ...row })),
    ownBlocks: ownBlocks.map((row) => ({ ...row })),
    candidateBlocks: candidateBlocks.map((row) => ({ ...row })),
    settings: settings.map((row) => ({ ...row })),
    commits: 0,
    rollbacks: 0,
    deletes: [],
  };
  const conn = {
    async beginTransaction() {},
    async commit() { state.commits += 1; },
    async rollback() { state.rollbacks += 1; },
    release() {},
    async query(sql) {
      const text = String(sql);
      if (text.startsWith('SELECT * FROM site_pages WHERE id=')) return [[state.page].filter(Boolean), null];
      if (text.includes("FROM site_navigation_items WHERE target_type='page'")) return [state.navigation.map((row) => ({ ...row })), null];
      if (text.startsWith('SELECT id,page_id,block_key,title,status FROM site_content_blocks WHERE page_id=')) return [state.ownBlocks.map((row) => ({ ...row })), null];
      if (text.includes('FROM site_content_blocks b JOIN site_pages p')) return [state.candidateBlocks.map((row) => ({ ...row })), null];
      if (text.startsWith('SELECT `key`,`value` FROM site_settings')) return [state.settings.map((row) => ({ ...row })), null];
      throw new Error(`Unexpected query: ${text}`);
    },
    async execute(sql, params = []) {
      const text = String(sql);
      if (text.startsWith('DELETE FROM site_pages WHERE id=')) {
        const id = Number(params[0]);
        const affectedRows = state.page && Number(state.page.id) === id ? 1 : 0;
        if (affectedRows) state.page = null;
        state.deletes.push(id);
        return [{ affectedRows }, null];
      }
      throw new Error(`Unexpected execute: ${text}`);
    },
  };
  return { state, pool: { async getConnection() { return conn; } } };
}

const basePage = { id: 12, route: '/torolheto/', type: 'content_page', title: 'Törölhető oldal', status: 'archived' };

{
  const { state, pool } = pageDeletePool({
    page: basePage,
    ownBlocks: [
      { id: 1, page_id: 12, block_key: 'body', title: 'Tartalom', status: 'published' },
      { id: 2, page_id: 12, block_key: 'old', title: 'Régi', status: 'archived' },
    ],
  });
  const deleted = await createAdminRepository(pool).deletePage(12);
  assert.equal(deleted.id, 12);
  assert.equal(deleted.deletedBlockCount, 2, 'all own blocks are removed through page cascade');
  assert.deepEqual(state.deletes, [12]);
  assert.equal(state.commits, 1);
  assert.equal(state.rollbacks, 0);
}

{
  const { state, pool } = pageDeletePool({ page: { ...basePage, id: 1, route: '/', type: 'home' } });
  await assert.rejects(
    () => createAdminRepository(pool).deletePage(1),
    (error) => error.code === 'PAGE_DELETE_HOME_PROTECTED' && error.status === 409,
  );
  assert.equal(state.rollbacks, 1);
}

{
  const { state, pool } = pageDeletePool({
    page: basePage,
    navigation: [{ id: 4, title: 'Régi menüpont', status: 'archived', target_type: 'page', target_page_id: 12 }],
  });
  await assert.rejects(
    () => createAdminRepository(pool).deletePage(12),
    (error) => error.code === 'PAGE_DELETE_BLOCKED'
      && /Menüpont hivatkozik az oldalra/.test(error.message)
      && /Menü adminban/.test(error.message),
  );
  assert.equal(state.rollbacks, 1, 'even archived navigation references block physical delete because the FK still points to the page');
}

{
  const { state, pool } = pageDeletePool({
    page: basePage,
    ownBlocks: [
      { id: 1, page_id: 12, block_key: 'one', title: 'Első', status: 'published' },
      { id: 2, page_id: 12, block_key: 'two', title: 'Második', status: 'draft' },
      { id: 3, page_id: 12, block_key: 'old', title: 'Archivált', status: 'archived' },
    ],
  });
  await assert.rejects(
    () => createAdminRepository(pool).deletePage(12),
    (error) => error.code === 'PAGE_DELETE_BLOCKED'
      && /2 nem archivált tartalmi blokkot/.test(error.message)
      && /legfeljebb egy/.test(error.message),
  );
  assert.equal(state.rollbacks, 1);
}

{
  const { state, pool } = pageDeletePool({
    page: basePage,
    candidateBlocks: [{
      id: 30,
      page_id: 20,
      page_title: 'Másik oldal',
      block_key: 'related',
      title: 'Kapcsolódó oldalak',
      status: 'published',
      items: JSON.stringify([{ target_type: 'page', target_page_id: 12 }]),
    }],
  });
  await assert.rejects(
    () => createAdminRepository(pool).deletePage(12),
    (error) => error.code === 'PAGE_DELETE_BLOCKED'
      && /Más aktív tartalom hivatkozik/.test(error.message)
      && /Másik oldal/.test(error.message),
  );
  assert.equal(state.rollbacks, 1);
}

{
  const { state, pool } = pageDeletePool({
    page: basePage,
    settings: [{ key: 'defaultCta', value: JSON.stringify({ primaryUrl: '/torolheto/' }) }],
  });
  await assert.rejects(
    () => createAdminRepository(pool).deletePage(12),
    (error) => error.code === 'PAGE_DELETE_BLOCKED'
      && /Alapadatok \/ defaultCta/.test(error.message),
  );
  assert.equal(state.rollbacks, 1);
}

assert.deepEqual(
  findPageReferences({ cards: [{ targetPageId: 12 }, { href: '/torolheto/' }] }, { pageId: 12, route: '/torolheto/' }).map((item) => item.kind).sort(),
  ['page_id', 'route'],
);

const listHtml = pagesTable([
  { id: 1, route: '/', type: 'home', title: 'Főoldal' },
  { id: 12, route: '/torolheto/', type: 'content_page', title: 'Törölhető oldal' },
]);
assert.match(listHtml, /page-delete-catalog/);
assert.match(listHtml, /data-page-delete/);

const formHtml = pageForm({
  page: { ...basePage, hero_video: null, presentation: null },
  blocks: [],
  defaultCta: {},
  navigationUsages: [],
  pageTargetPages: [],
});
assert.match(formHtml, /data-page-delete-zone/);
assert.match(formHtml, /data-page-delete="12"/);
assert.match(formHtml, /legfeljebb egy nem archivált saját tartalmi blokk/);
assert.match(pageDeleteClientScript, /fetch\('\/api\/admin\/pages\/' \+ encodeURIComponent\(id\), \{ method: 'DELETE' \}\)/);
assert.match(pageDeleteClientScript, /Korábbi élesítés visszaállításával az oldal és blokkjai/);
assert.match(pageDeleteClientScript, /window\.confirm/);
assert.equal(pageDeleteClientScript.includes("if (!/^\\d+$/.test(id)) return;"), true, 'numeric page IDs pass the runtime click guard');
assert.equal(pageDeleteClientScript.includes("if (!/^\\\\d+$/.test(id)) return;"), false, 'runtime guard must not search for a literal \\d token');

const serverSource = await readFile('src/lib/admin/server-page-delete.mjs', 'utf8');
assert.match(serverSource, /api\\\/admin\\\/pages/);
assert.match(serverSource, /repo\.deletePage/);
assert.match(serverSource, /publisher\.publish/);
assert.match(serverSource, /error\.status === 409/);

const baseRepositorySource = await readFile('src/lib/admin/repository.mjs', 'utf8');
assert.match(baseRepositorySource, /importContentSnapshot/);
assert.match(baseRepositorySource, /INSERT INTO site_pages/);
assert.match(baseRepositorySource, /INSERT INTO site_content_blocks/);

console.log('Page delete smoke passed: navigation, active content, active block-count, home protection, cascade delete, UI warning, click runtime and snapshot restore contracts are present.');
