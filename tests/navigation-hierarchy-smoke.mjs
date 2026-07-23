import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAdminRepository } from '../src/lib/admin/repository.mjs';
import { buildNavigationPayloadItem, adminApplySavedMappings, adminMoveSibling, adminSortParentFirstRows, adminValidParentKeys, adminCanChangeTargetType, adminDetachArchivedDescendantsForLeaf, adminValidateHierarchyDraft, adminRefreshPreservedParentRef, GROUP_WITH_CHILDREN_TARGET_CHANGE_ERROR } from '../src/lib/admin/render/menu.mjs';
import { validateNavPayload } from '../src/lib/admin/server.mjs';
import { validateNavigationHierarchy, buildPublicNavigationTree, sortNavigationParentFirst, toNavigationPersistenceRow } from '../src/lib/content/navigation-hierarchy.mjs';

const page = { id: 1, route: '/p/', title: 'P', status: 'published' };
const pagesById = new Map([[1, page], [2, { id:2, route:'/d/', title:'D', status:'draft' }]]);

const pages = [{ id:1, route:'/p/', title:'P', status:'published' }];
assert.deepEqual(buildNavigationPayloadItem({ client_key:'root', target_type:'group', group_title:' Root ', sort_order:1, status:'draft' }, pages), { id:'', client_key:'root', sort_order:'1', status:'draft', target_type:'group', target_page_id:null, title_override:null, title:'Root', href:null });
assert.deepEqual(buildNavigationPayloadItem({ client_key:'childg', parent_id:'id:10', target_type:'group', group_title:'Child', sort_order:1, status:'draft' }, pages).parent_id, 'id:10');
assert.deepEqual(buildNavigationPayloadItem({ client_key:'childg2', parent_id:'client:root', target_type:'group', group_title:'Child2', sort_order:1, status:'draft' }, pages).parent_id, 'client:root');
assert.throws(() => buildNavigationPayloadItem({ client_key:'bad', target_type:'group', group_title:' ', sort_order:1, status:'draft' }, pages), /Csoportosító/);
assert.equal(buildNavigationPayloadItem({ client_key:'switch1', target_type:'page', target_page_id:1, title_mode:'inherit', sort_order:1, status:'draft' }, pages).href, '/p/');
assert.equal(buildNavigationPayloadItem({ client_key:'switch2', target_type:'group', group_title:'Switched', sort_order:1, status:'draft' }, pages).href, null);

const leaf = (id, parent_id=null, sort_order=1) => ({ id, parent_id, title:`L${id}`, href:`/l${id}/`, target_type:'legacy', sort_order, status:'published' });
const group = (id, parent_id=null, sort_order=1, status='published') => ({ id, parent_id, title:`G${id}`, href:null, target_type:'group', sort_order, status });
assert.equal(validateNavigationHierarchy([leaf(1)], { pagesById }).ok, true);
assert.equal(buildPublicNavigationTree([leaf(2,null,2), leaf(1,null,1)])[0].title, 'L1');
assert.equal(validateNavigationHierarchy([group(1), group(2,1), leaf(3,2)], { pagesById }).ok, true);
assert.equal(validateNavigationHierarchy([group(1), group(2,1), group(3,2), leaf(4,3)], { pagesById }).errors.some(e=>e.code==='NAVIGATION_TOO_DEEP'), true);
assert.equal(validateNavigationHierarchy([{...leaf(1), parent_id:1}], { pagesById }).errors.some(e=>e.code==='NAVIGATION_SELF_PARENT'), true);
assert.equal(validateNavigationHierarchy([group(1,2), group(2,1)], { pagesById }).errors.some(e=>e.code==='NAVIGATION_CYCLE'), true);
assert.equal(validateNavigationHierarchy([leaf(1), leaf(2,1)], { pagesById }).errors.some(e=>e.code==='NAVIGATION_LEAF_HAS_CHILDREN'), true);
assert.equal(validateNavigationHierarchy([{...group(1), href:'/bad/'}], { pagesById }).errors.some(e=>e.code==='NAVIGATION_GROUP_HAS_TARGET'), true);
assert.equal(validateNavigationHierarchy([group(1)], { pagesById }).errors.some(e=>e.code==='NAVIGATION_PUBLISHED_EMPTY_GROUP'), true);
assert.equal(validateNavigationHierarchy([{...group(1,null,1,'draft')}, leaf(2,1)], { pagesById }).errors.some(e=>e.code==='NAVIGATION_PUBLISHED_CHILD_UNPUBLISHED_PARENT'), true);
assert.deepEqual(sortNavigationParentFirst([leaf(3,2), group(2,1), group(1)]).map(i=>Number(i.id)), [1,2,3]);
assert.deepEqual(Object.keys(toNavigationPersistenceRow(sortNavigationParentFirst([group(1), leaf(2,1)])[0])).filter((k)=>k.startsWith('__')||k==='parent_ref'), []);
assert.equal(validateNavigationHierarchy([group(1,null,1,'archived'), leaf(2,1)], { pagesById }).errors.some(e=>e.code==='NAVIGATION_ARCHIVE_GROUP_WITH_ACTIVE_CHILDREN'), true);
assert.equal(validateNavigationHierarchy([{ id: 9, title:'P', href:'/p/', target_type:'page', target_page_id:2, sort_order:1, status:'published' }], { pagesById }).errors.some(e=>e.code==='NAVIGATION_TARGET_PAGE_NOT_PUBLISHED'), true);

function hierarchyPool() {
  const state = { failNavInsert:false, order:[], nav: [{ id: 10, title:'Old group', href:null, target_type:'group', target_page_id:null, title_override:null, parent_id:null, sort_order:1, status:'draft' }, { id: 11, title:'Old child', href:'/old/', target_type:'legacy', target_page_id:null, title_override:null, parent_id:null, sort_order:1, status:'published' }], pages: [{ id:1, status:'published', route:'/p/', title:'P' }], commits:0, rollbacks:0, deletes:0, inserts:[], updates:[] };
  let nextId = 100;
  const conn = { async beginTransaction(){state.order.push('BEGIN');}, async commit(){state.commits++;state.order.push('COMMIT');}, async rollback(){state.rollbacks++;state.order.push('ROLLBACK');}, release(){}, async query(sql, params=[]) { const text=String(sql); if (text.includes('SELECT * FROM site_navigation_items ORDER')) return [state.nav.map((n)=>({...n})), null]; if (text.includes('SELECT id,status FROM site_pages')) return [state.pages.map((p)=>({...p})), null]; if (text.includes('SELECT * FROM site_navigation_items WHERE id=')) return [state.nav.filter((n)=>String(n.id)===String(params[0])).map((n)=>({...n})), null]; if (text.includes('SELECT id, route, title')) return [state.pages.filter((p)=>String(p.id)===String(params[0])).map((p)=>({...p})), null]; if (text.includes('href=?')) return [[], null]; if (text.startsWith('UPDATE site_navigation_items SET parent_id=NULL')) { state.order.push('NULL_PARENTS'); return [[], null]; } if (text.startsWith('DELETE FROM site_navigation_items')) { state.deletes++; state.order.push('DELETE_NAV'); return [[], null]; } if (text.startsWith('DELETE')) { state.deletes++; return [[], null]; } if (text.startsWith('INSERT INTO site_pages') || text.startsWith('INSERT INTO site_content_blocks') || text.startsWith('INSERT INTO site_settings') || text.startsWith('INSERT INTO site_media_assets')) return [[], null]; if (text.startsWith('INSERT INTO site_navigation_items SET')) { if(state.failNavInsert) throw new Error('insert fail'); const row=params[0]; state.order.push('INSERT_NAV:'+row.id); for (const k of Object.keys(row)) assert.ok(['id','title','href','target_type','target_page_id','title_override','parent_id','sort_order','status','created_at','updated_at'].includes(k), `unknown nav snapshot column: ${k}`); state.inserts.push(row); return [[], null]; } throw new Error(text); }, async execute(sql, params=[]) { const text=String(sql); if (text.startsWith('INSERT INTO site_navigation_items')) { const row={ id: nextId++, title:params[0], href:params[1], target_type:params[2], target_page_id:params[3], title_override:params[4], parent_id:params[5], sort_order:params[6], status:params[7] }; state.nav.push(row); state.inserts.push(row); return [{ insertId: row.id, affectedRows:1 }, null]; } if (text.startsWith('UPDATE site_navigation_items')) { const id=Number(params[8]); const row=state.nav.find((n)=>n.id===id); Object.assign(row,{ title:params[0], href:params[1], sort_order:params[2], status:params[3], target_type:params[4], target_page_id:params[5], title_override:params[6], parent_id:params[7] }); state.updates.push({...row}); return [{ affectedRows:1 }, null]; } throw new Error(text); } };
  return { state, pool: { async getConnection(){ return conn; } } };
}


{
  const rows = [
    { client_key:'a', target_type:'group', parent_id:'', sort_order:'2' },
    { client_key:'a-child', target_type:'legacy', parent_id:'client:a', sort_order:'1' },
    { client_key:'b', target_type:'group', parent_id:'', sort_order:'1' },
    { client_key:'b-child', target_type:'group', parent_id:'client:b', sort_order:'1' },
    { client_key:'b-leaf', target_type:'legacy', parent_id:'client:b-child', sort_order:'1' },
  ];
  assert.deepEqual(adminSortParentFirstRows(rows).map((r)=>r.client_key), ['b','b-child','b-leaf','a','a-child']);
  assert.deepEqual(adminMoveSibling(rows, 'client:a', 'up').map((r)=>r.client_key), ['a','a-child','b','b-child','b-leaf']);
  assert.deepEqual(adminMoveSibling(rows, 'client:a-child', 'up').map((r)=>r.client_key), ['a','a-child','b','b-child','b-leaf'], 'different parent item does not move');
  assert.equal(adminValidParentKeys(rows, rows[3]).includes('client:b-child'), false, 'group cannot become third-level group');
  assert.equal(adminValidParentKeys(rows, rows[0]).includes('client:b-child'), false, 'subtree cannot exceed max depth');
  const applied = adminApplySavedMappings([{ client_key:'g', parent_id:'' }, { client_key:'c', parent_id:'client:g' }], [{ client_key:'g', id:10 }, { client_key:'c', id:11 }]);
  assert.deepEqual(applied.map((r)=>[r.client_key,r.id,r.parent_id,r.initial_parent]), [['g','10','',''], ['c','11','id:10','id:10']]);
  const threeNew = adminApplySavedMappings([{ client_key:'root', target_type:'group', parent_id:'' }, { client_key:'sub', target_type:'group', parent_id:'client:root' }, { client_key:'leaf', target_type:'legacy', parent_id:'client:sub' }], [{ client_key:'root', id:100 }, { client_key:'sub', id:101 }, { client_key:'leaf', id:102 }]);
  assert.deepEqual(threeNew.map((r)=>[r.client_key,r.id,r.parent_id]), [['root','100',''], ['sub','101','id:100'], ['leaf','102','id:101']], 'stable client_key mapping preserves all new child parent refs');
  let loaded = [{ id:'20', client_key:'parent', target_type:'group', parent_id:'', sort_order:'1' }, { id:'21', client_key:'child', target_type:'legacy', parent_id:'id:20', sort_order:'1' }];
  assert.equal(adminValidParentKeys(loaded, loaded[1]).includes('id:20'), true, 'existing child parent option loads');
  loaded[1].parent_id = '';
  assert.equal(adminSortParentFirstRows(loaded)[1].parent_id, '', 'Root selection remains empty after refresh-style sort');
  loaded[1].initial_parent = loaded[1].parent_id;
  assert.equal(loaded[1].initial_parent, '', 'saved baseline reflects Root');
  loaded[1].parent_id = 'id:20';
  loaded[1].parent_id = '';
  assert.equal(loaded[1].parent_id, '', 'choosing a parent then Root again works');

  const statusRows = [
    { client_key:'draft-parent', target_type:'group', status:'draft', parent_id:'', sort_order:'1' },
    { client_key:'archived-parent', target_type:'group', status:'archived', parent_id:'', sort_order:'2' },
    { client_key:'published-leaf', target_type:'legacy', status:'published', parent_id:'', sort_order:'3' },
    { client_key:'archived-leaf', target_type:'legacy', status:'archived', parent_id:'', sort_order:'4' },
  ];
  assert.equal(adminValidParentKeys(statusRows, statusRows[2]).includes('client:draft-parent'), false, 'published item cannot choose draft parent');
  assert.equal(adminValidParentKeys(statusRows, statusRows[2]).includes('client:archived-parent'), false, 'published item cannot choose archived parent');
  assert.equal(adminValidParentKeys(statusRows, statusRows[3]).includes('client:archived-parent'), true, 'fully archived subtree may choose archived parent');
  const groupWithChildren = [{ client_key:'root', target_type:'group', parent_id:'', sort_order:'1' }, { client_key:'child', target_type:'group', parent_id:'client:root', sort_order:'1' }, { client_key:'leaf', target_type:'legacy', parent_id:'client:child', sort_order:'1' }];
  assert.equal(adminCanChangeTargetType(groupWithChildren, groupWithChildren[0], 'page'), false, 'group with active descendants cannot become leaf');
  assert.equal(adminCanChangeTargetType(groupWithChildren, groupWithChildren[2], 'external'), true, 'leaf target switching remains allowed');
  const archivedChildren = [{ client_key:'root', target_type:'group', status:'published', parent_id:'', sort_order:'1' }, { client_key:'archived-child', target_type:'legacy', status:'archived', parent_id:'client:root', sort_order:'1' }, { client_key:'archived-grand', target_type:'legacy', status:'archived', parent_id:'client:archived-child', sort_order:'1' }];
  assert.equal(adminCanChangeTargetType(archivedChildren, archivedChildren[0], 'page'), true, 'archived descendants do not block group to leaf conversion');
  assert.deepEqual(adminDetachArchivedDescendantsForLeaf(archivedChildren, archivedChildren[0]).slice(1).map((r)=>r.parent_id), ['', ''], 'archived descendants are explicitly detached before group becomes leaf');
  const publishGroupFirst = [{ client_key:'group', target_type:'group', status:'draft', parent_id:'', sort_order:'1' }, { client_key:'child', target_type:'legacy', status:'draft', parent_id:'client:group', sort_order:'1' }];
  publishGroupFirst[0].status = 'published';
  assert.equal(adminValidateHierarchyDraft(publishGroupFirst, pages).ok, false, 'group-first publish is staged-invalid until child is published');
  publishGroupFirst[1].status = 'published';
  assert.equal(adminValidateHierarchyDraft(publishGroupFirst, pages).ok, true, 'group-first publish becomes saveable after child publish');
  const publishChildFirst = [{ client_key:'group', target_type:'group', status:'draft', parent_id:'', sort_order:'1' }, { client_key:'child', target_type:'legacy', status:'draft', parent_id:'client:group', sort_order:'1' }];
  publishChildFirst[1].status = 'published';
  assert.equal(adminValidateHierarchyDraft(publishChildFirst, pages).ok, false, 'child-first publish is staged-invalid while parent is draft');
  publishChildFirst[0].status = 'published';
  assert.equal(adminValidateHierarchyDraft(publishChildFirst, pages).ok, true, 'child-first publish becomes saveable after parent publish');
  const archiveAnyOrder = [{ client_key:'group', target_type:'group', status:'published', parent_id:'', sort_order:'1' }, { client_key:'child', target_type:'legacy', status:'published', parent_id:'client:group', sort_order:'1' }];
  archiveAnyOrder[1].status = 'archived';
  assert.equal(adminValidateHierarchyDraft(archiveAnyOrder, pages).ok, false, 'archiving child first is staged-invalid while group is published');
  archiveAnyOrder[0].status = 'archived';
  assert.equal(adminValidateHierarchyDraft(archiveAnyOrder, pages).ok, true, 'archiving group second makes final branch saveable');
  const threeLevel = [{ client_key:'root', target_type:'group', status:'draft', parent_id:'', sort_order:'1' }, { client_key:'sub', target_type:'group', status:'draft', parent_id:'client:root', sort_order:'1' }, { client_key:'leaf', target_type:'legacy', status:'draft', parent_id:'client:sub', sort_order:'1' }];
  threeLevel[2].status = 'published';
  assert.equal(adminValidateHierarchyDraft(threeLevel, pages).ok, false, 'three-level staged edit blocks save until ancestors are compatible');
  threeLevel[1].status = 'published'; threeLevel[0].status = 'published';
  assert.equal(adminValidateHierarchyDraft(threeLevel, pages).ok, true, 'three-level final state saves when root, subgroup and leaf are compatible');
  assert.equal(adminRefreshPreservedParentRef('id:10', ['', 'id:20'], false), 'id:10', 'refresh preserves current parent even when option is temporarily invalid');
  assert.equal(adminRefreshPreservedParentRef('id:10', ['', 'id:20'], true), '', 'only direct user parent change may clear an invalid parent');
}

{
  const { state, pool } = hierarchyPool();
  const ids = await createAdminRepository(pool).updateNav([
    { client_key:'g', title:'New group', href:null, target_type:'group', sort_order:1, status:'published' },
    { client_key:'c', parent_id:'client:g', title:'New child', href:'/new/', target_type:'legacy', sort_order:1, status:'published' },
    { id:11, client_key:'old-leaf', parent_id:'client:g', title:'Moved child', href:'/old/', target_type:'legacy', sort_order:2, status:'published' },
  ]);
  assert.deepEqual(ids.slice(0,3), [100, 101, 11]);
  assert.deepEqual(ids.navigationMappings, [{ client_key:'g', id:100 }, { client_key:'c', id:101 }, { client_key:'old-leaf', id:11 }]);
  assert.equal(state.nav.find((n)=>n.id===11).parent_id, 100, 'UPDATE writes parent_id for parent switch');
  assert.equal(state.nav.find((n)=>n.id===101).parent_id, 100, 'INSERT resolves client_key parent_id');
  assert.equal(state.commits, 1);
}
{
  const { state, pool } = hierarchyPool();
  await createAdminRepository(pool).importContentSnapshot({ pages:[page], blocks:[], settings:[], media:[], navigation:[{ id: 50, title:'Snap group', href:null, target_type:'group', parent_id:null, sort_order:1, status:'published' }, { id:51, title:'Snap leaf', href:'/snap/', target_type:'legacy', parent_id:50, sort_order:1, status:'published' }] });
  assert.equal(state.inserts[0].id, 50);
  assert.equal(state.inserts[1].parent_id, 50);
  assert.deepEqual(state.order.slice(0,5), ['BEGIN','NULL_PARENTS','DELETE_NAV','INSERT_NAV:50','INSERT_NAV:51']);
}
{
  const { state, pool } = hierarchyPool();
  await createAdminRepository(pool).importContentSnapshot({ pages:[page], blocks:[], settings:[], media:[], navigation:[{ id: 60, title:'Old', href:'/old-snapshot/', sort_order:1, status:'published' }] });
  assert.equal(state.inserts.at(-1).parent_id ?? null, null, 'legacy snapshot without parent_id imports as root leaf');
}

{
  const { state, pool } = hierarchyPool();
  state.failNavInsert = true;
  await assert.rejects(() => createAdminRepository(pool).importContentSnapshot({ pages:[page], blocks:[], settings:[], media:[], navigation:[{ id: 80, title:'G', href:null, target_type:'group', parent_id:null, sort_order:1, status:'published' }, { id:81, title:'L', href:'/l/', target_type:'legacy', parent_id:80, sort_order:1, status:'published' }] }), /insert fail/);
  assert.equal(state.order.at(-1), 'ROLLBACK');
}

{
  const { state, pool } = hierarchyPool();
  await assert.rejects(() => createAdminRepository(pool).importContentSnapshot({ pages:[page], blocks:[], settings:[], media:[], navigation:[{ id:70, title:'A', href:null, target_type:'group', parent_id:71, sort_order:1, status:'published' }, { id:71, title:'B', href:null, target_type:'group', parent_id:70, sort_order:1, status:'published' }] }), /snapshot menühierarchia/i);
  assert.equal(state.deletes, 0, 'cyclic snapshot is rejected before DELETE');
}

{
  const { state, pool } = hierarchyPool();
  const rawStates = [
    { client_key:'leaf', id:'11', parent_id:'client:root', target_type:'legacy', legacy_title:'Existing moved', legacy_href:'/old/', sort_order:2, status:'published' },
    { client_key:'grand', parent_id:'client:sub', target_type:'external', external_title:'Grand leaf', external_href:'https://example.com/grand', sort_order:1, status:'published' },
    { client_key:'sub', parent_id:'client:root', target_type:'group', group_title:'Sub group', sort_order:1, status:'published' },
    { client_key:'root', target_type:'group', group_title:'Root group', sort_order:1, status:'published' },
    { client_key:'other', target_type:'group', group_title:'Other draft group', sort_order:2, status:'draft' },
  ];
  const payload = rawStates.map((raw) => buildNavigationPayloadItem(raw, pages));
  assert.equal(payload.filter((item)=>item.target_type==='group').every((item)=>item.href === null), true, 'multiple groups serialize with null href');
  const valid = validateNavPayload({ items: payload }, pages);
  assert.equal(valid.ok, true);
  const ids = await createAdminRepository(pool).updateNav(valid.data);
  const api = { navigationIds: Array.from(ids), navigationMappings: ids.navigationMappings || [] };
  const byClient = new Map(api.navigationMappings.map((m)=>[m.client_key, String(m.id)]));
  const selects = new Map(rawStates.map((raw)=>[raw.client_key, raw.parent_id || '']));
  for (const [key,value] of selects) if (String(value).startsWith('client:')) selects.set(key, `id:${byClient.get(String(value).slice(7))}`);
  assert.equal(selects.get('sub'), 'id:100');
  assert.equal(selects.get('grand'), 'id:101');
  assert.equal(selects.get('leaf'), 'id:100', 'existing moved leaf remains under new root group');
  rawStates.forEach((raw)=>{ if (byClient.has(raw.client_key)) raw.id = byClient.get(raw.client_key); raw.parent_id = selects.get(raw.client_key); });
  const secondPayload = rawStates.map((raw) => buildNavigationPayloadItem(raw, pages));
  assert.deepEqual(secondPayload.map((item)=>[item.client_key,item.id,item.parent_id || '']), [ ['leaf','11','id:100'], ['grand','102','id:101'], ['sub','101','id:100'], ['root','100',''], ['other','103',''] ]);
  const validSecond = validateNavPayload({ items: secondPayload }, pages);
  assert.equal(validSecond.ok, true);
  await createAdminRepository(pool).updateNav(validSecond.data);
  assert.equal(state.nav.find((n)=>n.id===11).parent_id, 100, 'second save does not move existing child to root');
  assert.equal(state.nav.find((n)=>n.id===102).parent_id, 101, 'second save keeps third-level leaf parent');
}

const headerSource = await readFile('src/components/Header.astro', 'utf8');
assert.match(headerSource, /<details class="nav-group">/);
assert.match(headerSource, /nav-group nav-group--nested/);
assert.match(headerSource, /flex-direction: column/);
assert.match(headerSource, /Escape/);
assert.match(await readFile('src/lib/admin/render/menu.mjs', 'utf8'), new RegExp(GROUP_WITH_CHILDREN_TARGET_CHANGE_ERROR));
assert.doesNotMatch(headerSource, /href="#"/);
console.log('Navigation hierarchy smoke passed: validation, client_key repository saves, parent writes, snapshots, public tree and Header contracts.');
