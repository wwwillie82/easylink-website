import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createAdminServer } from '../src/lib/admin/server.mjs';
import { hashPassword } from '../src/lib/db/client.mjs';
import { tokenHash, sessionCookieName, csrfCookieName } from '../src/lib/admin/auth.mjs';
import { fullAdminPermissionMatrix, normalizePermissions, permissionRowsForInsert, defaultNewUserPermissionMatrix, routeRequirement, classifyStatusMutation, hasAction, hasScope } from '../src/lib/admin/permissions.mjs';

function cookiePair(setCookie) { const s=Array.isArray(setCookie)?setCookie.join(', '):String(setCookie||''); return { session: /easylink_site_admin=([^;,]+)/.exec(s)?.[1], csrf: /easylink_site_admin_csrf=([^;,]+)/.exec(s)?.[1], header: s.split(/, (?=easylink_site_admin)/).map(x=>x.split(';')[0]).join('; ') }; }
function repoWithPermissions(matrix = fullAdminPermissionMatrix) {
  const state = { sessions: [], user: { id:1, email:'a@b.test', display_name:'Admin', password_hash: hashPassword('correct-password'), status:'active' }, permissions: permissionRowsForInsert(matrix), pages:[{id:1,title:'Page',route:'/p/',status:'published',type:'content_page'}], nav:[{id:1,title:'Menu',href:'/p/',status:'published',sort_order:1}], media:[{id:1,path:'/m.webp',alt:'A',type:'image/webp',status:'active'}], publish:0 };
  return { state,
    async findAdminUserByEmail(email){ return email===state.user.email ? state.user : null; }, async markAdminLogin(){},
    async createAdminSession(p){ const s={ id:state.sessions.length+1, ...p, revoked_at:null }; state.sessions.push(s); return s; },
    async resolveAdminSessionByTokenHash(h){ const s=state.sessions.find(x=>x.token_hash===h); return s ? { session:s, user:state.user } : null; },
    async getAdminSessionCsrfHash(id){ return state.sessions.find(s=>s.id===id)?.csrf_token_hash || null; }, async revokeAdminSession(id){ const s=state.sessions.find(x=>x.id===id); if(s)s.revoked_at=new Date(); }, async touchAdminSession(){},
    async loadAdminUserScopes(){ return state.permissions; }, async pages(){ return state.pages; }, async page(id){ const p=state.pages.find(p=>String(p.id)===String(id)); return p?{page:p,blocks:[]}:null; }, async updatePage(id,p){ Object.assign(state.pages.find(x=>String(x.id)===String(id)),p); }, async createPage(p){ const page={id:2,...p}; state.pages.push(page); return page; }, async nav(){ return state.nav; }, async updateNav(items){ state.nav=items; return []; }, async listMedia(){return state.media;}, async getMedia(id){return state.media.find(m=>String(m.id)===String(id))||null;}, async updateMedia(id,p){ Object.assign(state.media.find(m=>String(m.id)===String(id)),p); return state.media.find(m=>String(m.id)===String(id)); }, async archiveMedia(id){ const m=state.media.find(m=>String(m.id)===String(id)); m.status='archived'; return m; }, async getSiteSettings(){return {};}, async updateSiteSettings(p){return p;}, async publishSnapshots(){return [];}, async publishSnapshot(){return null;}
  };
}
async function login(base) { const res = await fetch(`${base}/api/admin/login`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({email:'a@b.test',password:'correct-password'}), redirect:'manual' }); assert.equal(res.status,200); return cookiePair(res.headers.getSetCookie ? res.headers.getSetCookie() : res.headers.get('set-cookie')); }
async function withServer(repo, fn) { const server=createAdminServer({repo, publishService:{async publish(){repo.state.publish++; return {ok:true};}}, env:{NODE_ENV:'test'}}); server.listen(0,'127.0.0.1'); await once(server,'listening'); try { await fn(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); } }

assert.ok(defaultNewUserPermissionMatrix.pages.canSave);
assert.ok(fullAdminPermissionMatrix.publish.canRestore);
assert.equal(hasScope({ pages: {} }, 'bogus'), false);
assert.equal(hasAction({ pages: { canSave: true } }, 'pages', 'sav'), false);
assert.equal(hasAction({ pages: { canSave: true } }, 'bogus', 'save'), false);
assert.deepEqual(routeRequirement('DELETE','/api/admin/pages/1').required, [{scope:'pages',action:'delete'}]);
assert.equal(routeRequirement('GET','/api/admin/unmapped').unmapped, true);
assert.equal(routeRequirement('PUT','/api/admin/logout').methodAllowed, false);
assert.equal(classifyStatusMutation({status:'published',title:'A'},{status:'archived',title:'B'}).needsSave, true);
assert.equal(classifyStatusMutation({status:'published',title:'A'},{status:'archived',title:'B'}).needsArchive, true);

{ const fullRepo = repoWithPermissions();
await withServer(fullRepo, async (base) => {
  const c = await login(base);
  assert.ok(c.session && c.csrf);
  assert.equal(decodeURIComponent(c.session).includes('role'), false);
  assert.equal(tokenHash(decodeURIComponent(c.session)), fullRepo.state.sessions[0].token_hash);
  assert.equal(tokenHash(decodeURIComponent(c.csrf)), fullRepo.state.sessions[0].csrf_token_hash);
  let res = await fetch(`${base}/api/admin/session`, { headers:{ cookie:c.header } });
  let j = await res.json(); assert.equal(res.status,200); assert.equal(j.data.user.email,'a@b.test'); assert.ok(j.data.permissions.pages.canSave); assert.ok(j.data.expiresAt);
  res = await fetch(`${base}/api/admin/pages`, { method:'POST', headers:{ cookie:`${sessionCookieName}=${c.session}`, 'content-type':'application/json' }, body:JSON.stringify({title:'No csrf',route:'/no/'}) });
  assert.equal(res.status,403);
  res = await fetch(`${base}/api/admin/pages`, { method:'POST', headers:{ cookie:c.header, 'content-type':'application/json' }, body:JSON.stringify({title:'Cookie csrf denied',route:'/cookie-csrf/'}) });
  assert.equal(res.status,403);
  res = await fetch(`${base}/api/admin/pages`, { method:'POST', headers:{ cookie:c.header, 'content-type':'application/json', 'x-csrf-token':decodeURIComponent(c.csrf) }, body:JSON.stringify({title:'Ok',route:'/ok/'}) });
  assert.equal(res.status,200);
  fullRepo.state.user.status='disabled';
  res = await fetch(`${base}/api/admin/pages`, { headers:{ cookie:c.header } }); assert.equal(res.status,401);
}); }

const readOnly = { pages:{canSave:false,canArchive:false,canDelete:false} };
{ const roRepo = repoWithPermissions(readOnly);
await withServer(roRepo, async (base) => {
  const c = await login(base);
  let res = await fetch(`${base}/admin/menu`, { headers:{cookie:c.header} }); assert.equal(res.status,403);
  res = await fetch(`${base}/api/admin/pages`, { headers:{cookie:c.header} }); assert.equal(res.status,200);
  res = await fetch(`${base}/api/admin/pages`, { method:'POST', headers:{ cookie:c.header, 'content-type':'application/json', 'x-csrf-token':decodeURIComponent(c.csrf) }, body:JSON.stringify({title:'Denied',route:'/denied/'}) }); assert.equal(res.status,403); assert.equal(roRepo.state.pages.length,1); assert.equal(roRepo.state.publish,0);
}); }

const archiveOnly = { pages:{canSave:false,canArchive:true,canDelete:false} };
await withServer(repoWithPermissions(archiveOnly), async (base) => {
  const c = await login(base);
  let res = await fetch(`${base}/api/admin/pages/1`, { method:'PUT', headers:{ cookie:c.header, 'content-type':'application/json', 'x-csrf-token':decodeURIComponent(c.csrf) }, body:JSON.stringify({status:'archived'}) }); assert.equal(res.status,200);
  res = await fetch(`${base}/api/admin/pages/1`, { method:'PUT', headers:{ cookie:c.header, 'content-type':'application/json', 'x-csrf-token':decodeURIComponent(c.csrf) }, body:JSON.stringify({title:'Denied',status:'archived'}) }); assert.equal(res.status,403);
});

console.log('Admin auth/permission foundation smoke passed.');
