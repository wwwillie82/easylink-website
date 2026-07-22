import { fileURLToPath } from 'node:url';
import { createPool } from '../src/lib/db/client.mjs';

export const expectedPages = new Map([
  [3, ['/megoldasaink/penzugy-szamlazas/', 'solution_detail']], [4, ['/megoldasaink/hr-munkaugy/', 'solution_detail']], [5, ['/megoldasaink/crm-ugyfelkezeles/', 'solution_detail']], [6, ['/megoldasaink/dokumentumkezeles-adminisztracio/', 'solution_detail']], [7, ['/megoldasaink/kontrolling/', 'solution_detail']], [8, ['/megoldasaink/ai-asszisztens/', 'solution_detail']],
  [10, ['/kinek-szol/hotelek-szallashelyek/', 'audience_detail']], [11, ['/kinek-szol/vendeglatohelyek/', 'audience_detail']], [12, ['/kinek-szol/szolgaltato-vallalkozasok/', 'audience_detail']],
  [2, ['/megoldasaink/', 'solutions_index']], [9, ['/kinek-szol/', 'audiences_index']],
  [13, ['/integraciok/', 'integrations']], [14, ['/arak/', 'pricing']], [15, ['/kapcsolat/', 'contact']],
]);
const detailPages = [3,4,5,6,7,8,10,11,12];
const listingBlocks = [
  { id: 114, pageId: 2, key: 'golden:10:cards:Megoldásaink', type: 'cards', sortOrder: 2, want: { sectionGroupKey: 'solutions-listing-cards', sectionTheme: 'light', layout: 'grid', sectionOrder: 1, blockChrome: 'none' } },
  { id: 3, pageId: 2, key: '/megoldasaink/:feature-list:0', type: 'feature-list', sortOrder: 1, want: { sectionGroupKey: 'solutions-listing-content', sectionTheme: 'default', layout: 'grid', sectionOrder: 2, columnPosition: 1 } },
  { id: 120, pageId: 2, key: 'manual:598fbc42-261f-4b8e-ba62-33a1553c3b81', type: 'video', sortOrder: 3, want: { sectionGroupKey: 'solutions-listing-content', sectionTheme: 'default', layout: 'grid', sectionOrder: 2, columnPosition: 2 } },
  { id: 121, pageId: 2, key: 'manual:14e66a0a-ebf9-4f85-9ba3-c182bed2a9c7', type: 'ai-preview', sortOrder: 4, want: { sectionGroupKey: 'solutions-listing-content', sectionTheme: 'default', layout: 'grid', sectionOrder: 2, columnPosition: 3 } },
  { id: 122, pageId: 2, key: 'manual:68e691be-8397-4f16-8c36-fe9587cd7566', type: 'network-visual', sortOrder: 5, want: { sectionGroupKey: 'solutions-listing-content', sectionTheme: 'default', layout: 'grid', sectionOrder: 2, columnPosition: 4 } },
  { id: 115, pageId: 9, key: 'golden:10:cards:Kinek szól?', type: 'cards', sortOrder: 10, want: { sectionGroupKey: 'audiences-listing-cards', sectionTheme: 'light', layout: 'grid', sectionOrder: 1, blockChrome: 'none' } },
];
const groups = [
  { pageId: 13, blocks: [[51,'/integraciok/:text:0','text'],[52,'/integraciok/:cards:1','cards']], p: (pos) => ({ sectionGroupKey: 'integrations-main', sectionTheme: 'gradient-light', layout: 'stack', columnPosition: pos, ...(pos === 1 ? { contentLayout: 'lead', headingScale: 'display' } : {}) }) },
  { pageId: 14, blocks: [[53,'/arak/:feature-list:0','feature-list'],[117,'golden:20:text:Demó alapján pontosítunk','text']], p: (pos) => ({ sectionGroupKey: 'pricing-main', sectionTheme: 'default', layout: 'grid', gridColumns: 2, columnRatio: '1:1', columnPosition: pos, surface: 'polished', headingScale: 'section', ...(pos === 2 ? { surfaceVariant: 'gradient' } : {}) }) },
  { pageId: 15, blocks: [[55,'/kapcsolat/:cta:0','cta'],[56,'/kapcsolat/:feature-list:1','feature-list']], p: (pos) => ({ sectionGroupKey: 'contact-main', sectionTheme: 'default', layout: 'grid', gridColumns: 2, columnRatio: '0.85:1.15', columnPosition: pos, surface: 'polished', headingScale: 'prominent', ...(pos === 1 ? { bodyWhitespace: 'preserve-lines' } : {}) }) },
];
const related = new Map([[3,[4,5,6]],[4,[3,5,6]],[5,[3,4,6]],[6,[3,4,5]],[7,[3,4,5]],[8,[3,4,5]],[10,[11,12]],[11,[10,12]],[12,[10,11]]]);
function help(){ return `Usage: node scripts/adopt-generic-public-presentation.mjs --status|--dry-run|--apply --yes|--help`; }
function same(a,b){ return JSON.stringify(a) === JSON.stringify(b); }
function parse(v){ if(!v) return null; return typeof v === 'string' ? JSON.parse(v) : v; }
function relatedContract(pageId, targets) {
  return {
    page_id: pageId,
    block_key: `generic-related-links:${pageId}`,
    type: 'related-links',
    title: 'Kapcsolódó oldalak',
    body: '',
    items: targets.map((id) => ({ target_type: 'page', target_page_id: id, title_override: '' })),
    sort_order: 800,
    status: 'published',
  };
}
function relatedMatches(row, want) {
  return Number(row.page_id) === want.page_id
    && row.block_key === want.block_key
    && row.type === want.type
    && (row.title ?? '') === want.title
    && (row.body ?? '') === want.body
    && Number(row.sort_order) === want.sort_order
    && same(parse(row.items), want.items);
}
export async function inspect(conn){
  const ids = [...expectedPages.keys()];
  const [pages] = await conn.query(`SELECT id,route,type,status,presentation FROM site_pages WHERE id IN (${ids.map(()=>'?').join(',')}) FOR UPDATE`, ids);
  const byId = new Map(pages.map(p=>[Number(p.id),p]));
  for (const [id,[route,type]] of expectedPages) { const p=byId.get(id); if (!p || p.route!==route || p.type!==type || p.status!=='published') throw new Error(`Page precondition failed: ${id}`); }
  const expectedBlocks = groups.flatMap(g=>g.blocks.map(([id,key,type],index)=>({id,key,type,pageId:g.pageId,want:g.p(index+1)})));
  const blockIds = expectedBlocks.map(b=>b.id);
  const [blocks] = await conn.query(`SELECT id,page_id,block_key,type,title,body,items,status,presentation FROM site_content_blocks WHERE id IN (${blockIds.map(()=>'?').join(',')}) FOR UPDATE`, blockIds);
  const bb = new Map(blocks.map(b=>[Number(b.id),b]));
  const unchanged = new Map();
  for (const b of expectedBlocks) { const row=bb.get(b.id); if(!row || Number(row.page_id)!==b.pageId || row.block_key!==b.key || row.type!==b.type || row.status!=='published') throw new Error(`Block precondition failed: ${b.id}`); unchanged.set(b.id, { title: row.title, body: row.body, items: row.items }); }
  const listingIds = listingBlocks.map((b)=>b.id);
  const [listingRows] = await conn.query(`SELECT id,page_id,block_key,type,title,body,items,status,sort_order,presentation FROM site_content_blocks WHERE id IN (${listingIds.map(()=>'?').join(',')}) FOR UPDATE`, listingIds);
  const listingById = new Map(listingRows.map((b)=>[Number(b.id), b]));
  const listingExpected = [];
  for (const block of listingBlocks) {
    const row = listingById.get(block.id);
    if (!row || Number(row.page_id)!==block.pageId || row.block_key!==block.key || row.type!==block.type || row.status!=='published' || Number(row.sort_order)!==block.sortOrder) throw new Error(`Listing block precondition failed: ${block.id}`);
    listingExpected.push({ row, want: block.want });
    unchanged.set(row.id, { title: row.title, body: row.body, items: row.items });
  }
  const changes=[];
  for (const id of detailPages) { const want={heroVariant:'detail'}; if (!same(parse(byId.get(id).presentation), want)) changes.push({kind:'page', id, want}); }
  for (const b of expectedBlocks) if(!same(parse(bb.get(b.id).presentation), b.want)) changes.push({kind:'block', id:b.id, want:b.want});
  for (const b of listingExpected) if(!same(parse(b.row.presentation), b.want)) changes.push({kind:'block', id:b.row.id, want:b.want});
  const [existing] = await conn.query(`SELECT * FROM site_content_blocks WHERE block_key LIKE 'generic-related-links:%' FOR UPDATE`);
  const ex = new Map();
  for (const row of existing) {
    if (ex.has(row.block_key)) throw new Error(`Duplicate related-links block_key: ${row.block_key}`);
    ex.set(row.block_key, row);
  }
  for (const [pageId, targets] of related) {
    const want = relatedContract(pageId, targets);
    const found = ex.get(want.block_key);
    if (!found) { changes.push({ kind: 'related-create', want }); continue; }
    if (!relatedMatches(found, want)) throw new Error(`Conflicting existing related-links block: ${want.block_key}`);
    if (found.status === 'draft') changes.push({kind:'related-publish', id: found.id, key: want.block_key});
    else if (found.status !== 'published') throw new Error(`Conflicting related-links status: ${want.block_key} status=${found.status}`);
  }
  return { changes, unchanged };
}
export async function applyChanges(conn, changes) {
  for(const c of changes){
    let r;
    if(c.kind==='page') [r]=await conn.execute('UPDATE site_pages SET presentation=? WHERE id=?',[JSON.stringify(c.want),c.id]);
    else if(c.kind==='block') [r]=await conn.execute('UPDATE site_content_blocks SET presentation=? WHERE id=?',[JSON.stringify(c.want),c.id]);
    else if(c.kind==='related-publish') [r]=await conn.execute("UPDATE site_content_blocks SET status='published' WHERE id=? AND status='draft'",[c.id]);
    else if(c.kind==='related-create') [r]=await conn.execute(
      'INSERT INTO site_content_blocks (page_id, block_key, type, title, body, items, sort_order, status) VALUES (?,?,?,?,?,?,?,?)',
      [c.want.page_id, c.want.block_key, c.want.type, c.want.title, c.want.body, JSON.stringify(c.want.items), c.want.sort_order, c.want.status]
    );
    else throw new Error(`Unknown change kind: ${c.kind}`);
    if(r.affectedRows!==1) throw new Error(`Unexpected affectedRows for ${JSON.stringify(c)}`);
  }
}
async function run(mode){ const pool=await createPool(); const conn=await pool.getConnection(); try { await conn.beginTransaction(); const before=await inspect(conn); if(mode==='apply') { await applyChanges(conn, before.changes); const after=await inspect(conn); if(after.changes.length) throw new Error(`Postcondition failed: ${after.changes.length} pending`); for (const [id, old] of before.unchanged) { const [rows]=await conn.query('SELECT title,body,items FROM site_content_blocks WHERE id=?', [id]); if (!same(rows[0], old)) throw new Error(`Content mutation detected: ${id}`); } await conn.commit(); console.log(JSON.stringify({mode, changed: before.changes.length, noop: before.changes.length===0}, null, 2)); } else { await conn.rollback(); console.log(JSON.stringify({mode, pending: before.changes.length, changes: before.changes}, null, 2)); } } catch(e){ await conn.rollback(); throw e; } finally { conn.release(); await pool.end(); } }
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) { const args=process.argv.slice(2); if(args.includes('--help')) console.log(help()); else if(args.includes('--status')) await run('status'); else if(args.includes('--dry-run')) await run('dry-run'); else if(args.includes('--apply')&&args.includes('--yes')) await run('apply'); else { console.error(help()); process.exit(2); } }
