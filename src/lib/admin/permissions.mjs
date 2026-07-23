import { normalizeNavigationParentRef, normalizeNavigationRow, toNavigationPersistenceRow } from '../content/navigation-hierarchy.mjs';

export const adminScopes = Object.freeze(['pages', 'menu', 'media', 'settings', 'publish', 'users', 'audit']);
export const scopeActions = Object.freeze({ pages: Object.freeze(['save', 'archive', 'delete']), menu: Object.freeze(['save', 'archive', 'delete']), media: Object.freeze(['save', 'archive', 'delete']), settings: Object.freeze(['save']), publish: Object.freeze(['republish', 'restore']), users: Object.freeze(['save', 'archive']), audit: Object.freeze([]) });
export const adminNavItems = Object.freeze([{ scope: 'pages', href: '/admin/pages', label: 'Oldalak', u1: true }, { scope: 'menu', href: '/admin/menu', label: 'Menü', u1: true }, { scope: 'media', href: '/admin/media', label: 'Média', u1: true }, { scope: 'settings', href: '/admin/settings', label: 'Alapadatok', u1: true }, { scope: 'publish', href: '/admin/publish', label: 'Korábbi élesítések', u1: true }, { scope: 'users', href: '/admin/users', label: 'Felhasználók', u1: false }, { scope: 'audit', href: '/admin/audit', label: 'Napló', u1: false }]);
const empty = () => ({ canSave: false, canArchive: false, canDelete: false, canRepublish: false, canRestore: false });
const row = (p = {}) => ({ ...empty(), ...p });
export const defaultNewUserPermissionMatrix = Object.freeze({ pages: row({ canSave: true, canArchive: true }), menu: row({ canSave: true, canArchive: true }), media: row({ canSave: true, canArchive: true }), settings: row({ canSave: true }), publish: row() });
export const fullAdminPermissionMatrix = Object.freeze({ pages: row({ canSave: true, canArchive: true, canDelete: true }), menu: row({ canSave: true, canArchive: true, canDelete: true }), media: row({ canSave: true, canArchive: true }), settings: row({ canSave: true }), publish: row({ canRepublish: true, canRestore: true }), users: row({ canSave: true, canArchive: true }), audit: row() });
export function sqlPermissionRows(matrix = fullAdminPermissionMatrix) { return Object.entries(matrix).map(([scope, p]) => ({ scope_code: scope, can_save: p.canSave ? 1 : 0, can_archive: p.canArchive ? 1 : 0, can_delete: p.canDelete ? 1 : 0, can_republish: p.canRepublish ? 1 : 0, can_restore: p.canRestore ? 1 : 0 })); }
export function normalizePermissions(rows = []) { const out = {}; for (const r of rows || []) { const scope = String(r.scope_code || r.scope || '').trim(); if (!adminScopes.includes(scope)) continue; out[scope] = row({ canSave: r.can_save === 1 || r.can_save === true, canArchive: r.can_archive === 1 || r.can_archive === true, canDelete: r.can_delete === 1 || r.can_delete === true, canRepublish: r.can_republish === 1 || r.can_republish === true, canRestore: r.can_restore === 1 || r.can_restore === true }); for (const key of Object.keys(out[scope])) { const short = key.replace(/^can/, '').toLowerCase(); if (!scopeActions[scope].includes(short)) out[scope][key] = false; } } return out; }
export function hasScope(permissions, scope) { return adminScopes.includes(scope) && Boolean(permissions?.[scope]); }
export function hasAction(permissions, scope, action) { if (!hasScope(permissions, scope) || !scopeActions[scope].includes(action)) return false; const key = { save: 'canSave', archive: 'canArchive', delete: 'canDelete', republish: 'canRepublish', restore: 'canRestore' }[action]; return Boolean(key && permissions[scope][key] === true); }
export function requiredAllowed(permissions, required = []) { return required.every((r) => r.action ? hasAction(permissions, r.scope, r.action) : hasScope(permissions, r.scope)); }
export function permissionRowsForInsert(matrix = fullAdminPermissionMatrix) { return sqlPermissionRows(matrix); }

const rule = (pattern, methods, scope, action, opts = {}) => ({ pattern, methods: Array.isArray(methods) ? methods : [methods], scope, action, ...opts });
export const adminRouteRules = Object.freeze([
  rule(/^\/admin$/, ['GET'], null, null, { public: true }), rule(/^\/admin\/login$/, ['GET'], null, null, { public: true }), rule(/^\/api\/admin\/login$/, ['POST'], null, null, { public: true }),
  rule(/^\/admin\/dashboard$/, ['GET'], 'pages'), rule(/^\/api\/admin\/session$/, ['GET'], null, null, { authOnly: true }), rule(/^\/api\/admin\/logout$/, ['POST'], null, null, { authOnly: true, csrf: true }),
  rule(/^\/admin\/pages$/, ['GET'], 'pages'), rule(/^\/admin\/pages\/\d+$/, ['GET'], 'pages'), rule(/^\/admin\/pages\/\d+\/home\/preview(?:\/.*)?$/, ['GET'], 'pages'),
  rule(/^\/api\/admin\/pages$/, ['GET'], 'pages'), rule(/^\/api\/admin\/pages$/, ['POST'], 'pages', 'save'), rule(/^\/api\/admin\/pages\/\d+$/, ['GET'], 'pages'), rule(/^\/api\/admin\/pages\/\d+$/, ['PUT','PATCH'], 'pages'), rule(/^\/api\/admin\/pages\/\d+$/, ['DELETE'], 'pages', 'delete'), rule(/^\/api\/admin\/pages\/\d+\/home$/, ['PUT'], 'pages'),
  rule(/^\/api\/admin\/blocks$/, ['POST'], 'pages'), rule(/^\/api\/admin\/blocks\/\d+$/, ['DELETE'], 'pages', 'archive'),
  rule(/^\/admin\/menu$/, ['GET'], 'menu'), rule(/^\/api\/admin\/navigation$/, ['GET'], 'menu'), rule(/^\/api\/admin\/navigation$/, ['POST','PUT'], 'menu'), rule(/^\/api\/admin\/navigation\/\d+$/, ['DELETE'], 'menu', 'delete'),
  rule(/^\/admin\/media$/, ['GET'], 'media'), rule(/^\/api\/admin\/media$/, ['GET'], 'media'), rule(/^\/api\/admin\/media$/, ['POST'], 'media', 'save'), rule(/^\/api\/admin\/media\/\d+\/file$/, ['GET'], 'media'), rule(/^\/api\/admin\/media\/\d+$/, ['PATCH','PUT'], 'media'), rule(/^\/api\/admin\/media\/\d+$/, ['DELETE'], 'media', 'archive'),
  rule(/^\/admin\/settings$/, ['GET'], 'settings'), rule(/^\/api\/admin\/settings$/, ['GET'], 'settings'), rule(/^\/api\/admin\/settings$/, ['POST','PUT'], 'settings', 'save'),
  rule(/^\/admin\/publish$/, ['GET'], 'publish'), rule(/^\/api\/admin\/publish$/, ['POST'], 'publish', 'republish'), rule(/^\/api\/admin\/publish\/rollback\/\d+$/, ['POST'], 'publish', 'restore'),
]);
export function routeRequirement(method, pathname) { const m = String(method || 'GET').toUpperCase(); const p = String(pathname || ''); const matches = adminRouteRules.filter((r) => r.pattern.test(p)); if (!matches.length) return p.startsWith('/admin') || p.startsWith('/api/admin') ? { unmapped: true } : null; const exact = matches.find((r) => r.methods.includes(m)); if (!exact) return { methodAllowed: false, allowed: [...new Set(matches.flatMap((r) => r.methods))] }; if (exact.public) return { public: true }; return { authOnly: exact.authOnly === true, required: exact.scope ? [{ scope: exact.scope, action: exact.action }] : [], csrf: exact.csrf === true || ['POST','PUT','PATCH','DELETE'].includes(m) } }

const normScalar = (v) => v == null ? '' : String(v).trim();
const normNumber = (v) => v == null || v === '' ? '' : String(Number(v));
const normJson = (v) => { if (v == null || v === '') return ''; try { return JSON.stringify(typeof v === 'string' ? JSON.parse(v) : v); } catch { return String(v); } };
function statusNeeds(before, after) { if (before === after) return { save: false, archive: false }; if (before !== 'archived' && after === 'archived') return { save: false, archive: true }; if (before === 'archived' && after !== 'archived') return { save: true, archive: false }; return { save: true, archive: false }; }
function classifyEntity(current, payload, fields, normalizers = {}, { isNew = false } = {}) { if (isNew) return { needsSave: true, needsArchive: false, noOp: false }; if (!payload || Object.keys(payload).length === 0) return { needsSave: false, needsArchive: false, noOp: true }; let needsSave = false, needsArchive = false, considered = false; if (Object.prototype.hasOwnProperty.call(payload, 'status')) { considered = true; const s = statusNeeds(normScalar(current?.status || 'draft'), normScalar(payload.status || '')); needsSave ||= s.save; needsArchive ||= s.archive; } for (const f of fields) { if (f === 'status' || !Object.prototype.hasOwnProperty.call(payload, f)) continue; considered = true; const n = normalizers[f] || normScalar; if (n(current?.[f]) !== n(payload[f])) needsSave = true; } return { needsSave, needsArchive, noOp: !considered || (!needsSave && !needsArchive) }; }
export const pageMutationFields = ['route','slug','type','title','seo_title','seo_description','hero_eyebrow','hero_title','hero_description','hero_asset','hero_video','hero_height','hero_image_fit','hero_image_position_x','hero_image_position_y','hero_image_position_mobile_x','hero_image_position_mobile_y','hero_overlay_strength','hero_image_scale','presentation','status','sort_order'];
export const blockMutationFields = ['page_id','block_key','type','title','body','items','presentation','sort_order','status'];
export const navigationMutationFields = ['title','href','target_type','target_page_id','title_override','parent_id','sort_order','status'];
export const mediaMutationFields = ['alt','status'];
const pageNorm = { hero_video: normJson, presentation: normJson, sort_order: normNumber, hero_image_position_x: normNumber, hero_image_position_y: normNumber, hero_image_position_mobile_x: normNumber, hero_image_position_mobile_y: normNumber, hero_image_scale: normNumber };
const blockNorm = { page_id: normNumber, items: normJson, presentation: normJson, sort_order: normNumber };
const navNorm = { target_page_id: normNumber, parent_id: normNumber, sort_order: normNumber };
export const classifyPageMutation = (current, payload, options) => classifyEntity(current, payload, pageMutationFields, pageNorm, options);
export const classifyBlockMutation = (current, payload, options) => classifyEntity(current, payload, blockMutationFields, blockNorm, options);
export const classifyMediaMutation = (current, payload, options) => classifyEntity(current, payload, mediaMutationFields, {}, options);
export function classifyNavigationBulk(currentRows = [], nextRows = []) { let needsSave = false, needsArchive = false, noOp = true; const byId = new Map((currentRows || []).map((r) => [String(r.id), r])); for (const item of nextRows || []) { const current = item.id ? byId.get(String(item.id)) : null; const cls = classifyEntity(current, item, navigationMutationFields, navNorm, { isNew: !current }); needsSave ||= cls.needsSave; needsArchive ||= cls.needsArchive; noOp &&= cls.noOp; } return { needsSave, needsArchive, noOp }; }
export function classifyHomeAggregateMutation(current = {}, payload = {}) { let needsSave = false, needsArchive = false, noOp = true; const pagePayload = payload.page || {}; const pageCls = classifyPageMutation(current.page || {}, pagePayload); needsSave ||= pageCls.needsSave; needsArchive ||= pageCls.needsArchive; noOp &&= pageCls.noOp; const blocksById = new Map((current.blocks || []).map((b) => [String(b.id), b])); for (const block of Object.values(payload.blocks || {})) { const id = block?.id; const cls = classifyBlockMutation(id ? blocksById.get(String(id)) : null, block, { isNew: !id || !blocksById.has(String(id)) }); needsSave ||= cls.needsSave; needsArchive ||= cls.needsArchive; noOp &&= cls.noOp; } for (const id of payload.archived_block_ids || []) { const b = blocksById.get(String(id)); if (b && String(b.status) !== 'archived') { needsArchive = true; noOp = false; } } return { needsSave, needsArchive, noOp }; }
export const classifyStatusMutation = classifyPageMutation;

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);
const asStatus = (value, fallback = 'draft') => String(value ?? fallback).trim() || fallback;
function stableJson(value) {
  const trimmed = typeof value === 'string' ? value.trim() : ''; const v = trimmed && /^[\[{]/.test(trimmed) ? JSON.parse(trimmed) : value;
  if (v == null || v === '') return null;
  if (Array.isArray(v)) return v.map((item) => stableJson(item));
  if (typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((key) => [key, stableJson(v[key])]));
  return v;
}
function sameJson(a, b) { return JSON.stringify(stableJson(a)) === JSON.stringify(stableJson(b)); }
function parseObject(value) { const trimmed = typeof value === 'string' ? value.trim() : ''; const v = trimmed && /^[\[{]/.test(trimmed) ? JSON.parse(trimmed) : value; return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
export function normalizePagePresentationForPlan(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) && !hasOwn(value, 'heroVariant') && !hasOwn(value, 'hero_variant') && hasOwn(value, 'presentation_hero_variant') ? { heroVariant: value.presentation_hero_variant } : value;
  const raw = parseObject(source);
  const variant = String(raw.heroVariant ?? raw.hero_variant ?? 'listing').trim() || 'listing';
  return { heroVariant: variant };
}
function normalizePageNext(current = {}, payload = {}) {
  const next = { ...current, ...payload };
  if (hasOwn(payload, 'presentation') || hasOwn(payload, 'presentation_hero_variant')) next.presentation = normalizePagePresentationForPlan(hasOwn(payload, 'presentation') ? payload.presentation : payload);
  else next.presentation = current.presentation;
  return next;
}
function diffStatusActions(before, after) {
  const s = statusNeeds(asStatus(before), asStatus(after));
  return { needsSave: s.save, needsArchive: s.archive };
}
function planResult(next, persistedFields, current, isNew = false) {
  if (isNew) return { next, needsSave: true, needsArchive: false, noOp: false, required: [{ scope: 'pages', action: 'save' }] };
  let needsSave = false, needsArchive = false;
  const status = diffStatusActions(current.status, next.status);
  needsSave ||= status.needsSave; needsArchive ||= status.needsArchive;
  for (const field of persistedFields) {
    if (field === 'status') continue;
    const n = field.endsWith('_id') || field === 'sort_order' || field === 'page_id' ? normNumber : (field === 'items' || field === 'presentation' || field === 'hero_video' ? (v) => JSON.stringify(stableJson(v)) : normScalar);
    if (n(current[field]) !== n(next[field])) needsSave = true;
  }
  return { next, needsSave, needsArchive, noOp: !needsSave && !needsArchive, required: [...(needsSave ? [{ scope: 'pages', action: 'save' }] : []), ...(needsArchive ? [{ scope: 'pages', action: 'archive' }] : [])] };
}
export function buildPageEffectiveMutationPlan(current = {}, payload = {}) {
  const next = normalizePageNext(current, payload);
  return planResult(next, pageMutationFields, current, false);
}
function parseArrayJson(value) { if (value == null || value === '') return []; const v = typeof value === 'string' ? JSON.parse(value) : value; return Array.isArray(v) ? v : []; }
export function buildBlockEffectiveMutationPlan(current = null, payload = {}) {
  const isNew = !current;
  const base = isNew ? {} : current;
  const next = { ...base };
  for (const f of blockMutationFields) if (hasOwn(payload, f)) next[f] = payload[f];
  if (isNew) {
    next.page_id = payload.page_id;
    next.block_key = payload.block_key;
    next.type = payload.type || 'text';
    next.title = payload.title || '';
    next.body = payload.body || '';
    next.items = hasOwn(payload, 'items') ? parseArrayJson(payload.items) : [];
    next.presentation = hasOwn(payload, 'presentation') ? stableJson(payload.presentation) : null;
    next.sort_order = Number(payload.sort_order || 0);
    next.status = payload.status || 'published';
  } else {
    next.items = hasOwn(payload, 'items') ? parseArrayJson(payload.items) : parseArrayJson(current.items);
    next.presentation = hasOwn(payload, 'presentation') ? stableJson(payload.presentation) : stableJson(current.presentation);
    next.sort_order = hasOwn(payload, 'sort_order') ? Number(payload.sort_order || 0) : Number(current.sort_order || 0);
    next.status = hasOwn(payload, 'status') ? payload.status : current.status;
  }
  return planResult(next, blockMutationFields, current || {}, isNew);
}
export function buildHomeAggregateEffectiveMutationPlan(current = {}, payload = {}) {
  const pagePlan = buildPageEffectiveMutationPlan(current.page || {}, payload.page || {});
  let needsSave = pagePlan.needsSave, needsArchive = pagePlan.needsArchive;
  const blocksById = new Map((current.blocks || []).map((b) => [String(b.id), b]));
  const blockPlans = [];
  for (const raw of payload.blocks || []) {
    const existing = raw?.id ? blocksById.get(String(raw.id)) : null;
    const plan = buildBlockEffectiveMutationPlan(existing || null, { ...(raw || {}), page_id: current.page?.id ?? raw?.page_id });
    blockPlans.push({ ...plan, id: raw?.id || null, client_key: raw?.client_key || raw?.clientKey || '' });
    needsSave ||= plan.needsSave; needsArchive ||= plan.needsArchive;
  }
  const archiveIds = [];
  for (const rawId of payload.archived_block_ids || []) {
    const b = blocksById.get(String(rawId));
    if (b && asStatus(b.status) !== 'archived') {
      const plan = buildBlockEffectiveMutationPlan(b, { status: 'archived' });
      archiveIds.push(Number(rawId));
      needsSave ||= plan.needsSave; needsArchive ||= plan.needsArchive;
    }
  }
  const noOp = !needsSave && !needsArchive;
  const nextPayload = { ...payload, page: pagePlan.next, blocks: blockPlans.filter((p) => !p.noOp).map((p) => p.next), archived_block_ids: archiveIds };
  return { nextPayload, pagePlan, blockPlans, archiveIds, needsSave, needsArchive, noOp, required: [...(needsSave ? [{ scope: 'pages', action: 'save' }] : []), ...(needsArchive ? [{ scope: 'pages', action: 'archive' }] : [])] };
}
function normalizeNavPersist(row = {}, { parentId } = {}) {
  const normalized = normalizeNavigationRow(row);
  const out = toNavigationPersistenceRow({ ...row, ...normalized }, { parentId: parentId !== undefined ? parentId : normalized.parent_id });
  return { title: out.title || '', href: out.href ?? null, target_type: out.target_type || 'legacy', target_page_id: out.target_page_id == null || out.target_page_id === '' ? null : Number(out.target_page_id), title_override: out.title_override ?? null, parent_id: out.parent_id == null || out.parent_id === '' ? null : Number(out.parent_id), sort_order: Number(out.sort_order || 0), status: out.status || 'draft', id: out.id ? Number(out.id) : undefined, client_key: out.client_key || out.clientKey || out._client_key || undefined };
}
export function buildNavigationEffectiveMutationPlan(currentRows = [], submittedRows = []) {
  const currentById = new Map((currentRows || []).map((r) => [String(r.id), normalizeNavPersist(r)]));
  let needsSave = false, needsArchive = false;
  const nextRows = [];
  for (const raw of submittedRows || []) {
    const current = raw?.id ? currentById.get(String(raw.id)) : null;
    const parentRef = normalizeNavigationParentRef(raw);
    const parentId = parentRef?.startsWith('id:') ? Number(parentRef.slice(3)) : null;
    const next = normalizeNavPersist({ ...(current || {}), ...(raw || {}), parent_ref: parentRef }, { parentId });
    nextRows.push(next);
    if (!current) { needsSave = true; continue; }
    const status = diffStatusActions(current.status, next.status);
    needsSave ||= status.needsSave; needsArchive ||= status.needsArchive;
    for (const f of navigationMutationFields) {
      if (f === 'status') continue;
      const n = navNorm[f] || normScalar;
      if (n(current[f]) !== n(next[f])) needsSave = true;
    }
  }
  return { nextRows, needsSave, needsArchive, noOp: !needsSave && !needsArchive, required: [...(needsSave ? [{ scope: 'menu', action: 'save' }] : []), ...(needsArchive ? [{ scope: 'menu', action: 'archive' }] : [])] };
}
