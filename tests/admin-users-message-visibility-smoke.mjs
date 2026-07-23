import assert from 'node:assert/strict';
import { usersHtml } from '../src/lib/admin/render/users.mjs';

const html = usersHtml({ permissions: { users: { canSave: true, canArchive: true } } });

assert.match(html, /class="msg admin-users-toast"/);
assert.match(html, /aria-live="polite"/);
assert.match(html, /aria-atomic="true"/);
assert.match(html, /#msg\.admin-users-toast\{position:fixed/);
assert.match(html, /bottom:24px/);
assert.match(html, /z-index:1000/);
assert.match(html, /msg\.className='msg admin-users-toast '\+type/);
assert.match(html, /type==='err'\?'alert':'status'/);

console.log('admin users message visibility smoke ok');
