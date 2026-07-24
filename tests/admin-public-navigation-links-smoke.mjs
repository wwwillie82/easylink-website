import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { layout, loginHtml } from '../src/lib/admin/render.mjs';
import { routeRequirement } from '../src/lib/admin/permissions.mjs';

const adminHtml = layout('<p>Admin tartalom</p>', {
  current: '/admin/pages',
  adminContext: {
    user: { id: 2, displayName: 'Wilfing András', email: 'wilfinga@gmail.com' },
    permissions: { pages: { canSave: true } },
  },
});

assert.match(adminHtml, /class="admin-nav__public" href="\/">Weboldal<\/a>/);
assert.match(adminHtml, /\.admin-nav__public\{/);
assert.ok(adminHtml.indexOf('Weboldal</a>') < adminHtml.indexOf('action="/api/admin/logout"'));
assert.doesNotMatch(loginHtml(), /admin-nav__public/);
assert.doesNotMatch(layout('<p>Anonim</p>', { adminContext: null }), /admin-nav__public/);

const sessionRule = routeRequirement('GET', '/api/admin/session');
assert.equal(sessionRule.authOnly, true);
assert.deepEqual(sessionRule.required, []);
assert.equal(sessionRule.csrf, false);

const headerSource = await readFile(new URL('../src/components/Header.astro', import.meta.url), 'utf8');
assert.match(headerSource, /data-admin-session-link href="\/admin\/pages" hidden>Admin<\/a>/);
assert.match(headerSource, /fetch\('\/api\/admin\/session'/);
assert.match(headerSource, /credentials: 'same-origin'/);
assert.match(headerSource, /cache: 'no-store'/);
assert.match(headerSource, /\['pages', '\/admin\/pages'\]/);
assert.match(headerSource, /\['menu', '\/admin\/menu'\]/);
assert.match(headerSource, /\['audit', '\/admin\/audit'\]/);
assert.match(headerSource, /if \(!payload\?\.ok \|\| !payload\?\.data\?\.user\) return;/);
assert.match(headerSource, /if \(!route\) return;/);
assert.match(headerSource, /adminLink\.hidden = false;/);
assert.doesNotMatch(headerSource, /document\.cookie/);

console.log('Admin/public navigation links smoke passed.');
