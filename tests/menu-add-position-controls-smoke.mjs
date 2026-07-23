import assert from 'node:assert/strict';
import { navHtml } from '../src/lib/admin/render/menu-position-controls.mjs';
import { menuPositionControlsScript } from '../src/lib/admin/render/menu-position-controls.mjs';

const html = navHtml([
  { id: 1, title: 'Root group', href: null, target_type: 'group', parent_id: null, sort_order: 1, status: 'published' },
  { id: 2, title: 'Child', href: '/child/', target_type: 'legacy', parent_id: 1, sort_order: 1, status: 'published' },
], []);

assert.match(html, /id="nav-form"/);
assert.match(html, /Új root menüpont legfelül/);
assert.match(html, /Új root menüpont legalul/);
assert.match(html, /Gyermek menüpont hozzáadása/);
assert.match(menuPositionControlsScript, /position === 'start' \? \[newRow, \.\.\.existingSiblings\] : \[\.\.\.existingSiblings, newRow\]/);
assert.match(menuPositionControlsScript, /parentSelect\.value = parentRef/);
assert.match(menuPositionControlsScript, /newRow\.dataset\.suppressParentMoveFeedback = '1'/);
assert.match(menuPositionControlsScript, /parentSelect\?\.dispatchEvent\(new Event\('change', \{ bubbles: true \}\)\)/);
assert.match(menuPositionControlsScript, /newRow\.scrollIntoView\(\{ block: 'center' \}\)/);
assert.match(menuPositionControlsScript, /newRow\.querySelector\('\[data-role="target-type"\]'\)\?\.focus\(\)/);
assert.match(menuPositionControlsScript, /if \(page\) page\.value = ''/);
assert.match(menuPositionControlsScript, /if \(override\) override\.value = ''/);
assert.match(menuPositionControlsScript, /data-message-kind="menu-parent-move"/);
assert.match(menuPositionControlsScript, /menüpont átkerült a\(z\) „/);
assert.match(menuPositionControlsScript, /menüpont átkerült a legfelső szintre/);
assert.match(menuPositionControlsScript, /row\.scrollIntoView\(\{ block: 'center', behavior: 'smooth' \}\)/);
assert.match(menuPositionControlsScript, /row\.animate\?\./);
assert.match(menuPositionControlsScript, /event\.target\.matches\('\[data-role="parent-select"\]'\)/);
assert.match(menuPositionControlsScript, /else showParentMoveFeedback\(row\)/);

console.log('Menu add position controls smoke passed: deterministic insertion and parent-move feedback contracts are present.');
