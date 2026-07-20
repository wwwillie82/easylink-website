import { esc, statusOptions } from './utils.mjs';
import { mediaPickerJs } from './media.mjs';
import { allCanonicalHomeBlockKeys, HOME_HERO_META_KEY, HOME_INTRO_KEY, HOME_SOLUTIONS_KEY, HOME_AI_KEY, HOME_INTEGRATIONS_KEY, HOME_AUDIENCES_KEY } from '../../content/home-blocks.mjs';

const parseItems = (v) => { try { return Array.isArray(v) ? v : (v ? JSON.parse(v) : []); } catch { return []; } };
const byKey = (blocks) => new Map((blocks || []).map((b)=>[b.block_key, b]));
const rowBtns = '<button type="button" data-home-move="up" class="secondary">Fel</button><button type="button" data-home-move="down" class="secondary">Le</button><button type="button" data-home-remove class="danger">Törlés</button>';
const pageGroups = (pages = []) => ({ solution_detail: pages.filter((p)=>p.status === 'published' && p.type === 'solution_detail').map(optionPage), audience_detail: pages.filter((p)=>p.status === 'published' && p.type === 'audience_detail').map(optionPage), solutions_index: pages.filter((p)=>p.status === 'published' && p.type === 'solutions_index').map(optionPage) });
const optionPage = (p) => ({ id: Number(p.id), title: String(p.title || ''), route: String(p.route || ''), type: String(p.type || '') });
const optionHtml = (options = [], selected) => options.map((p)=>`<option value="${esc(p.id)}" ${Number(selected)===Number(p.id)?'selected':''}>${esc(p.title)} — ${esc(p.route)}</option>`).join('');
function blockShell(block, inner) { return `<article class="admin-subcard home-canonical-block" data-home-block="${esc(block.block_key)}"><header><h4>${esc(block.block_key)} <small>/${esc(block.type)}</small></h4><p class="hint">A block_key és type nem szerkeszthető.</p></header><input type="hidden" data-home-block-key value="${esc(block.block_key)}"><input type="hidden" data-home-block-type value="${esc(block.type)}"><div class="admin-grid"><label>Státusz<select data-home-status>${statusOptions(block.status, { published:'published', draft:'draft', archived:'archived' })}</select></label><label>Sorrend<input data-home-sort type="number" value="${esc(block.sort_order)}"></label></div>${inner}</article>`; }
function heroMeta(block) { const items=parseItems(block.items); return blockShell(block, `<label data-field-path="blocks.${HOME_HERO_META_KEY}.title">Subtitle / title<input data-home-title value="${esc(block.title)}"></label><input type="hidden" data-home-body value="${esc(block.body||'')}"><div data-home-list="benefits">${(items.length?items:[{title:'',text:''}]).map((i)=>`<div class="item-row" data-home-item="benefit"><label>Benefit title<input data-benefit-title value="${esc(i.title||'')}"></label><label>Benefit text<input data-benefit-text value="${esc(i.text||'')}"></label>${rowBtns}</div>`).join('')}</div><button type="button" data-home-add="benefit">Új előny</button>`); }
function intro(block) { const items=parseItems(block.items); return blockShell(block, `<label data-field-path="blocks.${HOME_INTRO_KEY}.title">Eyebrow / title<input data-home-title value="${esc(block.title)}"></label><label data-field-path="blocks.${HOME_INTRO_KEY}.items.0.text">Heading<input data-intro-heading value="${esc(items[0]?.heading||items[0]?.text||'')}"></label><label>Body<textarea data-home-body>${esc(block.body||'')}</textarea></label>`); }
function cardRow(i, options, action=false) { const target=i.target_type||'legacy'; return `<div class="item-row" data-home-item="${action?'section-action':'card'}"><label>Target<select data-card-target><option value="page" ${target==='page'?'selected':''}>page</option><option value="legacy" ${target==='legacy'?'selected':''}>legacy</option><option value="external" ${target==='external'?'selected':''}>external</option></select></label><label data-card-page-label>Page<select data-card-page><option value="">Válassz</option>${optionHtml(options,i.target_page_id)}</select></label><label data-card-href-label>URL<input data-card-href value="${esc(i.href||i.url||'')}"></label><label>${action?'Label':'Title override'}<input data-card-title value="${esc(i.title_override||i.title||i.label||'')}"></label>${action?'':`<label>Text override<input data-card-text value="${esc(i.text_override||i.text||'')}"></label><label>Link label<input data-card-link-label value="${esc(i.linkLabel||i.label||'')}"></label><label>Badge<input data-card-badge value="${esc(i.badge||i.order||'')}"></label>`}${rowBtns}</div>`; }
function cards(block, groups, key) { const items=parseItems(block.items); const cards=items.filter((i)=>(i.kind||'card')==='card'); const action=items.find((i)=>i.kind==='section-action'); const detail=key===HOME_AUDIENCES_KEY?'audience_detail':'solution_detail'; return blockShell(block, `<label data-field-path="blocks.${key}.title">Section title<input data-home-title value="${esc(block.title)}"></label><label>Section body<textarea data-home-body>${esc(block.body||'')}</textarea></label><div data-home-list="cards">${(cards.length?cards:[{kind:'card',target_type:'page'}]).map((i)=>cardRow(i,groups[detail])).join('')}</div><button type="button" data-home-add="card">Új kártya</button>${key===HOME_SOLUTIONS_KEY?`<h5>Section action</h5><div data-home-list="section-action">${cardRow(action||{kind:'section-action',target_type:'page'},groups.solutions_index,true)}</div>`:'<p class="hint">Section-action ebben a blokkban tiltott.</p>'}`); }
function ai(block) { const items=parseItems(block.items); const heading=items.find((i)=>i.kind==='heading')||{}; const sources=items.filter((i)=>i.kind==='source'); const messages=items.filter((i)=>i.kind==='message'); return blockShell(block, `<label data-field-path="blocks.${HOME_AI_KEY}.title">Eyebrow / title<input data-home-title value="${esc(block.title)}"></label><label data-field-path="blocks.${HOME_AI_KEY}.items.0.text">Heading<input data-ai-heading value="${esc(heading.text||heading.heading||'')}"></label><label>Body<textarea data-home-body>${esc(block.body||'')}</textarea></label><h5>Sources</h5><div data-home-list="sources">${(sources.length?sources:[{kind:'source',title:''}]).map((i)=>`<div class="item-row" data-home-item="source"><label>Source title<input data-source-title value="${esc(i.title||'')}"></label>${rowBtns}</div>`).join('')}</div><button type="button" data-home-add="source">Új source</button><h5>Messages</h5><div data-home-list="messages">${(messages.length?messages:[{kind:'message',role:'user',text:''},{kind:'message',role:'assistant',text:''}]).map((i)=>`<div class="item-row" data-home-item="message"><label>Role<select data-message-role><option value="user" ${i.role==='user'?'selected':''}>user</option><option value="assistant" ${i.role==='assistant'?'selected':''}>assistant</option></select></label><label>Title<input data-message-title value="${esc(i.title||'')}"></label><label>Text<input data-message-text value="${esc(i.text||'')}"></label>${rowBtns}</div>`).join('')}</div><button type="button" data-home-add="message">Új message</button>`); }
function integrations(block) { const items=parseItems(block.items); const heading=items.find((i)=>i.kind==='heading')||{}; const nodes=items.filter((i)=>i.kind==='node'); return blockShell(block, `<label data-field-path="blocks.${HOME_INTEGRATIONS_KEY}.title">Eyebrow / title<input data-home-title value="${esc(block.title)}"></label><label data-field-path="blocks.${HOME_INTEGRATIONS_KEY}.items.0.text">Heading<input data-integrations-heading value="${esc(heading.text||heading.heading||'')}"></label><label>Body<textarea data-home-body>${esc(block.body||'')}</textarea></label><div data-home-list="nodes">${(nodes.length?nodes:[{kind:'node',id:'node-1',label:''}]).map((i)=>`<div class="item-row" data-home-item="node"><label>Node ID<input data-node-id value="${esc(i.id||'')}"></label><label>Label<input data-node-label value="${esc(i.label||'')}"></label>${rowBtns}</div>`).join('')}</div><button type="button" data-home-add="node">Új node</button>`); }

function homeErrorDoc(root) { return root?.ownerDocument || root; }
function homeQs(root, selector) { return root?.querySelector?.(selector) || null; }
function homeQsa(root, selector) { return Array.from(root?.querySelectorAll?.(selector) || []); }
function homeCardField(row, field) {
  if (!row) return null;
  if (field === 'target_page_id') return homeQs(row, '[data-card-page]') || row;
  if (field === 'href') return homeQs(row, '[data-card-href]') || row;
  if (field === 'target_type') return homeQs(row, '[data-card-target]') || row;
  if (field === 'title_override' || field === 'title') return homeQs(row, '[data-card-title]') || row;
  if (field === 'text_override' || field === 'text') return homeQs(row, '[data-card-text]') || row;
  if (field === 'linkLabel') return homeQs(row, '[data-card-link-label]') || row;
  if (field === 'badge' || field === 'order') return homeQs(row, '[data-card-badge]') || row;
  if (field === 'kind') return row;
  return row;
}
export function targetForHomeErrorPath(root, path) {
  const editor = homeQs(root, '[data-home-editor]');
  if (path === 'editor_revision') return editor;
  if (path === 'page.hero_video.mediaPath') return homeQs(root, '[name="hero_video_media_path"]') || editor;
  if (path === 'page.hero_video.youtubeUrl') return homeQs(root, '[name="hero_video_youtube_url"]') || editor;
  if (path?.startsWith?.('page.')) return homeQs(root, '[name="' + path.slice(5) + '"]') || editor;
  const m = /^blocks\.([^.]*)\.(?:items\.(\d+)\.)?(.+)$/.exec(path || '');
  if (!m) return null;
  const block = homeQs(root, '[data-home-block="' + m[1] + '"]');
  if (!block) return null;
  const index = m[2] === undefined ? null : Number(m[2]);
  const field = m[3];
  if (index === null) return field === 'title' ? (homeQs(block, '[data-home-title]') || block) : block;
  if (m[1] === 'home:hero-meta') {
    const row = homeQsa(block, '[data-home-item="benefit"]')[index];
    if (!row) return block;
    if (field === 'title') return homeQs(row, '[data-benefit-title]') || row;
    if (field === 'text') return homeQs(row, '[data-benefit-text]') || row;
    return row;
  }
  if (m[1] === 'home:intro') return index === 0 && (field === 'heading' || field === 'text') ? (homeQs(block, '[data-intro-heading]') || block) : block;
  if (m[1] === 'home:solutions') {
    const cards = homeQsa(block, '[data-home-item="card"]');
    const action = homeQs(block, '[data-home-item="section-action"]');
    const row = index < cards.length ? cards[index] : (action && index === cards.length ? action : null);
    return row ? homeCardField(row, field) : block;
  }
  if (m[1] === 'home:audiences') {
    const row = homeQsa(block, '[data-home-item="card"]')[index];
    return row ? homeCardField(row, field) : block;
  }
  if (m[1] === 'home:ai-assistant') {
    if (index === 0 && (field === 'heading' || field === 'text')) return homeQs(block, '[data-ai-heading]') || block;
    const sources = homeQsa(block, '[data-home-item="source"]');
    const sourceIndex = index - 1;
    if (sourceIndex >= 0 && sourceIndex < sources.length) {
      const row = sources[sourceIndex];
      return field === 'title' ? (homeQs(row, '[data-source-title]') || row) : row;
    }
    const msgIndex = index - 1 - sources.length;
    const row = homeQsa(block, '[data-home-item="message"]')[msgIndex];
    if (!row) return block;
    if (field === 'role') return homeQs(row, '[data-message-role]') || row;
    if (field === 'title') return homeQs(row, '[data-message-title]') || row;
    if (field === 'text') return homeQs(row, '[data-message-text]') || row;
    return row;
  }
  if (m[1] === 'home:integrations') {
    if (index === 0 && (field === 'heading' || field === 'text')) return homeQs(block, '[data-integrations-heading]') || block;
    const row = homeQsa(block, '[data-home-item="node"]')[index - 1];
    if (!row) return block;
    if (field === 'id') return homeQs(row, '[data-node-id]') || row;
    if (field === 'label') return homeQs(row, '[data-node-label]') || row;
    return row;
  }
  return block;
}
export function clearHomeFieldErrors(root) {
  homeQsa(root, '[data-field-error]').forEach((e) => e.remove());
  homeQsa(root, '.field-error').forEach((e) => e.classList?.remove('field-error'));
}
export function markHomeFieldError(root, path, message) {
  const doc = homeErrorDoc(root);
  const target = targetForHomeErrorPath(root, path) || homeQs(root, '[data-home-editor]');
  target?.classList?.add('field-error');
  const host = target?.closest?.('label,.item-row,.admin-subcard,[data-home-editor]') || target;
  if (!host || !doc?.createElement) return;
  const p = doc.createElement('p');
  p.className = 'msg err';
  p.dataset.fieldError = path;
  p.textContent = String(message ?? '');
  host.appendChild(p);
}
export function showHomeFieldErrors(root, errors = {}) {
  clearHomeFieldErrors(root);
  const doc = homeErrorDoc(root);
  const editor = homeQs(root, '[data-home-editor]');
  if (!editor || !doc?.createElement) return;
  const list = doc.createElement('div');
  list.className = 'msg err';
  list.dataset.fieldError = 'summary';
  const strong = doc.createElement('strong');
  strong.textContent = 'Javítandó mezők:';
  const ul = doc.createElement('ul');
  for (const [path, msg] of Object.entries(errors || {})) {
    const li = doc.createElement('li');
    li.textContent = String(path) + ': ' + String(msg ?? '');
    ul.appendChild(li);
    markHomeFieldError(root, path, msg);
  }
  list.append(strong, ul);
  editor.prepend(list);
}

export function homeCanonicalEditor(data={}) { const p=data.page, blocks=byKey(data.blocks), groups=pageGroups(data.homeEditor?.pages||[]); const blockHtml = allCanonicalHomeBlockKeys.map((key)=>{ const b=blocks.get(key); if(!b) return `<p class="msg err">Hiányzó canonical blokk: ${esc(key)}</p>`; if(key===HOME_HERO_META_KEY) return heroMeta(b); if(key===HOME_INTRO_KEY) return intro(b); if(key===HOME_SOLUTIONS_KEY) return cards(b,groups,key); if(key===HOME_AI_KEY) return ai(b); if(key===HOME_INTEGRATIONS_KEY) return integrations(b); if(key===HOME_AUDIENCES_KEY) return cards(b,groups,key); }).join(''); return `<section class="admin-section" data-page-section="home-canonical" data-home-editor data-editor-revision="${esc(data.homeEditor?.editor_revision||'')}" data-page-options='${esc(JSON.stringify(groups))}'><header class="admin-section-header"><div><h3>Főoldali canonical tartalom</h3><p class="admin-section-description">A Hero fixen első, az A3 CTA fixen utolsó; itt csak a középső canonical blokkok és a Hero meta szerkeszthető.</p></div></header><p class="hint">Route: <code>/</code> és type: <code>home</code> zárolt.</p>${blockHtml}<div class="admin-save-bar"><div><strong>Főoldal mentése</strong><p class="hint" data-home-dirty-note>Az előnézet a legutóbb elmentett DB állapotot mutatja.</p></div><button type="button" data-home-save>Mentés</button><button type="button" class="secondary" data-home-preview>Előnézet</button><button type="button" class="secondary" data-home-publish>Élesítés</button></div></section><script>${homeEditorJs(p.id)}</script>`; }
export function homeEditorJs(pageId) { return `${mediaPickerJs()}
function q(s,r=document){return r.querySelector(s)}function qa(s,r=document){return [...r.querySelectorAll(s)]}function val(s,r){return q(s,r)?.value||''}function opts(){try{return JSON.parse(q('[data-home-editor]')?.dataset.pageOptions||'{}')}catch{return {}}}function optionHtml(list){return '<option value="">Válassz</option>'+((list||[]).map(p=>'<option value="'+String(p.id).replace(/"/g,'&quot;')+'">'+String(p.title||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')+' — '+String(p.route||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</option>').join(''))}function cardOptionsFor(blockKey,kind){const o=opts();if(kind==='section-action')return o.solutions_index||[];return blockKey==='home:audiences'?(o.audience_detail||[]):o.solution_detail||[]}function row(kind,blockKey){if(kind==='benefit')return '<div class="item-row" data-home-item="benefit"><label>Benefit title<input data-benefit-title></label><label>Benefit text<input data-benefit-text></label>${rowBtns}</div>';if(kind==='card'||kind==='section-action')return '<div class="item-row" data-home-item="'+kind+'"><label>Target<select data-card-target><option value="page">page</option><option value="legacy">legacy</option><option value="external">external</option></select></label><label data-card-page-label>Page<select data-card-page>'+optionHtml(cardOptionsFor(blockKey,kind))+'</select></label><label data-card-href-label>URL<input data-card-href></label><label>'+(kind==='section-action'?'Label':'Title override')+'<input data-card-title></label>'+(kind==='section-action'?'':'<label>Text override<input data-card-text></label><label>Link label<input data-card-link-label></label><label>Badge<input data-card-badge></label>')+'${rowBtns}</div>';if(kind==='source')return '<div class="item-row" data-home-item="source"><label>Source title<input data-source-title></label>${rowBtns}</div>';if(kind==='message')return '<div class="item-row" data-home-item="message"><label>Role<select data-message-role><option value="user">user</option><option value="assistant">assistant</option></select></label><label>Title<input data-message-title></label><label>Text<input data-message-text></label>${rowBtns}</div>';if(kind==='node')return '<div class="item-row" data-home-item="node"><label>Node ID<input data-node-id value="node-" ></label><label>Label<input data-node-label></label>${rowBtns}</div>';return ''}
function blockData(b){const key=b.dataset.homeBlock;let items=[];if(key==='home:hero-meta')items=qa('[data-home-item="benefit"]',b).map(r=>({title:val('[data-benefit-title]',r),text:val('[data-benefit-text]',r)}));else if(key==='home:intro')items=[{kind:'heading',heading:val('[data-intro-heading]',b)}];else if(key==='home:solutions'||key==='home:audiences'){items=qa('[data-home-item="card"]',b).map(r=>({kind:'card',target_type:val('[data-card-target]',r),target_page_id:val('[data-card-page]',r),href:val('[data-card-href]',r),title_override:val('[data-card-title]',r),text_override:val('[data-card-text]',r),linkLabel:val('[data-card-link-label]',r),badge:val('[data-card-badge]',r)}));if(key==='home:solutions')items.push(...qa('[data-home-item="section-action"]',b).map(r=>({kind:'section-action',target_type:val('[data-card-target]',r),target_page_id:val('[data-card-page]',r),href:val('[data-card-href]',r),title_override:val('[data-card-title]',r)})));}else if(key==='home:ai-assistant'){items=[{kind:'heading',text:val('[data-ai-heading]',b)},...qa('[data-home-item="source"]',b).map(r=>({kind:'source',title:val('[data-source-title]',r)})),...qa('[data-home-item="message"]',b).map(r=>({kind:'message',role:val('[data-message-role]',r),title:val('[data-message-title]',r),text:val('[data-message-text]',r)}))];}else if(key==='home:integrations'){items=[{kind:'heading',text:val('[data-integrations-heading]',b)},...qa('[data-home-item="node"]',b).map(r=>({kind:'node',id:val('[data-node-id]',r),label:val('[data-node-label]',r)}))];}return {title:val('[data-home-title]',b),body:val('[data-home-body]',b),status:val('[data-home-status]',b),sort_order:val('[data-home-sort]',b),items};}
function heroVideoPayload(form){const source=form.querySelector('[name="hero_video_source"]')?.value||'';if(!source)return '';const autoplay=!!form.querySelector('[name="hero_video_autoplay"]')?.checked;const cfg={sourceType:source,autoplay,muted:!!form.querySelector('[name="hero_video_muted"]')?.checked,loop:!!form.querySelector('[name="hero_video_loop"]')?.checked,controls:autoplay?!!form.querySelector('[name="hero_video_controls"]')?.checked:true,preload:form.querySelector('[name="hero_video_preload"]')?.value||'metadata',objectFit:form.querySelector('[name="hero_video_object_fit"]')?.value||'cover',aspectRatio:'auto'};if(source==='media')cfg.mediaPath=form.querySelector('[name="hero_video_media_path"]')?.value||'';else cfg.youtubeUrl=form.querySelector('[name="hero_video_youtube_url"]')?.value||'';return JSON.stringify(cfg)}function payload(){const pf=q('#page-form'),fd=new FormData(pf),page=Object.fromEntries(fd);page.hero_video=heroVideoPayload(pf);page.route='/';page.type='home';const blocks={};qa('[data-home-block]').forEach(b=>blocks[b.dataset.homeBlock]=blockData(b));return {editor_revision:q('[data-home-editor]').dataset.editorRevision,page,blocks};}
const homeErrorDoc=${homeErrorDoc.toString()};const homeQs=${homeQs.toString()};const homeQsa=${homeQsa.toString()};const homeCardField=${homeCardField.toString()};const clearHomeFieldErrors=${clearHomeFieldErrors.toString()};const targetForHomeErrorPath=${targetForHomeErrorPath.toString()};const markHomeFieldError=${markHomeFieldError.toString()};const showHomeFieldErrors=${showHomeFieldErrors.toString()};function clearErrors(){clearHomeFieldErrors(document)}function showErrors(errors){showHomeFieldErrors(document,errors)}
let dirty=false;document.addEventListener('input',e=>{if(e.target.closest('#page-form,[data-home-editor]'))dirty=true});document.addEventListener('click',async e=>{const add=e.target.closest('[data-home-add]');if(add){const block=add.closest('[data-home-block]');const list=add.previousElementSibling;if(list)list.insertAdjacentHTML('beforeend',row(add.dataset.homeAdd,block?.dataset.homeBlock));dirty=true;}const rem=e.target.closest('[data-home-remove]');if(rem){rem.closest('.item-row')?.remove();dirty=true;}const mv=e.target.closest('[data-home-move]');if(mv){const r=mv.closest('.item-row');if(mv.dataset.homeMove==='up'&&r.previousElementSibling)r.parentNode.insertBefore(r,r.previousElementSibling);if(mv.dataset.homeMove==='down'&&r.nextElementSibling)r.parentNode.insertBefore(r.nextElementSibling,r);dirty=true;}if(e.target.matches('[data-home-save]')){clearErrors();const r=await fetch('/api/admin/pages/${pageId}/home',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(payload())});const j=await r.json();if(j.ok){q('[data-home-editor]').dataset.editorRevision=j.data.editor_revision;dirty=false;clearErrors();msg('Főoldal mentve. Élesítés külön indítható.',true)}else{showErrors(j.error?.details?.fieldErrors||{});msg(j.error?.message||'Mentési hiba',false)}}if(e.target.matches('[data-home-publish]')){if(dirty){msg('Előbb mentsd a főoldalt.',false);return;}const r=await fetch('/api/admin/publish',{method:'POST'});const j=await r.json();msg(j.publish?.ok?'Élesítés sikeres':(j.publish?.error||j.error?.message||'Élesítési hiba'),!!j.publish?.ok)}if(e.target.matches('[data-home-preview]')){if(dirty)msg('Az előnézet a legutóbb mentett állapotot mutatja.',false);window.open('/admin/pages/${pageId}/home/preview/','_blank','noreferrer')}});`; }
