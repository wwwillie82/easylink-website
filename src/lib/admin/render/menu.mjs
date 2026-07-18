import { dirtyStateJs, publishMessageJs } from './client-js.mjs';
import { esc, statusOptions } from './utils.mjs';

const statusLabel = (s) => ({ published: 'Publikus', draft: 'Piszkozat', archived: 'Archivált' }[s] || s || 'draft');
const menuVisibilityLabel = (s) => ({ published: 'Látható', draft: 'Rejtett piszkozat', archived: 'Archivált' }[s] || s || 'draft');
const targetLabel = (t) => ({ page: 'Belső oldal', external: 'Külső link', legacy: 'Régi kézi URL' }[t] || 'Válassz célt');
const field = (label, html, extra = '') => `<label class="admin-field ${extra}"><span>${label}</span>${html}</label>`;

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
${field('Cél típusa', `<select data-field="target_type" data-role="target-type">${targetOptions(type, isNew)}</select>`)}
${field('Sorrend', `<input data-field="sort_order" data-role="sort-visible" type="number" min="1" step="1" value="${esc(n.sort_order || index + 1)}">`)}
${field('Menüpont láthatósága', `<select data-field="status">${statusOptions(n.status || 'draft', { published: 'Látható', draft: 'Rejtett piszkozat', archived: 'Archivált' })}</select>`)}
</div>
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
function menuMsg(text,ok=true){const box=document.getElementById('msg');box.replaceChildren();const p=document.createElement('p');p.className='msg '+(ok?'ok':'err');p.textContent=String(text||'');box.appendChild(p);}
const pages=${safeJson(pages)},pageMap=new Map(pages.map(p=>[String(p.id),p]));
const form=document.getElementById('nav-form'),rows=document.getElementById('nav-rows');
const newCardHtml=${JSON.stringify(navCard({ id: '', title: '', href: '', sort_order: 1, status: 'draft' }, pages, 0, true))};
function rawRowState(row){return {is_new:row.dataset.new||'0',id:row.querySelector('[data-field="id"]').value,target_type:row.querySelector('[data-role="target-type"]').value,target_page_id:row.querySelector('[data-role="page-select"]').value,title_mode:row.querySelector('[data-role="title-mode"]').value,title_override:row.querySelector('[data-role="title-override"]').value,external_title:row.querySelector('[data-role="external-title"]').value,external_href:row.querySelector('[data-role="external-href"]').value,legacy_title:row.querySelector('[data-role="legacy-title"]').value,legacy_href:row.querySelector('[data-role="legacy-href"]').value,sort_order:row.querySelector('[data-field="sort_order"]').value,status:row.querySelector('[data-field="status"]').value};}
const navSerializer=()=>JSON.stringify([...rows.querySelectorAll('[data-nav-item]')].map(rawRowState));
function setErr(row,text){const el=row.querySelector('[data-row-error]');el.textContent=text||'';el.hidden=!text;if(text)row.scrollIntoView({block:'center'});}
function renumber(){[...rows.querySelectorAll('[data-nav-item]')].forEach((r,i)=>{const v=String(i+1);r.querySelector('[data-field="sort_order"]').value=v;r.querySelector('[data-order]').textContent=v;});form.dispatchEvent(new Event('input',{bubbles:true}));}
function pageTitle(row,p){const mode=row.querySelector('[data-role="title-mode"]').value;const o=row.querySelector('[data-role="title-override"]').value.trim();return mode==='custom'?o:(p?.title||'');}
function effectiveTitleHref(row,type=row.dataset.targetMode||row.querySelector('[data-role="target-type"]').value){if(type==='page'){const p=pageMap.get(row.querySelector('[data-role="page-select"]').value);return {title:p?pageTitle(row,p):(row.querySelector('[data-role="title-override"]').value||''),href:p?.route||row.querySelector('[data-role="page-route"]').textContent||''};}if(type==='external')return {title:row.querySelector('[data-role="external-title"]').value,href:row.querySelector('[data-role="external-href"]').value};return {title:row.querySelector('[data-role="legacy-title"]').value,href:row.querySelector('[data-role="legacy-href"]').value};}
function updateRow(row){const type=row.querySelector('[data-role="target-type"]').value;const legacyHelp=row.querySelector('[data-legacy-help]');if(legacyHelp)legacyHelp.hidden=type!=='legacy';row.dataset.targetMode=type;row.querySelector('[data-target-badge]').textContent=type?({page:'Belső oldal',external:'Külső link',legacy:'Régi kézi URL'}[type]):'Válassz célt';row.querySelector('[data-status-badge]').textContent={published:'Látható',draft:'Rejtett piszkozat',archived:'Archivált'}[row.querySelector('[data-field="status"]').value]||'Rejtett piszkozat';row.querySelectorAll('[data-mode]').forEach(x=>x.hidden=x.dataset.mode!==type);const p=pageMap.get(row.querySelector('[data-role="page-select"]').value);const titleInput=row.querySelector('[data-role="title-override"]');const custom=row.querySelector('[data-role="title-mode"]').value==='custom';if(!custom)titleInput.value=p?.title||'';titleInput.readOnly=!custom;titleInput.setAttribute('aria-readonly',String(!custom));row.querySelector('[data-role="page-route"]').textContent=p?.route||'—';row.querySelector('[data-role="page-status-badge"]').textContent=p?({published:'Publikus',draft:'Piszkozat',archived:'Archivált'}[p.status]||p.status):(row.querySelector('[data-role="page-select"]').value?'Hiányzó oldal':'Nincs kiválasztva');const eff=effectiveTitleHref(row,type).title.trim();row.querySelector('[data-header-title]').textContent=eff||'Új menüpont';row.classList.toggle('nav-card--archived',row.querySelector('[data-field="status"]').value==='archived');}
function buildPayloadRow(row){return buildNavigationPayloadItem(rawRowState(row),pages);}
function serializeAll(){const out=[],hrefs=new Map();for(const row of rows.querySelectorAll('[data-nav-item]')){try{setErr(row,'');const item=buildPayloadRow(row);const href=String(item.href||'').trim();if(hrefs.has(href))throw new Error('Duplikált menüpont link.');hrefs.set(href,row);out.push(item);}catch(e){setErr(row,e.message);throw e;}}return out;}
function applySavedNavigationState(ids=[],submittedItems=[]){[...rows.querySelectorAll('[data-nav-item]')].forEach((row,i)=>{applySavedNavigationRowState(row,ids[i],submittedItems[i]);updateRow(row);});}
const state=initializeMenuDirtyState(form,rows,navSerializer,updateRow,setupDirtyForm);
rows.addEventListener('input',e=>{const row=e.target.closest('[data-nav-item]');if(row&&!e.target.matches('[data-role="target-type"]'))updateRow(row);});rows.addEventListener('change',e=>{const row=e.target.closest('[data-nav-item]');if(!row)return;if(e.target.matches('[data-role="target-type"]')){const previousState={...rawRowState(row),target_type:row.dataset.targetMode};const prev=prefillTargetModeFields(previousState,pages);if(e.target.value==='page'){row.querySelector('[data-role="title-mode"]').value='inherit';row.querySelector('[data-role="title-override"]').value='';}if(e.target.value==='external'){row.querySelector('[data-role="external-title"]').value=prev.title;row.querySelector('[data-role="external-href"]').value=prev.href;}if(e.target.value==='legacy'){row.querySelector('[data-role="legacy-title"]').value=prev.title||row.querySelector('[data-role="legacy-title"]').value;row.querySelector('[data-role="legacy-href"]').value=prev.href||row.querySelector('[data-role="legacy-href"]').value;}}updateRow(row);form.dispatchEvent(new Event('input',{bubbles:true}));});
rows.onclick=e=>{const row=e.target.closest('[data-nav-item]');if(!row)return;if(e.target.dataset.archive!==undefined){row.querySelector('[data-field="status"]').value='archived';updateRow(row);form.dispatchEvent(new Event('input',{bubbles:true}));}if(e.target.dataset.move){const sib=e.target.dataset.move==='up'?row.previousElementSibling:row.nextElementSibling;if(sib){e.target.dataset.move==='up'?sib.before(row):sib.after(row);renumber();}}};
document.getElementById('add-nav').onclick=()=>{rows.insertAdjacentHTML('beforeend',newCardHtml);renumber();[...rows.querySelectorAll('[data-nav-item]')].forEach(updateRow);rows.lastElementChild?.scrollIntoView({block:'center'});};
form.onsubmit=async e=>{e.preventDefault();if(!state.changed())return;let items;try{items=serializeAll();}catch(error){menuMsg(error.message,false);return;}state.markSaving();const r=await fetch('/api/admin/navigation',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({items})});const j=await r.json();if(j.ok){applySavedNavigationState(j.data?.navigationIds||[],items);state.markSaved();menuMsg(pm(j.publish),j.publish?.ok);return;}menuMsg(j.error?.message||'Mentési hiba',false);};`; }
