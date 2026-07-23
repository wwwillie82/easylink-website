export const NAV_MAX_DEPTH = 3;
export const NAV_RUNTIME_FIELDS = new Set(['parent_ref', '__key', '__index', '__depth']);
export const navKey = (item) => { if (item?.id && /^\d+$/.test(String(item.id))) return `id:${Number(item.id)}`; const c=String(item?.client_key || item?.clientKey || item?._client_key || '').trim(); return c ? `client:${c}` : null; };
export function normalizeNavigationParentRef(item = {}) {
  const raw = item.parent_ref ?? item.parentRef ?? item.parent_id ?? item.parentId ?? null;
  if (raw === null || raw === undefined || String(raw).trim() === '') return null;
  if (/^\d+$/.test(String(raw))) return `id:${Number(raw)}`;
  const s = String(raw).trim();
  return s.startsWith('id:') || s.startsWith('client:') ? s : `client:${s}`;
}
export function normalizeNavigationRow(item = {}) {
  const type = String(item.target_type || 'legacy').trim().toLowerCase();
  const parentRef = normalizeNavigationParentRef(item);
  return { ...item, target_type: type, parent_ref: parentRef, parent_id: parentRef?.startsWith('id:') ? Number(parentRef.slice(3)) : null, sort_order: Number(item.sort_order ?? item.sortOrder ?? 0), status: String(item.status || 'draft').trim().toLowerCase() };
}
export function validateNavigationHierarchy(items = [], { pagesById = new Map() } = {}) {
  const rows = items.map(normalizeNavigationRow); const errors = [];
  const byKey = new Map(); rows.forEach((r,i)=>{ const k=navKey(r)||`row:${i}`; r.__key=k; r.__index=i; if(byKey.has(k)) errors.push({code:'NAVIGATION_DUPLICATE_KEY', item:r}); else byKey.set(k,r); });
  const children = new Map(); for (const r of rows) children.set(r.__key, []);
  for (const r of rows) if (r.parent_ref) { if (r.parent_ref === r.__key) errors.push({code:'NAVIGATION_SELF_PARENT', item:r}); const p=byKey.get(r.parent_ref); if(!p) errors.push({code:'NAVIGATION_PARENT_MISSING', item:r}); else children.get(p.__key).push(r); }
  const visiting=new Set(), visited=new Set(), depth=new Map();
  function walk(r,d){ if(visiting.has(r.__key)){errors.push({code:'NAVIGATION_CYCLE', item:r}); return;} if(visited.has(r.__key)) return; visiting.add(r.__key); depth.set(r.__key,d); r.__depth=d; if(d>NAV_MAX_DEPTH) errors.push({code:'NAVIGATION_TOO_DEEP', item:r}); for(const c of children.get(r.__key)||[]) walk(c,d+1); visiting.delete(r.__key); visited.add(r.__key); }
  for(const r of rows.filter(r=>!r.parent_ref)) walk(r,1); for(const r of rows) if(!visited.has(r.__key)) walk(r,1);
  for (const r of rows) {
    const type=r.target_type; const kids=children.get(r.__key)||[]; const d=depth.get(r.__key)||1;
    if (kids.length && type !== 'group') errors.push({code:'NAVIGATION_LEAF_HAS_CHILDREN', item:r});
    if (r.parent_ref && byKey.get(r.parent_ref)?.target_type !== 'group') errors.push({code:'NAVIGATION_PARENT_NOT_GROUP', item:r});
    if (type === 'group') {
      if (r.href || r.target_page_id || r.title_override) errors.push({code:'NAVIGATION_GROUP_HAS_TARGET', item:r});
      if (d >= NAV_MAX_DEPTH) errors.push({code:'NAVIGATION_THIRD_LEVEL_GROUP', item:r});
      if (r.status === 'published' && !kids.some(c=>c.status==='published')) errors.push({code:'NAVIGATION_PUBLISHED_EMPTY_GROUP', item:r});
      if (r.status === 'archived' && kids.some(c=>c.status !== 'archived')) errors.push({code:'NAVIGATION_ARCHIVE_GROUP_WITH_ACTIVE_CHILDREN', item:r});
    } else {
      if (!['legacy','page','external'].includes(type)) errors.push({code:'NAVIGATION_TARGET_TYPE_INVALID', item:r});
      if (!r.href) errors.push({code:'NAVIGATION_LEAF_HREF_REQUIRED', item:r});
    }
    if (r.status === 'published' && r.parent_ref) { const p=byKey.get(r.parent_ref); if (p && p.status !== 'published') errors.push({code:'NAVIGATION_PUBLISHED_CHILD_UNPUBLISHED_PARENT', item:r}); }
    if (r.status === 'published' && type === 'page') { const p=pagesById.get(Number(r.target_page_id)); if (p && String(p.status)!=='published') errors.push({code:'NAVIGATION_TARGET_PAGE_NOT_PUBLISHED', item:r}); }
  }
  return { ok: errors.length===0, errors, rows, depth, children, byKey };
}
export const navSort = (a,b)=>(Number(a.sort_order??a.sortOrder??0)-Number(b.sort_order??b.sortOrder??0))||(Number(a.id||0)-Number(b.id||0));
export function sortNavigationRowsParentFirst(items = []) { const v=validateNavigationHierarchy(items); const out=[]; const roots=v.rows.filter(r=>!r.parent_ref).sort(navSort); function add(r){out.push(r); for(const c of (v.children.get(r.__key)||[]).sort(navSort)) add(c);} roots.forEach(add); return out; }
export function sortNavigationParentFirst(items = []) { return sortNavigationRowsParentFirst(items).map((row)=>toNavigationPersistenceRow(row)); }
export function toNavigationPersistenceRow(row = {}, { parentId } = {}) { const out={}; for (const [k,v] of Object.entries(row)) if(!NAV_RUNTIME_FIELDS.has(k) && v !== undefined) out[k]=v; if (parentId !== undefined) out.parent_id = parentId; else if (out.parent_ref && String(out.parent_ref).startsWith('id:')) out.parent_id = Number(String(out.parent_ref).slice(3)); delete out.parent_ref; delete out.clientKey; delete out._client_key; return out; }
export function buildPublicNavigationTree(items = []) { const active=items.map(normalizeNavigationRow).filter(r=>r.status==='published'); const v=validateNavigationHierarchy(active); if(!v.ok) return []; const roots=v.rows.filter(r=>!r.parent_ref).sort(navSort); const map=(r)=>({ title:r.title, href:r.target_type==='group'?undefined:r.href, target_type:r.target_type, sortOrder:r.sort_order, children:(v.children.get(r.__key)||[]).filter(c=>c.status==='published').sort(navSort).map(map) }); return roots.map(map); }
