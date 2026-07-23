import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAdminRepository } from '../src/lib/admin/repository-navigation-delete.mjs';
import { menuPositionControlsScript } from '../src/lib/admin/render/menu-position-controls.mjs';

function deletePool() {
  const state = {
    nav: [
      { id: 1, title: 'Leaf', parent_id: null, status: 'archived' },
      { id: 2, title: 'Group', parent_id: null, status: 'archived' },
      { id: 3, title: 'Child', parent_id: 2, status: 'archived' },
    ],
    commits: 0,
    rollbacks: 0,
    deletes: [],
  };
  const conn = {
    async beginTransaction() {},
    async commit() { state.commits += 1; },
    async rollback() { state.rollbacks += 1; },
    release() {},
    async query(sql, params = []) {
      const text = String(sql);
      if (text.startsWith('SELECT * FROM site_navigation_items WHERE id=')) return [state.nav.filter((item) => Number(item.id) === Number(params[0])).map((item) => ({ ...item })), null];
      if (text.startsWith('SELECT id,title FROM site_navigation_items WHERE parent_id=')) return [state.nav.filter((item) => Number(item.parent_id) === Number(params[0])).slice(0, 1).map((item) => ({ id: item.id, title: item.title })), null];
      throw new Error(text);
    },
    async execute(sql, params = []) {
      const text = String(sql);
      if (text.startsWith('DELETE FROM site_navigation_items WHERE id=')) {
        const id = Number(params[0]);
        const before = state.nav.length;
        state.nav = state.nav.filter((item) => Number(item.id) !== id);
        state.deletes.push(id);
        return [{ affectedRows: before - state.nav.length }, null];
      }
      throw new Error(text);
    },
  };
  return { state, pool: { async getConnection() { return conn; } } };
}

{
  const { state, pool } = deletePool();
  const deleted = await createAdminRepository(pool).deleteNavigationItem(1);
  assert.equal(deleted.id, 1);
  assert.deepEqual(state.deletes, [1]);
  assert.equal(state.nav.some((item) => item.id === 1), false, 'physically deleted navigation item no longer appears in current admin data');
  assert.equal(state.commits, 1);
  assert.equal(state.rollbacks, 0);
}

{
  const { state, pool } = deletePool();
  await assert.rejects(
    () => createAdminRepository(pool).deleteNavigationItem(2),
    (error) => error.code === 'NAVIGATION_ITEM_HAS_CHILDREN' && error.status === 409,
  );
  assert.equal(state.nav.some((item) => item.id === 2), true, 'group with child is preserved');
  assert.equal(state.rollbacks, 1);
}

assert.match(menuPositionControlsScript, /deleteButton\.textContent = 'Törlés'/);
assert.match(menuPositionControlsScript, /data-delete-navigation/);
assert.match(menuPositionControlsScript, /fetch\('\/api\/admin\/navigation\/' \+ encodeURIComponent\(id\), \{ method: 'DELETE' \}\)/);
assert.match(menuPositionControlsScript, /Korábbi élesítés visszaállításával később újra létrehozható/);
assert.match(menuPositionControlsScript, /if \(!id\) removeUnsavedRow\(row\)/);
assert.match(menuPositionControlsScript, /directChildren\(row\)\.length/);

const serverSource = await readFile('src/lib/admin/server-navigation-delete.mjs', 'utf8');
assert.match(serverSource, /\/api\\\/admin\\\/navigation\\\/\(\\d\+\)/);
assert.match(serverSource, /requireAuthFromRequest/);
assert.match(serverSource, /repo\.deleteNavigationItem/);
assert.match(serverSource, /publisher\.publish/);
assert.match(serverSource, /NAVIGATION_ITEM_HAS_CHILDREN/);

const baseRepositorySource = await readFile('src/lib/admin/repository.mjs', 'utf8');
assert.match(baseRepositorySource, /SELECT \* FROM site_navigation_items ORDER BY id/);
assert.match(baseRepositorySource, /INSERT INTO site_navigation_items SET \?/);
assert.match(baseRepositorySource, /UPDATE site_navigation_items SET parent_id=NULL/);

console.log('Navigation delete smoke passed: physical delete, child protection, admin removal and snapshot restore contracts are present.');
