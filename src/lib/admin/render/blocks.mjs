import { dirtyStateJs, publishMessageJs } from './client-js.mjs';
import { mediaPickerJs } from './media.mjs';
import { esc, parseItems, statusOptions } from './utils.mjs';
import { blockFixedRole } from '../../content/block-role-contract.mjs';
const supportedBlockTypes = new Set(['text','feature-list','list','cards','card-grid','cta','image-text','video','faq','ai-preview','network-visual']);
function blockKind(type) { return supportedBlockTypes.has(type) ? type : String(type || 'text'); }
function editorMode(type) { if (['feature-list','list'].includes(type)) return 'feature-list'; if (['cards','card-grid'].includes(type)) return 'cards'; if (['ai-preview','network-visual'].includes(type) || !supportedBlockTypes.has(type)) return 'raw'; return type; }
const asObj = (it) => typeof it === 'object' && it ? it : { title: it || '' };
const titleOf = (it) => typeof it === 'string' ? it : (it.title || it.text || it.question || '');
const textOf = (it) => typeof it === 'object' && it ? (it.text || it.shortDescription || it.answer || it.body || '') : '';
const urlOf = (it) => typeof it === 'object' && it ? (it.url || it.href || it.slug || '') : '';
const labelOf = (it) => typeof it === 'object' && it ? (it.linkLabel || it.label || '') : '';
const panelClasses = ' class="is-runtime-hidden" hidden inert';
function itemFieldShown(mode, field) { return (mode === 'feature-list' && field === 'item-title') || (mode === 'cards' && ['item-title','item-text','item-url','item-label','item-badge'].includes(field)) || (mode === 'faq' && ['item-title','item-text'].includes(field)); }
function fieldAttrs(mode, field) { return itemFieldShown(mode, field) ? '' : ' class="is-runtime-hidden" hidden'; }
function fieldDisabledAttrs(mode, field) { return itemFieldShown(mode, field) ? '' : ' disabled'; }
function itemRows(items, mode) { const list = items.length ? items : ['']; return list.map((raw) => { const it = asObj(raw); const rawItem = esc(JSON.stringify(raw)); return `<div class="item-row" data-item-row data-raw-item="${rawItem}"><label data-field="item-title"${fieldAttrs(mode, 'item-title')}>${mode === 'faq' ? 'Kérdés' : mode === 'cards' ? 'Kártya címe' : 'Listaelem'}<input data-item-title value="${esc(titleOf(raw))}"${fieldDisabledAttrs(mode, 'item-title')}></label>${itemFieldShown(mode, 'item-text') ? `<label data-field="item-text">${mode === 'faq' ? 'Válasz' : 'Kártya szövege'}<input data-item-text value="${esc(textOf(raw))}"></label>` : ''}${itemFieldShown(mode, 'item-url') ? `<label data-field="item-url">Cél URL / slug<input data-item-url value="${esc(urlOf(raw))}"></label>` : ''}${itemFieldShown(mode, 'item-label') ? `<label data-field="item-label">Link felirat<input data-item-label placeholder="Részletek →" value="${esc(labelOf(raw))}"></label>` : ''}${itemFieldShown(mode, 'item-badge') ? `<label data-field="item-badge">Sorrend / badge<input data-item-badge value="${esc(it.order || it.badge || '')}"></label>` : ''}<button type="button" data-move-item="up" class="secondary">Fel</button><button type="button" data-move-item="down" class="secondary">Le</button><button type="button" data-remove-item class="danger">Törlés</button></div>`; }).join(''); }
function rawItemsPanel(items, selectedKind) { if (selectedKind !== 'raw') return ''; return `<label data-panel="raw-items">Items JSON<textarea data-raw-items>${esc(JSON.stringify(items, null, 2))}</textarea><span class="msg err is-runtime-hidden" data-raw-error hidden>Az items JSON hibás. Javítsd mentés előtt.</span></label>`; }
function itemsPanel(items, selectedKind) { if (!['feature-list','cards','faq'].includes(selectedKind)) return ''; return `<div data-panel="items" data-list-editor><p class="hint" data-kind-hint></p>${itemRows(items, selectedKind)}<button type="button" data-add-item>Új sor</button></div>`; }
function ctaPanel(first, selectedKind) { if (selectedKind !== 'cta') return ''; return `<div class="grid" data-panel="cta"><label>Kis címke / eyebrow<input data-cta-eyebrow value="${esc(first.eyebrow || '')}"></label><label>Első gomb felirat<input data-cta-label value="${esc(first.label || '')}"></label><label>Első gomb link<input data-cta-url value="${esc(first.url || '')}"></label><label>Második gomb felirat<input data-cta-secondary-label value="${esc(first.secondaryLabel || '')}"></label><label>Második gomb link<input data-cta-secondary-url value="${esc(first.secondaryUrl || '')}"></label></div>`; }
function imagePanel(first, selectedKind) { if (selectedKind !== 'image-text') return ''; return `<div class="grid" data-panel="image-text"><label>Kép URL<input data-image-url value="${esc(first.image || '')}"></label><button type="button" class="secondary" data-media-picker-target="[data-image-url]" data-media-picker-kind="image">Médiából választok</button><label>Alt text<input data-image-alt value="${esc(first.alt || '')}"></label><label>Kép pozíció<select data-image-position><option value="right" ${first.position!=='left'?'selected':''}>jobb</option><option value="left" ${first.position==='left'?'selected':''}>bal</option></select></label></div>`; }
function videoPanel(first, selectedKind) { if (selectedKind !== 'video') return ''; const cfg = first && typeof first === 'object' ? first : {}; const checked = (v) => v ? ' checked' : ''; return `<section class="grid" data-panel="video"><label>Forrás típusa<select data-video-source><option value="media" ${cfg.sourceType !== 'youtube' ? 'selected' : ''}>Saját MP4</option><option value="youtube" ${cfg.sourceType === 'youtube' ? 'selected' : ''}>YouTube</option></select></label><label data-video-media>Saját videó<input data-video-media-path value="${esc(cfg.mediaPath || '')}"></label><button type="button" class="secondary" data-video-media data-media-picker-target="[data-video-media-path]" data-media-picker-kind="video">Videót választok</button><label data-video-youtube>YouTube link<input data-video-youtube-url value="${esc(cfg.youtubeUrl || '')}"></label><label>Poster / fallback kép<input data-video-poster value="${esc(cfg.poster || '')}"></label><button type="button" class="secondary" data-media-picker-target="[data-video-poster]" data-media-picker-kind="image">Képet választok</button><label><input type="checkbox" data-video-autoplay${checked(cfg.autoplay)}> Automatikus indítás</label><label><input type="checkbox" data-video-muted${checked(cfg.muted)}> Némítva</label><label><input type="checkbox" data-video-loop${checked(cfg.loop)}> Végtelenített lejátszás</label><label><input type="checkbox" data-video-controls${checked(cfg.controls !== false)}> Vezérlők megjelenítése</label><label>Előtöltés<select data-video-preload><option value="none" ${cfg.preload === 'none' ? 'selected' : ''}>Nincs</option><option value="metadata" ${!cfg.preload || cfg.preload === 'metadata' ? 'selected' : ''}>Metaadat</option><option value="auto" ${cfg.preload === 'auto' ? 'selected' : ''}>Automatikus</option></select></label><label>Illesztés<select data-video-object-fit><option value="cover" ${cfg.objectFit !== 'contain' ? 'selected' : ''}>Kitöltés, vágással</option><option value="contain" ${cfg.objectFit === 'contain' ? 'selected' : ''}>Teljes videó látszódjon</option></select></label><label>Képarány<select data-video-aspect-ratio><option value="auto" ${cfg.aspectRatio === 'auto' ? 'selected' : ''}>Automatikus</option><option value="16/9" ${!cfg.aspectRatio || cfg.aspectRatio === '16/9' ? 'selected' : ''}>16:9</option><option value="4/3" ${cfg.aspectRatio === '4/3' ? 'selected' : ''}>4:3</option><option value="1/1" ${cfg.aspectRatio === '1/1' ? 'selected' : ''}>1:1</option><option value="9/16" ${cfg.aspectRatio === '9/16' ? 'selected' : ''}>9:16</option></select></label></section>`; }


export function videoPanelVisibility(sourceType = 'media') {
  const source = sourceType === 'youtube' ? 'youtube' : 'media';
  return { sourceType: source, mediaVisible: source === 'media', youtubeVisible: source === 'youtube' };
}

export function serializeVideoEditorValues(values = {}) {
  const sourceType = values.sourceType === 'youtube' ? 'youtube' : 'media';
  const cfg = {
    sourceType,
    autoplay: Boolean(values.autoplay),
    muted: Boolean(values.muted),
    loop: Boolean(values.loop),
    controls: values.controls !== false,
    preload: values.preload || 'metadata',
    objectFit: values.objectFit || 'cover',
    aspectRatio: values.aspectRatio || '16/9',
  };
  if (sourceType === 'media') cfg.mediaPath = values.mediaPath || '';
  else cfg.youtubeUrl = values.youtubeUrl || '';
  if (values.poster) cfg.poster = values.poster;
  return cfg;
}

export function setVideoEditorVisible(el, show, hiddenClass = 'is-runtime-hidden') {
  if (!el) return;
  el.hidden = !show;
  el.classList?.toggle?.(hiddenClass, !show);
  if (show) el.removeAttribute?.('inert');
  else el.setAttribute?.('inert', '');
  el.querySelectorAll?.('input,textarea,select,button').forEach((input) => { input.disabled = !show; });
}

export function ensureVideoPanel(form, beforeElement = null, deps = {}) {
  let panel = form?.querySelector?.('[data-panel="video"]');
  if (panel) return panel;
  const before = beforeElement || form?.querySelector?.('input[name="items"]');
  if (!before?.insertAdjacentHTML) return null;
  const hiddenClass = deps.runtimeHiddenClass || 'is-runtime-hidden';
  before.insertAdjacentHTML('beforebegin', `<section class="grid ${hiddenClass}" data-panel="video" hidden inert><label>Forrás típusa<select data-video-source disabled><option value="media">Saját MP4</option><option value="youtube">YouTube</option></select></label><label data-video-media>Saját videó<input data-video-media-path disabled></label><button type="button" class="secondary" data-video-media data-media-picker-target="[data-video-media-path]" data-media-picker-kind="video" disabled>Videót választok</button><label data-video-youtube>YouTube link<input data-video-youtube-url disabled></label><label>Poster / fallback kép<input data-video-poster disabled></label><button type="button" class="secondary" data-media-picker-target="[data-video-poster]" data-media-picker-kind="image" disabled>Képet választok</button><label><input type="checkbox" data-video-autoplay disabled> Automatikus indítás</label><label><input type="checkbox" data-video-muted disabled> Némítva</label><label><input type="checkbox" data-video-loop disabled> Végtelenített lejátszás</label><label><input type="checkbox" data-video-controls checked disabled> Vezérlők megjelenítése</label><label>Előtöltés<select data-video-preload disabled><option value="none">Nincs</option><option value="metadata" selected>Metaadat</option><option value="auto">Automatikus</option></select></label><label>Illesztés<select data-video-object-fit disabled><option value="cover">Kitöltés, vágással</option><option value="contain">Teljes videó látszódjon</option></select></label><label>Képarány<select data-video-aspect-ratio disabled><option value="auto">Automatikus</option><option value="16/9" selected>16:9</option><option value="4/3">4:3</option><option value="1/1">1:1</option><option value="9/16">9:16</option></select></label></section>`);
  return form.querySelector('[data-panel="video"]');
}

export function syncVideoSource(form, setVisibleFn = setVideoEditorVisible) {
  const visibility = videoPanelVisibility(form?.querySelector?.('[data-video-source]')?.value || 'media');
  form?.querySelectorAll?.('[data-video-media]').forEach((el) => setVisibleFn(el, visibility.mediaVisible));
  form?.querySelectorAll?.('[data-video-youtube]').forEach((el) => setVisibleFn(el, visibility.youtubeVisible));
  return visibility;
}

export function readVideoEditorValues(form) {
  const sourceType = form?.querySelector?.('[data-video-source]')?.value === 'youtube' ? 'youtube' : 'media';
  const values = {
    sourceType,
    poster: form?.querySelector?.('[data-video-poster]')?.value || '',
    autoplay: !!form?.querySelector?.('[data-video-autoplay]')?.checked,
    muted: !!form?.querySelector?.('[data-video-muted]')?.checked,
    loop: !!form?.querySelector?.('[data-video-loop]')?.checked,
    controls: !!form?.querySelector?.('[data-video-controls]')?.checked,
    preload: form?.querySelector?.('[data-video-preload]')?.value || 'metadata',
    objectFit: form?.querySelector?.('[data-video-object-fit]')?.value || 'cover',
    aspectRatio: form?.querySelector?.('[data-video-aspect-ratio]')?.value || '16/9',
  };
  if (sourceType === 'media') values.mediaPath = form?.querySelector?.('[data-video-media-path]')?.value || '';
  else values.youtubeUrl = form?.querySelector?.('[data-video-youtube-url]')?.value || '';
  return values;
}

export function hydrateVideoPanel(form, config = {}, setVisibleFn = setVideoEditorVisible) {
  const first = config && typeof config === 'object' && !Array.isArray(config) ? config : {};
  const set = (sel, val) => { const el = form?.querySelector?.(sel); if (el && val !== undefined && val !== null) el.value = val; };
  const source = first.sourceType === 'youtube' ? 'youtube' : 'media';
  set('[data-video-source]', source);
  set('[data-video-media-path]', first.mediaPath || '');
  set('[data-video-youtube-url]', first.youtubeUrl || '');
  set('[data-video-poster]', first.poster || '');
  ['autoplay','muted','loop','controls'].forEach((key) => {
    const el = form?.querySelector?.(`[data-video-${key}]`);
    if (el) el.checked = key === 'controls' ? first[key] !== false : !!first[key];
  });
  set('[data-video-preload]', first.preload || 'metadata');
  set('[data-video-object-fit]', first.objectFit || 'cover');
  set('[data-video-aspect-ratio]', first.aspectRatio || '16/9');
  return syncVideoSource(form, setVisibleFn);
}

export function writeVideoItemsInput(form) {
  const cfg = serializeVideoEditorValues(readVideoEditorValues(form));
  const input = form?.querySelector?.('input[name="items"]');
  if (input) input.value = JSON.stringify([cfg]);
  return [cfg];
}

export function parseItemRowRaw(rawItem = '{}') { return JSON.parse(rawItem || '{}'); }

export function serializeEditorItems({ type, rows = [], first = {}, rawItemsText = '[]' } = {}) {
  const setClean = (obj, key, value) => { if (value === '' || value === undefined || value === null) delete obj[key]; else obj[key] = value; };
  const objectRaw = (raw) => raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
  const coerceOrder = (key, value, fallback) => {
    if (value === '' || value === undefined || value === null) return fallback;
    if (key === 'badge') return value;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : value;
  };
  if (type === 'feature-list') return rows.map((i) => {
    const raw = objectRaw(i.raw);
    if (Object.keys(raw).length) {
      const textKey = ('text' in raw && !('title' in raw)) ? 'text' : 'title';
      setClean(raw, textKey, i.title);
      return raw;
    }
    return i.title;
  }).filter((i) => typeof i === 'string' ? Boolean(i) : Boolean(i?.title || i?.text));
  if (type === 'cards') return rows.map((i) => {
    const raw = objectRaw(i.raw);
    setClean(raw, 'title', i.title);
    setClean(raw, 'text', i.text);
    const urlKey = ('href' in raw && !('url' in raw)) ? 'href' : 'url';
    setClean(raw, urlKey, i.url);
    if ('linkLabel' in raw || i.linkLabel) setClean(raw, 'linkLabel', i.linkLabel);
    const orderKey = ('badge' in raw && !('order' in raw)) ? 'badge' : 'order';
    setClean(raw, orderKey, coerceOrder(orderKey, i.order, raw[orderKey]));
    return raw;
  }).filter((i) => i.title || i.text || i.url || i.href);
  if (type === 'cta') {
    const raw = objectRaw(first);
    setClean(raw, 'label', rows.label || '');
    setClean(raw, 'url', rows.url || '');
    setClean(raw, 'secondaryLabel', rows.secondaryLabel || '');
    setClean(raw, 'secondaryUrl', rows.secondaryUrl || '');
    setClean(raw, 'eyebrow', rows.eyebrow || '');
    return Object.keys(raw).length ? [raw] : [];
  }
  if (type === 'image-text') {
    const raw = objectRaw(first);
    setClean(raw, 'image', rows.image || '');
    setClean(raw, 'alt', rows.alt || '');
    setClean(raw, 'position', rows.position || 'right');
    return Object.keys(raw).length ? [raw] : [];
  }
  if (type === 'video') return [serializeVideoEditorValues(rows)];
  if (type === 'faq') return rows.map((i) => {
    const raw = objectRaw(i.raw);
    setClean(raw, 'question', i.title);
    setClean(raw, 'answer', i.text);
    return raw;
  }).filter((i) => i.question || i.answer);
  if (type === 'raw') {
    const parsed = JSON.parse(rawItemsText || '[]');
    if (!Array.isArray(parsed)) throw new Error('items JSON must be an array');
    return parsed;
  }
  return [];
}


const moveGapError = 'Nincs elegendő sorrendi hely a blokkok között. A blokksorrend technikai újrarendezése szükséges.';

export function sortOrderForMovedBlock(entries = [], movedIndex = -1) {
  const list = entries.map((entry, index) => ({ ...entry, index, sortOrder: Number(entry.sortOrder) }));
  const moved = list[movedIndex];
  if (!moved || moved.fixed) throw new Error(moveGapError);
  const previous = list[movedIndex - 1];
  const next = list[movedIndex + 1];
  const previousOrder = previous ? Number(previous.sortOrder) : Number.NEGATIVE_INFINITY;
  const nextOrder = next ? Number(next.sortOrder) : Number.POSITIVE_INFINITY;
  let sortOrder;
  if (Number.isFinite(previousOrder) && Number.isFinite(nextOrder)) {
    sortOrder = Math.floor((previousOrder + nextOrder) / 2);
    if (!(sortOrder > previousOrder && sortOrder < nextOrder)) throw new Error(moveGapError);
  } else if (Number.isFinite(previousOrder)) {
    sortOrder = previousOrder + 10;
  } else if (Number.isFinite(nextOrder)) {
    sortOrder = nextOrder - 10;
  } else {
    sortOrder = moved.sortOrder;
  }
  return sortOrder;
}

export function movedBlockOrder(entries = [], fromIndex = -1, direction = 'down') {
  const list = entries.map((entry, index) => ({ ...entry, index, sortOrder: Number(entry.sortOrder) }));
  const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
  const moved = list[fromIndex];
  const target = list[toIndex];
  if (!moved || !target || moved.fixed || target.fixed) throw new Error(moveGapError);
  const domOrder = list.slice();
  domOrder.splice(fromIndex, 1);
  domOrder.splice(toIndex, 0, moved);
  const movedIndex = domOrder.indexOf(moved);
  return { domOrder, moved, sortOrder: sortOrderForMovedBlock(domOrder, movedIndex), movedIndex };
}


function normalizeInitialItems(kind, items, first) { return items; }
function blockRole(b) { const items = parseItems(b.items); return blockFixedRole({ ...b, items }); }

export function blockForm(b, { editable = true, allowedTypes } = {}) { const items = parseItems(b.items); const kind = blockKind(b.type); const first = asObj(items[0] || {}); let options = [ ['text','Szövegblokk'], ['feature-list','Felsorolás / lista'], ['list','Lista'], ['cards','Kártyasor'], ['card-grid','Kártyarács'], ['cta','CTA blokk'], ['image-text','Kép + szöveg blokk'], ['video','Videó blokk'], ['faq','FAQ blokk'], ['ai-preview','AI előnézet'], ['network-visual','Hálózati vizualizáció'] ].filter(([value]) => !allowedTypes || allowedTypes.includes(value)); if (!options.some(([value]) => value === kind)) options = [[kind, `Ismeretlen típus: ${kind}`], ...options]; const selectedKind = kind; const mode = editorMode(selectedKind); const fixedPresentation = b.id && blockRole(b); const moveAttrs = fixedPresentation ? ' disabled aria-disabled="true" title="Rögzített megjelenési hely"' : ''; const fixedNotice = fixedPresentation ? '<p class="hint" data-presentation-fixed>Rögzített megjelenési hely</p>' : ''; return editable ? `<form class="card block-form block-card" data-block-form data-initial-block-type="${esc(selectedKind)}" data-items-touched="false"${fixedPresentation ? ' data-fixed-presentation="true"' : ''}><h3>${b.id ? 'Tartalmi blokk' : 'Új tartalmi blokk'}</h3><input type="hidden" name="id" value="${esc(b.id || '')}"><input type="hidden" name="page_id" value="${esc(b.page_id || '')}"><label>Blokk típusa<select name="type" data-block-type>${options.map(([value,label])=>`<option value="${value}" ${selectedKind===value?'selected':''}>${label}</option>`).join('')}</select></label>${fixedNotice}<label data-panel="common">Címsor<input name="title" value="${esc(b.title)}"></label><label data-panel="common">Törzsszöveg / bevezető<textarea name="body">${esc(b.body)}</textarea></label>${itemsPanel(items, mode)}${ctaPanel(first, mode)}${imagePanel(first, mode)}${videoPanel(first, mode)}${rawItemsPanel(items, mode)}<input type="hidden" name="items" value="${esc(JSON.stringify(normalizeInitialItems(mode, items, first)))}"><div class="advanced"><strong>Haladó beállítások</strong><label>Sorrend<input name="sort_order" type="number" value="${esc(b.sort_order)}"></label><label>Státusz<select name="status">${statusOptions(b.status, { published: 'Látható', draft: 'Rejtett piszkozat', archived: 'Archivált' })}</select></label></div><button type="button" data-move-block="up" class="secondary"${moveAttrs}>Blokk fel</button><button type="button" data-move-block="down" class="secondary"${moveAttrs}>Blokk le</button><button type="submit">Mentés és élesítés</button>${b.id ? `<button type="button" class="danger" data-delete="${esc(b.id)}">Blokk elrejtése</button>` : ''}</form>` : ``; }
export function pageEditorJs(pageId) { return `${dirtyStateJs};${publishMessageJs};${mediaPickerJs()}const runtimeHiddenClass='is-runtime-hidden';const videoPanelVisibility=${videoPanelVisibility.toString()};const serializeVideoEditorValues=${serializeVideoEditorValues.toString()};const setVideoEditorVisible=${setVideoEditorVisible.toString()};const ensureVideoPanel=${ensureVideoPanel.toString()};const syncVideoSource=${syncVideoSource.toString()};const readVideoEditorValues=${readVideoEditorValues.toString()};const hydrateVideoPanel=${hydrateVideoPanel.toString()};const writeVideoItemsInput=${writeVideoItemsInput.toString()};const parseItemRowRaw=${parseItemRowRaw.toString()};const serializeEditorItems=${serializeEditorItems.toString()};const moveGapError='Nincs elegendő sorrendi hely a blokkok között. A blokksorrend technikai újrarendezése szükséges.';const sortOrderForMovedBlock=${sortOrderForMovedBlock.toString()};const movedBlockOrder=${movedBlockOrder.toString()};const supportedBlockTypes=new Set(['text','feature-list','list','cards','card-grid','cta','image-text','video','faq','ai-preview','network-visual']);function setVisible(el,show){el.hidden=!show;el.classList.toggle(runtimeHiddenClass,!show);if(show)el.removeAttribute('inert');else el.setAttribute('inert','');el.querySelectorAll('input,textarea,select,button').forEach(i=>{if(!i.matches('[name=type]'))i.disabled=!show;});}function ensurePanel(f,key){let p=f.querySelector('[data-panel="'+key+'"]');if(p)return p;const before=f.querySelector('input[name="items"]');if(key==='items')before.insertAdjacentHTML('beforebegin','<div data-panel="items" data-list-editor${panelClasses}><p class="hint" data-kind-hint></p><div class="item-row" data-item-row data-raw-item="{}"><label data-field="item-title">Listaelem<input data-item-title></label><button type="button" data-move-item="up" class="secondary">Fel</button><button type="button" data-move-item="down" class="secondary">Le</button><button type="button" data-remove-item class="danger">Törlés</button></div><button type="button" data-add-item disabled>Új sor</button></div>');if(key==='cta')before.insertAdjacentHTML('beforebegin','<div class="grid is-runtime-hidden" data-panel="cta" hidden inert><label>Kis címke / eyebrow<input data-cta-eyebrow disabled></label><label>Első gomb felirat<input data-cta-label disabled></label><label>Első gomb link<input data-cta-url disabled></label><label>Második gomb felirat<input data-cta-secondary-label disabled></label><label>Második gomb link<input data-cta-secondary-url disabled></label></div>');if(key==='image-text')before.insertAdjacentHTML('beforebegin','<div class="grid is-runtime-hidden" data-panel="image-text" hidden inert><label>Kép URL<input data-image-url disabled></label><button type="button" class="secondary" data-media-picker-target="[data-image-url]" data-media-picker-kind="image" disabled>Médiából választok</button><label>Alt text<input data-image-alt disabled></label><label>Kép pozíció<select data-image-position disabled><option value="right">jobb</option><option value="left">bal</option></select></label></div>');if(key==='video')return ensureVideoPanel(f,before,{runtimeHiddenClass});if(key==='raw-items')before.insertAdjacentHTML('beforebegin','<label class="is-runtime-hidden" data-panel="raw-items" hidden inert>Items JSON<textarea data-raw-items disabled>[]</textarea></label>');return f.querySelector('[data-panel="'+key+'"]');}function rowHtml(){return '<div class="item-row" data-item-row data-raw-item="{}"><label data-field="item-title">Listaelem<input data-item-title></label><label data-field="item-text">Kártya szövege<input data-item-text></label><label data-field="item-url">Cél URL / slug<input data-item-url></label><label data-field="item-label">Link felirat<input data-item-label placeholder="Részletek →"></label><label data-field="item-badge">Sorrend / badge<input data-item-badge></label><button type="button" data-move-item="up" class="secondary">Fel</button><button type="button" data-move-item="down" class="secondary">Le</button><button type="button" data-remove-item class="danger">Törlés</button></div>';}function syncRow(r,type){const wanted=type==='feature-list'?['item-title']:type==='faq'?['item-title','item-text']:type==='cards'?['item-title','item-text','item-url','item-label','item-badge']:[];const labels={featureListTitle:'Listaelem',cardTitle:'Kártya címe',faqTitle:'Kérdés',faqText:'Válasz',cardText:'Kártya szövege'};const defs=[['item-title',type==='faq'?labels.faqTitle:type==='cards'?labels.cardTitle:labels.featureListTitle,'data-item-title',''],['item-text',type==='faq'?labels.faqText:labels.cardText,'data-item-text',''],['item-url','Cél URL / slug','data-item-url',''],['item-label','Link felirat','data-item-label',' placeholder="Részletek →"'],['item-badge','Sorrend / badge','data-item-badge','']];defs.forEach(([field,label,attr,extra])=>{let el=r.querySelector('[data-field="'+field+'"]');if(wanted.includes(field)&&!el){const buttons=r.querySelector('[data-move-item="up"]');buttons.insertAdjacentHTML('beforebegin','<label data-field="'+field+'">'+label+'<input '+attr+extra+'></label>');el=r.querySelector('[data-field="'+field+'"]');}if(el){el.firstChild.textContent=label;const show=wanted.includes(field);setVisible(el,show);}});}function getVideoRows(f){return serializeVideoEditorValues(readVideoEditorValues(f));}function hydrateCurrentVideoPanel(f){hydrateVideoPanel(f,firstItem(f),(el,show)=>setVisible(el,show));}function syncBlockType(f){const rawType=f.querySelector('[data-block-type]')?.value||'text';const type=['list'].includes(rawType)?'feature-list':['card-grid'].includes(rawType)?'cards':['ai-preview','network-visual'].includes(rawType)?'raw':rawType;f.dataset.currentBlockType=rawType;['items','cta','image-text','video','raw-items'].forEach(k=>ensurePanel(f,k));f.querySelectorAll('[data-panel]').forEach(p=>{const key=p.dataset.panel;setVisible(p,key==='common'||(key==='items'&&['feature-list','cards','faq'].includes(type))||(key==='cta'&&type==='cta')||(key==='image-text'&&type==='image-text')||(key==='video'&&type==='video')||(key==='raw-items'&&type==='raw'));});f.querySelectorAll('[data-item-row]').forEach(r=>syncRow(r,type));const hint=f.querySelector('[data-kind-hint]');if(type==='video')hydrateCurrentVideoPanel(f);if(hint)hint.textContent=type==='feature-list'?'Listaelemek. Linkmező nincs, mert a public lista csak listaelem szöveget renderel.':type==='cards'?'Kártyasor: cím, szöveg, cél URL / slug, linkfelirat és badge. Publicban golden kártyarácsként jelenik meg.':'FAQ sorok: kérdés és válasz.';}function markRawError(f,error){const el=f.querySelector('[data-raw-error]');if(el){el.hidden=!error;el.classList.toggle('is-runtime-hidden',!error);}return !error;}function parseRawItems(f){try{const parsed=JSON.parse(f.querySelector('[data-raw-items]')?.value||'[]');if(!Array.isArray(parsed))throw new Error('not array');markRawError(f,false);return parsed;}catch(e){markRawError(f,true);throw e;}}function initialItems(f){try{const parsed=JSON.parse(f.querySelector('input[name="items"]')?.value||'[]');return Array.isArray(parsed)?parsed:[];}catch(_){return [];}}function firstItem(f){const first=initialItems(f)[0];return first&&typeof first==='object'&&!Array.isArray(first)?first:{};}function serializeItems(f,{validateRaw=false}={}){const rawType=f.querySelector('[data-block-type]')?.value;const initialType=f.dataset.initialBlockType;const type=rawType==='list'?'feature-list':rawType==='card-grid'?'cards':['ai-preview','network-visual'].includes(rawType)||!supportedBlockTypes.has(rawType)?'raw':rawType;if(rawType===initialType&&f.dataset.itemsTouched!=='true'&&type!=='raw'){return;}if(rawType===initialType&&f.dataset.itemsTouched!=='true'&&type==='raw'){if(validateRaw)parseRawItems(f);return;}const rowData=[...f.querySelectorAll('[data-item-row]')].map(r=>{let raw=parseItemRowRaw(r.dataset.rawItem||'{}');return {raw,title:r.querySelector('[data-item-title]')?.value||'',text:r.querySelector('[data-item-text]')?.value||'',url:r.querySelector('[data-item-url]')?.value||'',linkLabel:r.querySelector('[data-item-label]')?.value||'',order:r.querySelector('[data-item-badge]')?.value||''}});const panelValues={eyebrow:f.querySelector('[data-cta-eyebrow]')?.value||'',label:f.querySelector('[data-cta-label]')?.value||'',url:f.querySelector('[data-cta-url]')?.value||'',secondaryLabel:f.querySelector('[data-cta-secondary-label]')?.value||'',secondaryUrl:f.querySelector('[data-cta-secondary-url]')?.value||'',image:f.querySelector('[data-image-url]')?.value||'',alt:f.querySelector('[data-image-alt]')?.value||'',position:f.querySelector('[data-image-position]')?.value||'right'};const videoValues=getVideoRows(f);let items=[];try{items=serializeEditorItems({type,rows:type==='video'?videoValues:(type==='cta'||type==='image-text'?panelValues:rowData),first:firstItem(f),rawItemsText:f.querySelector('[data-raw-items]')?.value||'[]'});markRawError(f,false);}catch(e){if(type==='raw'||validateRaw)markRawError(f,true);throw e;}f.querySelector('input[name="items"]').value=JSON.stringify(items);} function isFixedBlock(f){return f?.dataset?.fixedPresentation==='true';}function currentSortOrder(f){const n=Number(f.querySelector('input[name="sort_order"]')?.value);return Number.isFinite(n)?n:0;}function blockEntries(){return [...document.querySelectorAll('.block-form')].map((form)=>({node:form,fixed:isFixedBlock(form),sortOrder:currentSortOrder(form)}));}function moveBlock(f,direction){const entries=blockEntries();const fromIndex=entries.findIndex((entry)=>entry.node===f);const moved=movedBlockOrder(entries,fromIndex,direction);const o=f.querySelector('input[name="sort_order"]');if(o)o.value=String(moved.sortOrder);const sib=direction==='up'?f.previousElementSibling:f.nextElementSibling;direction==='up'?sib.before(f):sib.after(f);f.dispatchEvent(new Event('input'));}function wireBlock(f){syncBlockType(f);const blockSerializer=()=>{serializeItems(f);return new URLSearchParams(new FormData(f)).toString();};const st=setupDirtyForm(f,blockSerializer);f.addEventListener('input',(e)=>{if(e.target.closest('[data-panel="items"],[data-panel="cta"],[data-panel="image-text"],[data-panel="video"],[data-panel="raw-items"]'))f.dataset.itemsTouched='true';try{serializeItems(f)}catch(_){}});f.addEventListener('change',(e)=>{if(e.target.matches('[data-video-source]')){syncVideoSource(f,(el,show)=>setVisible(el,show));serializeItems(f);f.dispatchEvent(new Event('input'));}});f.querySelector('[data-block-type]')?.addEventListener('change',()=>{f.dataset.itemsTouched='true';syncBlockType(f);f.dispatchEvent(new Event('input'));});f.onclick=(e)=>{const row=e.target.closest('[data-item-row]');if(e.target.dataset.removeItem!==undefined&&row){row.remove();serializeItems(f);f.dispatchEvent(new Event('input'));}if(e.target.dataset.addItem!==undefined){e.target.insertAdjacentHTML('beforebegin',rowHtml());syncBlockType(f);f.dispatchEvent(new Event('input'));}if(e.target.dataset.moveItem&&row){const sib=e.target.dataset.moveItem==='up'?row.previousElementSibling:row.nextElementSibling;if(sib&&sib.matches('[data-item-row]')){e.target.dataset.moveItem==='up'?sib.before(row):sib.after(row);f.dispatchEvent(new Event('input'));}}if(e.target.dataset.moveBlock){if(isFixedBlock(f))return;const direction=e.target.dataset.moveBlock;const sib=direction==='up'?f.previousElementSibling:f.nextElementSibling;if(sib&&sib.classList.contains('block-form')&&!isFixedBlock(sib)){try{moveBlock(f,direction);}catch(error){msg(error.message||'A blokk sorrend nem menthető.',false);}}}};f.onsubmit=async(e)=>{e.preventDefault();try{serializeItems(f,{validateRaw:true});}catch(error){const message=String(error?.message||'');msg(message.includes('sort_order')?message:'Az items JSON hibás. Javítsd mentés előtt.',false);return;}if(!st.changed())return;st.markSaving();const d=Object.fromEntries(new FormData(f));const r=await fetch('/api/admin/blocks',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(d)});const j=await r.json();if(j.ok&&j.publish?.ok){if(!d.id&&j.data?.id){const idInput=f.querySelector('input[name="id"]');if(idInput)idInput.value=String(j.data.id);history.replaceState(null,'','/admin/pages/${pageId}');}st.markSaved();}msg(j.ok?pm(j.publish):j.error.message,j.ok&&j.publish?.ok)};}function heroVideoPayload(form){const source=form.querySelector('[name="hero_video_source"]')?.value||'';if(!source)return '';const cfg={sourceType:source,poster:form.querySelector('[name="hero_video_poster"]')?.value||'',autoplay:!!form.querySelector('[name="hero_video_autoplay"]')?.checked,muted:!!form.querySelector('[name="hero_video_muted"]')?.checked,loop:!!form.querySelector('[name="hero_video_loop"]')?.checked,controls:!!form.querySelector('[name="hero_video_controls"]')?.checked,preload:form.querySelector('[name="hero_video_preload"]')?.value||'metadata',objectFit:form.querySelector('[name="hero_video_object_fit"]')?.value||'cover',aspectRatio:'auto'};if(source==='media')cfg.mediaPath=form.querySelector('[name="hero_video_media_path"]')?.value||'';else cfg.youtubeUrl=form.querySelector('[name="hero_video_youtube_url"]')?.value||'';if(!cfg.poster)delete cfg.poster;return JSON.stringify(cfg);}function syncHeroVideo(form){const source=form.querySelector('[name="hero_video_source"]')?.value||'';form.querySelectorAll('[data-hero-video-media]').forEach(el=>setVisible(el,source==='media'));form.querySelectorAll('[data-hero-video-youtube]').forEach(el=>setVisible(el,source==='youtube'));}const pf=document.getElementById('page-form');syncHeroVideo(pf);pf.addEventListener('change',(e)=>{if(e.target.name==='hero_video_source')syncHeroVideo(pf);});const ps=setupDirtyForm(pf,()=>{const d=new URLSearchParams(new FormData(pf));d.set('hero_video',heroVideoPayload(pf));return d.toString();});pf.onsubmit=async(e)=>{e.preventDefault();if(!ps.changed())return;ps.markSaving();const payload=Object.fromEntries(new FormData(e.target));payload.hero_video=heroVideoPayload(e.target);const r=await fetch('/api/admin/pages/${pageId}',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const j=await r.json();if(j.ok&&j.publish?.ok)ps.markSaved();msg(j.ok?pm(j.publish):j.error.message,j.ok&&j.publish?.ok)};document.querySelectorAll('.block-form').forEach(wireBlock);document.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{const form=b.closest('.block-form');const r=await fetch('/api/admin/blocks/'+b.dataset.delete,{method:'DELETE'});const j=await r.json();msg(j.ok?pm(j.publish):j.error.message,j.ok&&j.publish?.ok);if(j.ok&&form)form.remove();});`; }
