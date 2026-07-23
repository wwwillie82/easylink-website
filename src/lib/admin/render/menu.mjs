import { dirtyStateJs, publishMessageJs } from './client-js.mjs';
import { esc, statusOptions } from './utils.mjs';

const statusLabel = (s) => ({ published: 'Publikus', draft: 'Piszkozat', archived: 'Archivált' }[s] || s || 'draft');
const menuVisibilityLabel = (s) => ({ published: 'Látható', draft: 'Rejtett piszkozat', archived: 'Archivált' }[s] || s || 'draft');
const targetLabel = (t) => ({ page: 'Belső oldal', external: 'Külső link', legacy: 'Legacy URL', group: 'Csoportosító menüpont' }[t] || 'Válassz célt');
const field = (label, html, extra = '') => `<label class="admin-field ${extra}"><span>${label}</span>${html}</label>`;

export function adminRowKey(row = {}) { return row.id ? `id:${row.id}` : `client:${row.client_key}`; }
export function adminParentKey(row = {}) { return row.parent_id || ''; }
export function adminChildrenOf(rows = [], parent = '') { return rows.filter((row) => adminParentKey(row) === parent); }
export function adminDepthOf(rows = [], row, parentOverride) { let d = 1, p = parentOverride ?? adminParentKey(row), seen = new Set(); while (p && !seen.has(p)) { seen.add(p); const parent = rows.find((candidate) => adminRowKey(candidate) === p); if (!parent) break; d += 1; p = adminParentKey(parent); } return d; }
export function adminSubtreeHeight(rows = [], row) { let max = 1; const walk = (node, d) => { max = Math.max(max, d); for (const child of adminChildrenOf(rows, adminRowKey(node))) walk(child, d + 1); }; walk(row, 1); return max; }
export function adminSubtreeRows(rows = [], row) { const out = [row]; const walk = (node) => { for (const child of adminChildrenOf(rows, adminRowKey(node))) { out.push(child); walk(child); } }; walk(row); return out; }
export function adminSubtreeHasPublished(rows = [], row) { return adminSubtreeRows(rows, row).some((item) => item.status === 'published'); }
export function adminSubtreeAllArchived(rows = [], row) { return adminSubtreeRows(rows, row).every((item) => item.status === 'archived'); }
export function adminValidParentKeys(rows = [], row) { const out = ['']; const rowKey = adminRowKey(row); const descendants = new Set(adminSubtreeRows(rows, row).map(adminRowKey)); for (const candidate of rows) { const key = adminRowKey(candidate); if (candidate.target_type !== 'group' || descendants.has(key)) continue; if (adminSubtreeHasPublished(rows, row) && candidate.status !== 'published') continue; if (candidate.status === 'archived' && !adminSubtreeAllArchived(rows, row)) continue; const nextDepth = adminDepthOf(rows, candidate) + 1; if (nextDepth + adminSubtreeHeight(rows, row) - 1 > 3) continue; if (row.target_type === 'group' && nextDepth >= 3) continue; out.push(key); } return out; }
export function adminSortParentFirstRows(rows = []) { const byParent = new Map(); rows.forEach((row, index) => { const key = adminParentKey(row); if (!byParent.has(key)) byParent.set(key, []); byParent.get(key).push({ row, index }); }); for (const list of byParent.values()) list.sort((a, b) => Number(a.row.sort_order || 0) - Number(b.row.sort_order || 0) || a.index - b.index); const out = []; const add = (list) => { for (const item of list || []) { out.push(item.row); add(byParent.get(adminRowKey(item.row))); } }; add(byParent.get('')); return out; }
export function adminMoveSibling(rows = [], key, direction) { const row = rows.find((item) => adminRowKey(item) === key); if (!row) return rows; const siblings = adminChildrenOf(rows, adminParentKey(row)).slice().sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0)); const i = siblings.indexOf(row), j = direction === 'up' ? i - 1 : i + 1; if (j < 0 || j >= siblings.length) return rows; [siblings[i], siblings[j]] = [siblings[j], siblings[i]]; siblings.forEach((item, index) => { item.sort_order = String(index + 1); }); return adminSortParentFirstRows(rows); }
export function adminApplySavedMappings(rows = [], mappings = []) { const byClient = new Map(mappings.map((m) => [String(m.client_key), String(m.id)])); return rows.map((row) => { let parent = row.parent_id || ''; if (parent.startsWith('client:')) { const id = byClient.get(parent.slice(7)); if (id) parent = `id:${id}`; } const id = byClient.get(String(row.client_key || '')) || row.id || ''; return { ...row, id, parent_id: parent, initial_parent: parent }; }); }
export const GROUP_WITH_CHILDREN_TARGET_CHANGE_ERROR = 'A csoportosító menüpont csak a gyermekek áthelyezése vagy archiválása után alakítható kattintható menüponttá.';
export function adminCanChangeTargetType(rows = [], row, nextType = '') { return !(row?.target_type === 'group' && nextType && nextType !== 'group' && adminSubtreeRows(rows, row).slice(1).some((item) => item.status !== 'archived')); }
export function adminDetachArchivedDescendantsForLeaf(rows = [], row) { const descendants = new Set(adminSubtreeRows(rows, row).slice(1).map(adminRowKey)); return rows.map((item) => descendants.has(adminRowKey(item)) && item.status === 'archived' ? { ...item, parent_id: '' } : item); }
export function adminRefreshPreservedParentRef(savedParentRef = '', validParentKeys = [], userChangedParent = false) { const ref = String(savedParentRef || ''); if (!ref) return ''; if (userChangedParent && !validParentKeys.includes(ref)) return ''; return ref; }
export function adminValidateHierarchyDraft(rows = [], pages = []) { const pageMap = new Map((pages || []).map((page) => [String(page.id), page])); const errors = []; const keyOf = adminRowKey; const byKey = new Map(rows.map((row) => [keyOf(row), row])); const children = (key) => rows.filter((row) => adminParentKey(row) === key); const add = (row, message, code = 'ADMIN_NAVIGATION_HIERARCHY_INVALID') => errors.push({ key: keyOf(row), code, message }); for (const row of rows) { const key = keyOf(row); const parent = adminParentKey(row); if (parent === key) add(row, 'A menüpont nem lehet saját maga szülője.', 'ADMIN_NAV_SELF_PARENT'); if (parent && !byKey.has(parent)) add(row, 'A kiválasztott szülő nem található.', 'ADMIN_NAV_MISSING_PARENT'); if (parent && byKey.has(parent) && byKey.get(parent).target_type !== 'group') add(row, 'Csak csoportosító menüpont lehet szülő.', 'ADMIN_NAV_PARENT_NOT_GROUP'); if (row.target_type === 'group') { if (row.href || row.target_page_id || row.title_override) add(row, 'A csoportosító menüpont nem tartalmazhat cél linket.', 'ADMIN_NAV_GROUP_HAS_TARGET'); } else if (children(key).length) add(row, 'Kattintható menüpontnak nem lehet gyermeke.', 'ADMIN_NAV_LEAF_HAS_CHILDREN'); if (row.status === 'published' && row.target_type === 'page') { const page = pageMap.get(String(row.target_page_id || '')); if (!page || page.status !== 'published') add(row, 'Publikus belső menüpont csak publikus oldalra mutathat.', 'ADMIN_NAV_PAGE_NOT_PUBLISHED'); } } const depthOf = (row) => { let depth = 1, parent = adminParentKey(row), seen = new Set([keyOf(row)]); while (parent) { if (seen.has(parent)) return Infinity; seen.add(parent); const parentRow = byKey.get(parent); if (!parentRow) break; depth += 1; parent = adminParentKey(parentRow); } return depth; }; for (const row of rows) { const depth = depthOf(row); if (!Number.isFinite(depth)) add(row, 'Körkörös menühierarchia nem menthető.', 'ADMIN_NAV_CYCLE'); else if (depth > 3) add(row, 'Legfeljebb 3 szintű menü menthető.', 'ADMIN_NAV_TOO_DEEP'); if (row.target_type === 'group' && depth >= 3) add(row, 'A harmadik szinten nem lehet csoportosító menüpont.', 'ADMIN_NAV_THIRD_LEVEL_GROUP'); if (row.status === 'published') { const parent = byKey.get(adminParentKey(row)); if (parent && parent.status !== 'published') add(row, 'Publikus menüpont csak publikus szülő alatt lehet.', 'ADMIN_NAV_PUBLISHED_PARENT'); } if (row.target_type === 'group' && row.status === 'published' && !children(keyOf(row)).some((child) => child.status === 'published')) add(row, 'Publikus csoportnak legalább egy publikus közvetlen gyermeke kell legyen.', 'ADMIN_NAV_PUBLISHED_EMPTY_GROUP'); if (row.target_type === 'group' && row.status === 'archived' && adminSubtreeRows(rows, row).slice(1).some((child) => child.status !== 'archived')) add(row, 'Archivált csoport alatt csak archivált gyermek lehet.', 'ADMIN_NAV_ARCHIVED_ACTIVE_CHILD'); } return { ok: errors.length === 0, errors }; }

export function isValidHttpExternalUrlForMenu(value) {
  try {
    const url = new URL(String(value ?? '').trim());
    return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname || url.host);
  } catch {
    return false;
  }
}

export function buildNavigationPayloadItem(state = {}, pages = []) {
  const pageMap = new Map((pages || []).map((page) => [String(page.id), page]));
  const status = String(state.status || '').trim();
  const sortOrder = String(state.sort_order ?? '').trim();
  if (!/^([1-9]\d*)$/.test(sortOrder)) throw new Error('Hibás sorrend.');
  const sortOrderNumber = Number(sortOrder);
  if (!Number.isSafeInteger(sortOrderNumber) || sortOrderNumber < 1) throw new Error('Hibás sorrend.');
  if (!['published', 'draft', 'archived'].includes(status)) throw new Error('Hibás státusz.');
  const base = { id: String(state.id || '').trim(), sort_order: sortOrder, status };
  const clientKey = String(state.client_key || '').trim();
  const parentId = String(state.parent_id || '').trim();
  if (clientKey) base.client_key = clientKey;
  if (parentId) base.parent_id = parentId;
  if (state.target_type === 'group') {
    const title = String(state.group_title || state.external_title || '').trim();
    if (!title) throw new Error('Csoportosító menüpont felirata kötelező.');
    return { ...base, target_type: 'group', target_page_id: null, title_override: null, title, href: null };
  }
  if (state.target_type === 'page') {
    const page = pageMap.get(String(state.target_page_id || ''));
    if (!page) throw new Error('Válassz létező belső oldalt.');
    const custom = state.title_mode === 'custom';
    const override = custom ? String(state.title_override || '').trim() : '';
    if (custom && !override) throw new Error('Az egyedi menüfelirat nem lehet üres.');
    return { ...base, target_type: 'page', target_page_id: Number(page.id), title_override: custom ? override : null, title: custom ? override : page.title, href: page.route };
  }
  if (state.target_type === 'external') {
    const title = String(state.external_title || '').trim();
    const href = String(state.external_href || '').trim();
    if (!title || !href) throw new Error('Külső linkhez felirat és URL szükséges.');
    if (!isValidHttpExternalUrlForMenu(href)) throw new Error('A külső URL csak érvényes http:// vagy https:// URL lehet.');
    return { ...base, target_type: 'external', target_page_id: null, title_override: null, title, href };
  }
  if (state.target_type === 'legacy') {
    if (state.is_new === '1') throw new Error('Új menüpontnál válassz belső oldalt vagy külső linket.');
    const title = String(state.legacy_title || '').trim();
    const href = String(state.legacy_href || '').trim();
    if (!title || !href) throw new Error('Legacy menüpontnál title és href szükséges.');
    return { ...base, target_type: 'legacy', target_page_id: null, title_override: null, title, href };
  }
  throw new Error('Válassz célt a menüponthoz.');
}


export function effectiveTitleHrefForState(state = {}, pages = []) {
  const pageMap = new Map((pages || []).map((page) => [String(page.id), page]));
  if (state.target_type === 'group') return { title: String(state.group_title || state.external_title || '').trim(), href: '' };
  if (state.target_type === 'page') {
    const page = pageMap.get(String(state.target_page_id || ''));
    const custom = state.title_mode === 'custom';
    const override = String(state.title_override || '').trim();
    return { title: custom && override ? override : (page?.title || ''), href: page?.route || '' };
  }
  if (state.target_type === 'external') return { title: String(state.external_title || ''), href: String(state.external_href || '') };
  return { title: String(state.legacy_title || ''), href: String(state.legacy_href || '') };
}

export function prefillTargetModeFields(previousState = {}, pages = []) {
  return effectiveTitleHrefForState(previousState, pages);
}


export function initializeMenuDirtyState(form, rowsContainer, navSerializer, updateRowFn, setupDirtyFormFn) {
  [...rowsContainer.querySelectorAll('[data-nav-item]')].forEach(updateRowFn);
  return setupDirtyFormFn(form, navSerializer);
}

export function applySavedNavigationRowState(row, savedId, savedItem = {}) {
  if (!row || !savedItem) return;
  const savedType = String(savedItem.target_type || '').trim();
  const idInput = row.querySelector('[data-field="id"]');
  const idLabel = row.querySelector('[data-nav-id-label]');
  if (savedId) {
    if (idInput) idInput.value = String(savedId);
    if (idLabel) idLabel.textContent = String(savedId);
  }
  row.dataset.new = '0';
  if (savedType) row.dataset.initialTarget = savedType;
  const select = row.querySelector('[data-role="target-type"]');
  const legacyOption = select?.querySelector('option[value="legacy"]');
  const legacyHelp = row.querySelector('[data-legacy-help]');
  if (savedType === 'page' || savedType === 'external') {
    if (legacyOption) legacyOption.remove();
    if (legacyHelp) legacyHelp.remove ? legacyHelp.remove() : (legacyHelp.hidden = true);
  }
  if (savedType === 'legacy') {
    if (select && !legacyOption) select.insertAdjacentHTML('beforeend', '<option value="legacy">Régi kézi URL</option>');
    if (legacyHelp) legacyHelp.hidden = false;
  }
}

function pageOptions(pages = [], selected) {
  const selectedId = String(selected || '');
  const hasSelected = pages.some((p) => String(p.id) === selectedId);
  const opts = [`<option value="">Válassz oldalt…</option>`];
  for (const p of pages) {
    const isSelected = String(p.id) === selectedId;
    if (p.status === 'archived' && !isSelected) continue;
    opts.push(`<option value="${esc(p.id)}" ${isSelected ? 'selected' : ''} ${p.status === 'archived' ? 'disabled' : ''}>${esc(p.title)} — ${esc(p.route)} — ${esc(statusLabel(p.status))}</option>`);
  }
  if (selectedId && !hasSelected) opts.push(`<option value="${esc(selectedId)}" selected disabled>Hiányzó oldal #${esc(selectedId)}</option>`);
  return opts.join('');
}
function targetOptions(type, isNew = false) {
  const opts = [];
  if (isNew) opts.push(`<option value="" ${!type ? 'selected' : ''}>Válassz célt</option>`);
  opts.push(`<option value="group" ${type === 'group' ? 'selected' : ''}>Csoportosító menüpont</option>`);
  opts.push(`<option value="page" ${type === 'page' ? 'selected' : ''}>Belső oldal</option>`);
  opts.push(`<option value="external" ${type === 'external' ? 'selected' : ''}>Külső link</option>`);
  if (!isNew && type === 'legacy') opts.push(`<option value="legacy" selected>Régi kézi URL</option>`);
  return opts.join('');
}

function navCard(n, pages = [], index = 0, isNew = false) {
  const type = isNew ? '' : (n.target_type || 'legacy');
  const customTitle = n.target_type === 'page' && n.title_override;
  return `<article class="admin-subcard nav-card ${n.status === 'archived' ? 'nav-card--archived' : ''}" data-nav-item data-new="${isNew ? '1' : '0'}" data-initial-target="${esc(type)}">
<header class="admin-subcard-header nav-card__header"><div><h4><span data-order>${esc(n.sort_order || index + 1)}</span>. <span data-header-title>${esc(n.title || 'Új menüpont')}</span></h4><p class="hint">Azonosító: <code data-nav-id-label>${n.id ? esc(n.id) : 'új'}</code></p></div><div class="nav-card__badges"><span class="status-pill" data-target-badge>${esc(targetLabel(type || ''))}</span><span class="status-pill" data-status-badge>${esc(menuVisibilityLabel(n.status || 'draft'))}</span></div></header>
<p class="msg err" data-row-error hidden></p>
${type === 'legacy' ? '<p class="admin-info" data-legacy-help><strong>Régi kézi URL.</strong> Ez még nem stabil oldalhivatkozás; explicit válts belső oldalra vagy külső linkre.</p>' : ''}
<input data-field="id" type="hidden" value="${esc(n.id || '')}">
<div class="admin-grid admin-grid--compact">
${field('Szülő menüpont', `<select data-field="parent_id" data-role="parent-select" data-initial-parent="${esc(n.parent_id || '')}"><option value="">Root</option></select><small data-depth-label>Szint: 1/3</small>`)}
${field('Cél típusa', `<select data-field="target_type" data-role="target-type">${targetOptions(type, isNew)}</select>`)}
${field('Sorrend', `<input data-field="sort_order" data-role="sort-visible" type="number" min="1" step="1" value="${esc(n.sort_order || index + 1)}">`)}
${field('Menüpont láthatósága', `<select data-field="status">${statusOptions(n.status || 'draft', { published: 'Látható', draft: 'Rejtett piszkozat', archived: 'Archivált' })}</select>`)}
</div>
<div data-mode="group"><div class="admin-grid admin-grid--compact">${field('Csoportosító menüpont felirata', `<input data-role="group-title" value="${esc(type === 'group' ? n.title || '' : '')}">`)}</div></div>
<div data-mode="page">
<div class="admin-grid admin-grid--compact">${field('Céloldal', `<select data-field="target_page_id" data-role="page-select">${pageOptions(pages, n.target_page_id)}</select>`)}${field('Felirat módja', `<select data-role="title-mode"><option value="inherit" ${!customTitle ? 'selected' : ''}>Oldal címének használata</option><option value="custom" ${customTitle ? 'selected' : ''}>Egyedi menüfelirat</option></select>`)}</div>
<div class="target-page-meta" data-role="page-info"><span>Céloldal: <code data-role="page-route"></code></span><span class="status-pill" data-role="page-status-badge">Nincs kiválasztva</span><span class="hint">A céloldal állapota az Oldalak felületen módosítható.</span></div>
<div class="admin-grid admin-grid--compact">${field('Menüpont felirata', `<input data-field="title_override" data-role="title-override" value="${esc(customTitle ? n.title_override || '' : '')}">`)}</div>
</div>
<div data-mode="external"><div class="admin-grid admin-grid--compact">${field('Menüpont felirata', `<input data-field="title" data-role="external-title" value="${esc(type === 'page' ? '' : n.title || '')}">`)}${field('Külső URL', `<input data-field="href" data-role="external-href" placeholder="https://…" value="${esc(type === 'page' ? '' : n.href || '')}">`)}</div></div>
<div data-mode="legacy"><div class="admin-grid admin-grid--compact">${field('Jelenlegi menüpontfelirat', `<input data-role="legacy-title" value="${esc(n.title || '')}">`)}${field('Jelenlegi URL', `<input data-role="legacy-href" value="${esc(n.href || '')}">`)}</div></div>
<div class="admin-field-actions"><button type="button" class="secondary" data-move="up">Fel</button><button type="button" class="secondary" data-move="down">Le</button><button type="button" class="danger" data-archive>Archiválás</button></div>
</article>`;
}

function safeJson(value) { return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'); }

export function navHtml(items, pages = []) {
  const safePages = pages.map((p) => ({ id: Number(p.id), title: String(p.title || ''), route: String(p.route || ''), status: String(p.status || 'draft') }));
  return `<div class="admin-page admin-page--menu"><header class="admin-page-header"><h2>Menüpont-szerkesztő</h2><p class="admin-section-description">Belső oldalak, külső linkek és meglévő legacy URL-ek biztonságos kezelése.</p></header><div id="msg"></div><form class="admin-form admin-section" id="nav-form"><header class="admin-section-header"><div><h3>Menüpontok</h3><p class="admin-section-description">Kártyánként válassz célmódot; archivált rekordok nem törlődnek.</p></div></header><div id="nav-rows" class="nav-card-list">${items.map((n, i) => navCard(n, safePages, i)).join('')}</div><div class="nav-list-actions"><button type="button" id="add-nav">Menüpont hozzáadása</button></div><div class="admin-save-bar"><div><strong>Mentési terület</strong><p class="hint">A gomb módosítás után válik aktívvá; mentés automatikus élesítést indít.</p></div><button type="submit">Mentés és élesítés</button></div></form></div><script>${dirtyStateJs};${publishMessageJs}${menuAdminJs(safePages)}</script>`;
}

function menuAdminJs(pages) { return `
/* PR-A2b compatibility hooks: is-archived-ui; if(j.ok)state.markSaved() */
${isValidHttpExternalUrlForMenu.toString()}
${buildNavigationPayloadItem.toString()}
${effectiveTitleHrefForState.toString()}
${prefillTargetModeFields.toString()}
${initializeMenuDirtyState.toString()}
${applySavedNavigationRowState.toString()}
${adminRowKey.toString()}
${adminParentKey.toString()}
${adminChildrenOf.toString()}
${adminSubtreeRows.toString()}
${adminSubtreeHasPublished.toString()}
${adminApplySavedMappings.toString()}
${adminCanChangeTargetType.toString()}
${adminRefreshPreservedParentRef.toString()}
${adminValidateHierarchyDraft.toString()}
function menuMsg(text,ok=true){const box=document.getElementById('msg');box.replaceChildren();const p=document.createElement('p');p.className='msg '+(ok?'ok':'err');p.textContent=String(text||'');box.appendChild(p);}
function clearHierarchyMsg(){document.querySelectorAll('[data-message-kind="navigation-hierarchy-draft"]').forEach(el=>el.remove());}
function hierarchyMsg(text){clearHierarchyMsg();const box=document.getElementById('msg');const p=document.createElement('p');p.className='msg err';p.dataset.messageKind='navigation-hierarchy-draft';p.textContent=String(text||'');box.appendChild(p);}
const pages=${safeJson(pages)},pageMap=new Map(pages.map(p=>[String(p.id),p]));
const form=document.getElementById('nav-form'),rows=document.getElementById('nav-rows');
const newCardHtml=${JSON.stringify(navCard({ id: '', title: '', href: '', sort_order: 1, status: 'draft' }, pages, 0, true))};
function rawRowState(row){return {is_new:row.dataset.new||'0',id:row.querySelector('[data-field="id"]').value,client_key:row.dataset.clientKey||(row.dataset.clientKey='nav-'+Date.now()+'-'+Math.random().toString(16).slice(2)),parent_id:row.querySelector('[data-field="parent_id"]')?.value||'',group_title:row.querySelector('[data-role="group-title"]')?.value||'',target_type:row.querySelector('[data-role="target-type"]').value,target_page_id:row.querySelector('[data-role="page-select"]').value,title_mode:row.querySelector('[data-role="title-mode"]').value,title_override:row.querySelector('[data-role="title-override"]').value,external_title:row.querySelector('[data-role="external-title"]').value,external_href:row.querySelector('[data-role="external-href"]').value,legacy_title:row.querySelector('[data-role="legacy-title"]').value,legacy_href:row.querySelector('[data-role="legacy-href"]').value,sort_order:row.querySelector('[data-field="sort_order"]').value,status:row.querySelector('[data-field="status"]').value};}
function rowModels(){return [...rows.querySelectorAll('[data-nav-item]')].map((r)=>rawRowState(r));}
const navSerializer=()=>JSON.stringify(rowModels());
function setErr(row,text){const el=row.querySelector('[data-row-error]');el.textContent=text||'';el.hidden=!text;if(text)row.scrollIntoView({block:'center'});}
function rowKey(row){const id=row.querySelector('[data-field="id"]')?.value||'';if(id)return 'id:'+id;if(!row.dataset.clientKey)row.dataset.clientKey='nav-'+Date.now()+'-'+Math.random().toString(16).slice(2);return 'client:'+row.dataset.clientKey;}
function parentKey(row){const v=row.querySelector('[data-role="parent-select"]')?.value||'';return v;}
function childrenOf(key){return [...rows.querySelectorAll('[data-nav-item]')].filter(r=>parentKey(r)===key);}
function descendantsOf(row){const out=new Set();function walk(k){for(const c of childrenOf(k)){const ck=rowKey(c);out.add(ck);walk(ck);}}walk(rowKey(row));return out;}
function depthOf(row,parentOverride){let d=1, seen=new Set(), p=parentOverride!==undefined?parentOverride:parentKey(row);while(p&&!seen.has(p)){seen.add(p);const pr=[...rows.querySelectorAll('[data-nav-item]')].find(r=>rowKey(r)===p);if(!pr)break;d++;p=parentKey(pr);}return d;}
function subtreeHeight(row){let max=1;function walk(r,d){max=Math.max(max,d);for(const c of childrenOf(rowKey(r)))walk(c,d+1);}walk(row,1);return max;}
function subtreeRows(row){const out=[row];function walk(r){for(const c of childrenOf(rowKey(r))){out.push(c);walk(c);}}walk(row);return out;}
function isValidParentFor(row,candidate){if(!candidate)return true;if(candidate.querySelector('[data-role="target-type"]')?.value!=='group')return false;const key=rowKey(candidate);const forbidden=descendantsOf(row);forbidden.add(rowKey(row));if(forbidden.has(key))return false;const subtree=subtreeRows(row);if(subtree.some(r=>r.querySelector('[data-field="status"]')?.value==='published')&&candidate.querySelector('[data-field="status"]')?.value!=='published')return false;if(candidate.querySelector('[data-field="status"]')?.value==='archived'&&!subtree.every(r=>r.querySelector('[data-field="status"]')?.value==='archived'))return false;const nextDepth=depthOf(candidate)+1;if(nextDepth+subtreeHeight(row)-1>3)return false;if(row.querySelector('[data-role="target-type"]')?.value==='group'&&nextDepth>=3)return false;return true;}
function refreshParentOptions(parentRefs){const all=[...rows.querySelectorAll('[data-nav-item]')];for(const row of all){const select=row.querySelector('[data-role="parent-select"]');if(!select)continue;const firstInit=select.dataset.parentInitialized!=='1';const stableKey=row.dataset.clientKey||'';const current=(stableKey&&parentRefs?.has(stableKey)?parentRefs.get(stableKey):undefined) ?? (parentRefs?.get(rowKey(row))) ?? (firstInit ? (select.value||select.dataset.initialParent?(select.value||('id:'+select.dataset.initialParent)):'') : select.value);select.replaceChildren(new Option('Root',''));for(const candidate of all){if(!isValidParentFor(row,candidate))continue;const key=rowKey(candidate);select.appendChild(new Option(candidate.querySelector('[data-header-title]')?.textContent||'Csoport',key));}const validKeys=[...select.options].map(o=>o.value);const preserved=adminRefreshPreservedParentRef(current,validKeys,false);if(preserved&&![...select.options].some(o=>o.value===preserved)){const opt=new Option('Érvénytelen jelenlegi szülő',preserved);opt.disabled=true;opt.dataset.invalidParent='1';select.appendChild(opt);}select.value=preserved;select.dataset.parentInitialized='1';select.dataset.initialParent=select.value;const d=depthOf(row);row.style.marginLeft=((d-1)*24)+'px';row.querySelector('[data-depth-label]').textContent='Szint: '+d+'/3';}}
function sortDomParentFirst(){const all=[...rows.querySelectorAll('[data-nav-item]')];const byParent=new Map();for(const r of all){const k=parentKey(r)||'';if(!byParent.has(k))byParent.set(k,[]);byParent.get(k).push(r);}for(const list of byParent.values())list.sort((a,b)=>(Number(a.querySelector('[data-field="sort_order"]')?.value||0)-Number(b.querySelector('[data-field="sort_order"]')?.value||0))||all.indexOf(a)-all.indexOf(b));const ordered=[];function add(list){for(const r of list||[]){ordered.push(r);add(byParent.get(rowKey(r)));}}add(byParent.get(''));for(const r of ordered)rows.appendChild(r);}
function renumber(){sortDomParentFirst();function walk(list){(list||[]).forEach((r,i)=>{const v=String(i+1);r.querySelector('[data-field="sort_order"]').value=v;r.querySelector('[data-order]').textContent=v;walk(childrenOf(rowKey(r)));});}walk([...rows.querySelectorAll('[data-nav-item]')].filter(r=>!parentKey(r)));refreshParentOptions();form.dispatchEvent(new Event('input',{bubbles:true}));}
function pageTitle(row,p){const mode=row.querySelector('[data-role="title-mode"]').value;const o=row.querySelector('[data-role="title-override"]').value.trim();return mode==='custom'?o:(p?.title||'');}
function effectiveTitleHref(row,type=row.dataset.targetMode||row.querySelector('[data-role="target-type"]').value){if(type==='group')return {title:row.querySelector('[data-role="group-title"]')?.value||'',href:''};if(type==='page'){const p=pageMap.get(row.querySelector('[data-role="page-select"]').value);return {title:p?pageTitle(row,p):(row.querySelector('[data-role="title-override"]').value||''),href:p?.route||row.querySelector('[data-role="page-route"]').textContent||''};}if(type==='external')return {title:row.querySelector('[data-role="external-title"]').value,href:row.querySelector('[data-role="external-href"]').value};return {title:row.querySelector('[data-role="legacy-title"]').value,href:row.querySelector('[data-role="legacy-href"]').value};}
function updateRow(row){const type=row.querySelector('[data-role="target-type"]').value;const legacyHelp=row.querySelector('[data-legacy-help]');if(legacyHelp)legacyHelp.hidden=type!=='legacy';row.dataset.targetMode=type;row.querySelector('[data-target-badge]').textContent=type?({group:'Csoportosító menüpont',page:'Belső oldal',external:'Külső link',legacy:'Legacy URL'}[type]):'Válassz célt';row.querySelector('[data-status-badge]').textContent={published:'Látható',draft:'Rejtett piszkozat',archived:'Archivált'}[row.querySelector('[data-field="status"]').value]||'Rejtett piszkozat';row.querySelectorAll('[data-mode]').forEach(x=>x.hidden=x.dataset.mode!==type);const p=pageMap.get(row.querySelector('[data-role="page-select"]').value);const titleInput=row.querySelector('[data-role="title-override"]');const custom=row.querySelector('[data-role="title-mode"]').value==='custom';if(!custom)titleInput.value=p?.title||'';titleInput.readOnly=!custom;titleInput.setAttribute('aria-readonly',String(!custom));row.querySelector('[data-role="page-route"]').textContent=p?.route||'—';row.querySelector('[data-role="page-status-badge"]').textContent=p?({published:'Publikus',draft:'Piszkozat',archived:'Archivált'}[p.status]||p.status):(row.querySelector('[data-role="page-select"]').value?'Hiányzó oldal':'Nincs kiválasztva');const eff=effectiveTitleHref(row,type).title.trim();row.querySelector('[data-header-title]').textContent=eff||'Új menüpont';const statusSelect=row.querySelector('[data-field="status"]');if(statusSelect&&!statusSelect.dataset.lastValidStatus)statusSelect.dataset.lastValidStatus=statusSelect.value;row.dataset.lastValidStatus=statusSelect?.dataset.lastValidStatus||statusSelect?.value||'';row.classList.toggle('nav-card--archived',row.querySelector('[data-field="status"]').value==='archived');refreshParentOptions();}
function buildPayloadRow(row){return buildNavigationPayloadItem(rawRowState(row),pages);}
function serializeAll(){const out=[],hrefs=new Map();for(const row of rows.querySelectorAll('[data-nav-item]')){try{setErr(row,'');const item=buildPayloadRow(row);const href=String(item.href||'').trim();if(href&&hrefs.has(href))throw new Error('Duplikált menüpont link.');if(href)hrefs.set(href,row);out.push(item);}catch(e){setErr(row,e.message);throw e;}}return out;}
function showHierarchyDraftErrors(result){for(const row of rows.querySelectorAll('[data-nav-item]'))setErr(row,'');if(result?.ok){clearHierarchyMsg();return true;}const byKey=new Map([...rows.querySelectorAll('[data-nav-item]')].map(r=>[rowKey(r),r]));for(const err of result.errors||[]){const row=byKey.get(err.key);if(row)setErr(row,err.message);}hierarchyMsg('A menühierarchia még nem menthető. Javítsd a megjelölt elemeket.');return false;}
function validateCurrentHierarchyDraft(){return adminValidateHierarchyDraft(rowModels(),pages);}
function syncStatusBaselines(){for(const row of rows.querySelectorAll('[data-nav-item]')){const status=row.querySelector('[data-field="status"]');if(status){status.dataset.lastValidStatus=status.value;row.dataset.lastValidStatus=status.value;}}}
function applySavedNavigationState(ids=[],submittedItems=[]){const mappings=arguments[2]||[];const currentRows=[...rows.querySelectorAll('[data-nav-item]')];const models=currentRows.map((row)=>({...rawRowState(row),client_key:row.dataset.clientKey||rawRowState(row).client_key,parent_id:parentKey(row)}));const mapped=adminApplySavedMappings(models,mappings);const parentRefs=new Map(mapped.map((item)=>[String(item.client_key||''),item.parent_id||'']));const idByClient=new Map(mapped.map((item)=>[String(item.client_key||''),String(item.id||'')]));for(const row of currentRows){const ck=row.dataset.clientKey;if(ck&&idByClient.get(ck)){row.querySelector('[data-field="id"]').value=idByClient.get(ck);row.querySelector('[data-nav-id-label]').textContent=idByClient.get(ck);row.dataset.new='0';}const saved=submittedItems.find(item=>String(item.client_key||'')===String(ck||''))||{};applySavedNavigationRowState(row,null,saved);}refreshParentOptions(parentRefs);for(const row of rows.querySelectorAll('[data-nav-item]')){const select=row.querySelector('[data-role="parent-select"]');const ck=row.dataset.clientKey;if(select&&parentRefs.has(ck)){select.value=parentRefs.get(ck)||'';select.dataset.initialParent=select.value;}}sortDomParentFirst();refreshParentOptions();syncStatusBaselines();}
[...rows.querySelectorAll('[data-nav-item]')].forEach(updateRow);sortDomParentFirst();refreshParentOptions();syncStatusBaselines();const state=setupDirtyForm(form,navSerializer);
rows.addEventListener('input',e=>{const row=e.target.closest('[data-nav-item]');if(row&&!e.target.matches('[data-role="target-type"]'))updateRow(row);});rows.addEventListener('change',e=>{const row=e.target.closest('[data-nav-item]');if(!row)return;if(e.target.matches('[data-field="status"]')){updateRow(row);showHierarchyDraftErrors(validateCurrentHierarchyDraft());}if(e.target.matches('[data-role="target-type"]')){if(row.dataset.targetMode==='group'&&e.target.value!=='group'){const descendants=[...descendantsOf(row)].map(k=>[...rows.querySelectorAll('[data-nav-item]')].find(r=>rowKey(r)===k)).filter(Boolean);const active=descendants.filter(r=>r.querySelector('[data-field="status"]')?.value!=='archived');if(active.length){e.target.value='group';setErr(row,'${GROUP_WITH_CHILDREN_TARGET_CHANGE_ERROR}');updateRow(row);form.dispatchEvent(new Event('input',{bubbles:true}));return;}for(const archived of descendants)archived.querySelector('[data-role="parent-select"]').value='';}const previousState={...rawRowState(row),target_type:row.dataset.targetMode};const prev=prefillTargetModeFields(previousState,pages);if(e.target.value==='page'){row.querySelector('[data-role="title-mode"]').value='inherit';row.querySelector('[data-role="title-override"]').value='';}if(e.target.value==='external'){row.querySelector('[data-role="external-title"]').value=prev.title;row.querySelector('[data-role="external-href"]').value=prev.href;}if(e.target.value==='legacy'){row.querySelector('[data-role="legacy-title"]').value=prev.title||row.querySelector('[data-role="legacy-title"]').value;row.querySelector('[data-role="legacy-href"]').value=prev.href||row.querySelector('[data-role="legacy-href"]').value;}}updateRow(row);if(e.target.matches('[data-role="parent-select"]'))renumber();form.dispatchEvent(new Event('input',{bubbles:true}));});
rows.onclick=e=>{const row=e.target.closest('[data-nav-item]');if(!row)return;if(e.target.dataset.archive!==undefined){const status=row.querySelector('[data-field="status"]');status.value='archived';updateRow(row);showHierarchyDraftErrors(validateCurrentHierarchyDraft());form.dispatchEvent(new Event('input',{bubbles:true}));}if(e.target.dataset.move){const siblings=childrenOf(parentKey(row)||'').sort((a,b)=>Number(a.querySelector('[data-field="sort_order"]')?.value||0)-Number(b.querySelector('[data-field="sort_order"]')?.value||0));const i=siblings.indexOf(row);const j=e.target.dataset.move==='up'?i-1:i+1;if(j>=0&&j<siblings.length){[siblings[i],siblings[j]]=[siblings[j],siblings[i]];siblings.forEach((r,idx)=>{r.querySelector('[data-field="sort_order"]').value=String(idx+1);});renumber();}}};
document.getElementById('add-nav').onclick=()=>{rows.insertAdjacentHTML('beforeend',newCardHtml);renumber();[...rows.querySelectorAll('[data-nav-item]')].forEach(updateRow);rows.lastElementChild?.scrollIntoView({block:'center'});};
form.onsubmit=async e=>{e.preventDefault();if(!state.changed())return;let items;try{items=serializeAll();}catch(error){menuMsg(error.message,false);return;}if(!showHierarchyDraftErrors(adminValidateHierarchyDraft(items,pages)))return;state.markSaving();const r=await fetch('/api/admin/navigation',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({items})});const j=await r.json();if(j.ok){applySavedNavigationState(j.data?.navigationIds||[],items,j.data?.navigationMappings||[]);state.markSaved();menuMsg(pm(j.publish),j.publish?.ok);return;}menuMsg(j.error?.message||'Mentési hiba',false);};`; }
