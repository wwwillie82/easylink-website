import { fileURLToPath } from 'node:url';
import { createPool } from '../src/lib/db/client.mjs';

export const expectedPages = new Map([
  [3, ['/megoldasaink/penzugy-szamlazas/', 'solution_detail']], [4, ['/megoldasaink/hr-munkaugy/', 'solution_detail']], [5, ['/megoldasaink/crm-ugyfelkezeles/', 'solution_detail']], [6, ['/megoldasaink/dokumentumkezeles-adminisztracio/', 'solution_detail']], [7, ['/megoldasaink/kontrolling/', 'solution_detail']], [8, ['/megoldasaink/ai-asszisztens/', 'solution_detail']],
  [10, ['/kinek-szol/hotelek-szallashelyek/', 'audience_detail']], [11, ['/kinek-szol/vendeglatohelyek/', 'audience_detail']], [12, ['/kinek-szol/szolgaltato-vallalkozasok/', 'audience_detail']],
  [13, ['/integraciok/', 'integrations']], [14, ['/arak/', 'pricing']], [15, ['/kapcsolat/', 'contact']],
]);
const detailPages = [3,4,5,6,7,8,10,11,12];
const groups = [
  { pageId: 13, blocks: [[51,'/integraciok/:text:0','text'],[52,'/integraciok/:cards:1','cards']], p: (pos) => ({ sectionGroupKey: 'integrations-main', sectionTheme: 'gradient-light', layout: 'stack', columnPosition: pos }) },
  { pageId: 14, blocks: [[53,'/arak/:feature-list:0','feature-list'],[117,'golden:20:text:Demó alapján pontosítunk','text']], p: (pos) => ({ sectionGroupKey: 'pricing-main', sectionTheme: 'default', layout: 'grid', gridColumns: 2, columnRatio: '1:1', columnPosition: pos, surface: 'polished' }) },
  { pageId: 15, blocks: [[55,'/kapcsolat/:cta:0','cta'],[56,'/kapcsolat/:feature-list:1','feature-list']], p: (pos) => ({ sectionGroupKey: 'contact-main', sectionTheme: 'default', layout: 'grid', gridColumns: 2, columnRatio: '0.85:1.15', columnPosition: pos, surface: 'polished' }) },
];
const related = new Map([[3,[4,5,6]],[4,[3,5,6]],[5,[3,4,6]],[6,[3,4,5]],[7,[3,4,5]],[8,[3,4,5]],[10,[11,12]],[11,[10,12]],[12,[10,11]]]);
function help(){ return `Usage: node scripts/adopt-generic-public-presentation.mjs --status|--dry-run|--apply --yes|--help`; }
function same(a,b){ return JSON.stringify(a) === JSON.stringify(b); }
function parse(v){ if(!v) return null; return typeof v === 'string' ? JSON.parse(v) : v; }
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
  const changes=[];
  for (const id of detailPages) { const want={heroVariant:'detail'}; if (!same(parse(byId.get(id).presentation), want)) changes.push({kind:'page', id, want}); }
  for (const b of expectedBlocks) if(!same(parse(bb.get(b.id).presentation), b.want)) changes.push({kind:'block', id:b.id, want:b.want});
  const [existing] = await conn.query(`SELECT * FROM site_content_blocks WHERE block_key LIKE 'generic-related-links:%' FOR UPDATE`);
  const ex = new Map(existing.map(b=>[b.block_key,b]));
  for (const [pageId, targets] of related) {
    const key = `generic-related-links:${pageId}`;
    const wantItems = targets.map(id=>({target_type:'page',target_page_id:id,title_override:''}));
    const found = ex.get(key);
    if (found) {
      if (Number(found.page_id)!==pageId || found.type!=='related-links' || found.status!=='draft' || Number(found.sort_order)!==800 || !same(parse(found.items), wantItems)) throw new Error(`Conflicting existing related-links block: ${key}`);
    } else changes.push({kind:'related', pageId, key, wantItems});
  }
  return { changes, unchanged };
}
async function run(mode){ const pool=await createPool(); const conn=await pool.getConnection(); try { await conn.beginTransaction(); const before=await inspect(conn); if(mode==='apply') { for(const c of before.changes){ let r; if(c.kind==='page') [r]=await conn.execute('UPDATE site_pages SET presentation=? WHERE id=?',[JSON.stringify(c.want),c.id]); else if(c.kind==='block') [r]=await conn.execute('UPDATE site_content_blocks SET presentation=? WHERE id=?',[JSON.stringify(c.want),c.id]); else [r]=await conn.execute('INSERT INTO site_content_blocks (page_id,block_key,type,title,body,items,presentation,sort_order,status) VALUES (?,?,?,?,?,?,?,?,?)',[c.pageId,c.key,'related-links','Kapcsolódó oldalak','',JSON.stringify(c.wantItems),null,800,'draft']); if(r.affectedRows!==1) throw new Error(`Unexpected affectedRows for ${JSON.stringify(c)}`); } const after=await inspect(conn); if(after.changes.length) throw new Error(`Postcondition failed: ${after.changes.length} pending`); for (const [id, old] of before.unchanged) { const [rows]=await conn.query('SELECT title,body,items FROM site_content_blocks WHERE id=?', [id]); if (!same(rows[0], old)) throw new Error(`Content mutation detected: ${id}`); } await conn.commit(); console.log(JSON.stringify({mode, changed: before.changes.length, noop: before.changes.length===0}, null, 2)); } else { await conn.rollback(); console.log(JSON.stringify({mode, pending: before.changes.length, changes: before.changes}, null, 2)); } } catch(e){ await conn.rollback(); throw e; } finally { conn.release(); await pool.end(); } }
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) { const args=process.argv.slice(2); if(args.includes('--help')) console.log(help()); else if(args.includes('--status')) await run('status'); else if(args.includes('--dry-run')) await run('dry-run'); else if(args.includes('--apply')&&args.includes('--yes')) await run('apply'); else { console.error(help()); process.exit(2); } }
