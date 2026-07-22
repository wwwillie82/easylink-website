import { resolveCardTarget, rawCardTargetType, isInternalRouteCandidate, isValidHttpExternalUrl, buildPageIndexById } from './card-targets.mjs';
import { normalizeVideoItems } from './video.mjs';
import { normalizeAiPreviewItems } from './ai-preview.mjs';
import { normalizeNetworkVisualItems } from './network-visual.mjs';

const clean = (v) => String(v ?? '').trim();
const firstNonEmpty = (...values) => values.map(clean).find(Boolean) || '';
const obj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const field = (errors, path, message) => { if (errors && path && !errors[path]) errors[path] = message; };
export function isCardsV2(value) { return obj(value) && Number(value.version) === 2 && Array.isArray(value.cards); }
function cardSource(item = {}) { return obj(item) ? item : { title: item }; }
function normalizeCardInput(item = {}, path = 'items', errors = {}) {
  const source = cardSource(item);
  if (clean(source.kind) === 'section-action') field(errors, `${path}.kind`, 'A section action nem lehet kártya item.');
  let target_type = clean(source.target_type || (source.href || source.url ? 'legacy' : 'legacy'));
  try { target_type = rawCardTargetType(target_type); } catch { field(errors, `${path}.target_type`, 'Hibás cél típus.'); target_type = 'legacy'; }
  const titleOverride = clean(source.title_override);
  const textOverride = clean(source.text_override);
  const out = { target_type, title: firstNonEmpty(titleOverride, source.title, source.label), title_override: titleOverride, text: firstNonEmpty(textOverride, source.text, source.shortDescription, source.body), text_override: textOverride, linkLabel: clean(source.linkLabel ?? source.label ?? ''), badge: source.badge ?? source.order ?? '' };
  if (target_type === 'page') { const id = Number(source.target_page_id); if (!Number.isSafeInteger(id) || id <= 0) field(errors, `${path}.target_page_id`, 'Válassz publikus céloldalt.'); else out.target_page_id = id; }
  else if (target_type === 'legacy') { const href = clean(source.href ?? source.url); if (href && !isInternalRouteCandidate(href)) field(errors, `${path}.href`, 'Legacy cél csak biztonságos belső útvonal lehet.'); out.href = href; }
  else if (target_type === 'external') { const href = clean(source.href ?? source.url); if (href && !isValidHttpExternalUrl(href)) field(errors, `${path}.href`, 'Külső cél csak http(s) URL lehet.'); out.href = href; }
  return out;
}
function normalizeActionInput(action, path, errors) {
  if (!obj(action)) return null;
  const hasAny = ['target_type','target_page_id','href','url','label','title','title_override'].some((key) => clean(action[key]));
  if (!hasAny) return null;
  const normalized = normalizeCardInput({ ...action, title: action.label || action.title || action.title_override, linkLabel: action.label || action.linkLabel }, path, errors);
  const label = clean(action.label || action.title_override || action.title || action.linkLabel);
  if (!label) field(errors, `${path}.label`, 'A szekció gombfelirat kötelező.');
  return { target_type: normalized.target_type, ...(normalized.target_page_id ? { target_page_id: normalized.target_page_id } : {}), ...(normalized.href ? { href: normalized.href } : {}), label };
}
export function normalizeCardsItems(items = [], { fieldErrors = {}, path = 'items', pages = [], requirePublishedTargets = false } = {}) {
  const source = Array.isArray(items) ? items : [];
  const first = source[0];
  const contract = isCardsV2(first) ? first : { version: 2, variant: 'default', cards: source.filter((item) => clean(item?.kind || 'card') !== 'section-action'), action: source.find((item) => clean(item?.kind) === 'section-action') || null };
  const cards = (Array.isArray(contract.cards) ? contract.cards : []).map((item, index) => normalizeCardInput(item, `${path}.0.cards.${index}`, fieldErrors)).filter((item) => item.title || item.href || item.target_page_id);
  const action = normalizeActionInput(contract.action, `${path}.0.action`, fieldErrors);
  if (!Array.isArray(contract.cards)) field(fieldErrors, `${path}.0.cards`, 'A cards contract cards tömböt vár.');
  if (requirePublishedTargets) {
    const pagesById = buildPageIndexById(pages);
    for (const [index, card] of cards.entries()) if (card.target_type === 'page') {
      const page = pagesById.get(Number(card.target_page_id));
      if (!page) field(fieldErrors, `${path}.0.cards.${index}.target_page_id`, 'A céloldal nem található.');
      else if (page.status !== 'published') field(fieldErrors, `${path}.0.cards.${index}.target_page_id`, 'A céloldal csak publikus oldal lehet.');
    }
    if (action?.target_type === 'page') {
      const page = pagesById.get(Number(action.target_page_id));
      if (!page) field(fieldErrors, `${path}.0.action.target_page_id`, 'A céloldal nem található.');
      else if (page.status !== 'published') field(fieldErrors, `${path}.0.action.target_page_id`, 'A céloldal csak publikus oldal lehet.');
    }
  }
  return [{ version: 2, variant: clean(contract.variant) || 'default', cards, action }];
}
export function publicCardsFromItems(items = [], { pages = [] } = {}) {
  const normalized = normalizeCardsItems(items, { pages, requirePublishedTargets: false })[0];
  const pagesById = buildPageIndexById(pages);
  const resolve = (entry, index, isAction = false) => {
    if (!entry) return null;
    try {
      const resolved = resolveCardTarget({ ...entry, kind: isAction ? 'section-action' : 'card', title: entry.title || entry.title_override || entry.label, label: entry.label || entry.linkLabel }, { pagesById, itemIndex: index, requirePublished: false });
      return isAction ? { ...resolved, label: entry.label || resolved.title || resolved.linkLabel } : resolved;
    } catch (error) { if (entry.target_type === 'page') throw error; return isAction ? { href: entry.href || '', label: entry.label || entry.title || '' } : { ...entry, href: entry.href || entry.url || '', url: entry.href || entry.url || '' }; }
  };
  return { cards: normalized.cards.map((card, index) => resolve(card, index)).filter(Boolean), action: resolve(normalized.action, normalized.cards.length, true), variant: normalized.variant };
}
export function normalizeSplitTextItems(items = [], block = {}, { fieldErrors = {}, path = 'items', status = 'published' } = {}) {
  const first = obj(items?.[0]) ? items[0] : {};
  const heading = clean(first.heading || first.text || block.heading);
  const layout = ['split','default'].includes(clean(first.layout)) ? clean(first.layout) || 'split' : 'split';
  if (status === 'published' && !heading) field(fieldErrors, `${path}.0.heading`, 'A heading kötelező.');
  return [{ version: 1, heading, layout }];
}
export function normalizeAiAssistantItems(items = [], { fieldErrors = {}, path = 'items', status = 'published' } = {}) {
  const headings = items.filter((item) => clean(item?.kind) === 'heading' && clean(item.text || item.heading));
  const heading = clean(headings[0]?.text || headings[0]?.heading || obj(items[0]) && items[0].heading);
  const sources = items.filter((item) => clean(item?.kind) === 'source').map((item, index) => ({ kind: 'source', title: clean(item.title || item.label), order: item.order ?? index + 1 })).filter((item) => item.title);
  const roles = new Set(['user','assistant']);
  const messages = items.filter((item) => clean(item?.kind) === 'message').map((item, index) => { const role = roles.has(clean(item.role)) ? clean(item.role) : 'assistant'; if (clean(item.role) && !roles.has(clean(item.role))) field(fieldErrors, `${path}.${index}.role`, 'Ismeretlen üzenet szerep.'); return { kind: 'message', role, title: clean(item.title), text: String(item.text ?? '').trim(), order: item.order ?? index + 1 }; }).filter((item) => item.text || item.title);
  if (status === 'published') { if (!heading) field(fieldErrors, `${path}.0.heading`, 'Egy heading kötelező.'); if (!sources.length) field(fieldErrors, `${path}.sources`, 'Legalább egy source kötelező.'); if (!messages.some((m) => m.role === 'user' && m.text)) field(fieldErrors, `${path}.messages`, 'Legalább egy user üzenet kötelező.'); if (!messages.some((m) => m.role === 'assistant' && m.text)) field(fieldErrors, `${path}.messages`, 'Legalább egy assistant üzenet kötelező.'); }
  return [{ kind: 'heading', text: heading }, ...sources.map(({ title, order }) => ({ kind: 'source', title, order })), ...messages];
}
export function normalizeIntegrationsStripItems(items = [], { fieldErrors = {}, path = 'items', status = 'published' } = {}) {
  const headings = items.filter((item) => clean(item?.kind) === 'heading' && clean(item.text || item.heading));
  const heading = clean(headings[0]?.text || headings[0]?.heading || obj(items[0]) && items[0].heading);
  const seen = new Set();
  const nodes = [];
  for (const [index, item] of items.entries()) {
    if (clean(item?.kind) !== 'node') continue;
    const id = clean(item.id).toLowerCase(); const label = clean(item.label || item.title);
    if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(id)) field(fieldErrors, `${path}.${index}.id`, 'Az integration id csak kisbetű, szám, kötőjel vagy aláhúzás lehet.');
    if (seen.has(id)) field(fieldErrors, `${path}.${index}.id`, 'Duplikált integration id.');
    seen.add(id); if (!label) field(fieldErrors, `${path}.${index}.label`, 'A label kötelező.');
    if (id && label) nodes.push({ kind: 'node', id, label, order: item.order ?? nodes.length + 1 });
  }
  if (status === 'published') { if (!heading) field(fieldErrors, `${path}.0.heading`, 'Egy heading kötelező.'); if (!nodes.length) field(fieldErrors, `${path}.nodes`, 'Legalább egy integration item kötelező.'); }
  return [{ kind: 'heading', text: heading }, ...nodes];
}
export function normalizeBlockItemsByType(type, items, options = {}) {
  if (items === null || items === undefined) items = [];
  if (!Array.isArray(items)) { const e = new Error('Az items mezőnek JSON tömbnek kell lennie.'); e.code = 'INVALID_BLOCK_ITEMS'; throw e; }
  if (type === 'cards' || type === 'card-grid') return normalizeCardsItems(items, options);
  if (type === 'split-text') return normalizeSplitTextItems(items, options.block || {}, options);
  if (type === 'ai-assistant-preview') return normalizeAiAssistantItems(items, options);
  if (type === 'integrations-strip') return normalizeIntegrationsStripItems(items, options);
  if (type === 'video') return normalizeVideoItems(items);
  if (type === 'ai-preview') return normalizeAiPreviewItems(items);
  if (type === 'network-visual') return normalizeNetworkVisualItems(items).config ? [normalizeNetworkVisualItems(items).config] : items;
  if (type === 'related-links') return normalizeRelatedLinksItems(items, options);
  return items;
}

export function normalizeRelatedLinksItems(items = [], { fieldErrors = {}, path = 'items', pages = [], requirePublishedTargets = false } = {}) {
  const fail = (message) => { const error = new Error(message); error.code = 'VALIDATION_ERROR'; error.status = 400; throw error; };
  const pagesById = buildPageIndexById(pages);
  const source = Array.isArray(items) ? items : (field(fieldErrors, path, 'Az items mezőnek tömbnek kell lennie.'), []);
  const normalized = source.map((item, index) => {
    const target_type = clean(item?.target_type || '');
    const id = Number(item?.target_page_id);
    if (target_type !== 'page') field(fieldErrors, `${path}.${index}.target_type`, 'A cél típusa csak page lehet.');
    if (!Number.isSafeInteger(id) || id <= 0) field(fieldErrors, `${path}.${index}.target_page_id`, 'Válassz publikus céloldalt.');
    else if (requirePublishedTargets) {
      const page = pagesById.get(id);
      if (!page) field(fieldErrors, `${path}.${index}.target_page_id`, 'A céloldal nem található.');
      else if (page.status !== 'published') field(fieldErrors, `${path}.${index}.target_page_id`, 'A céloldal csak publikus oldal lehet.');
    }
    return { target_type: 'page', target_page_id: id, title_override: clean(item?.title_override) };
  });
  const messages = Object.values(fieldErrors).filter(Boolean);
  if (messages.length) fail(messages[0]);
  return normalized;
}
