import { normalizeNavigationParentRef, normalizeNavigationRow } from '../content/navigation-hierarchy.mjs';

export const adminScopes = Object.freeze(['pages', 'menu', 'media', 'settings', 'publish', 'users', 'audit']);
export const scopeActions = Object.freeze({
  pages: Object.freeze(['save', 'archive', 'delete']),
  menu: Object.freeze(['save', 'archive', 'delete']),
  media: Object.freeze(['save', 'archive', 'delete']),
  settings: Object.freeze(['save']),
  publish: Object.freeze(['republish', 'restore']),
  users: Object.freeze(['save', 'archive']),
  audit: Object.freeze([]),
});
export const adminNavItems = Object.freeze([
  { scope: 'pages', href: '/admin/pages', label: 'Oldalak', u1: true },
  { scope: 'menu', href: '/admin/menu', label: 'Menü', u1: true },
  { scope: 'media', href: '/admin/media', label: 'Média', u1: true },
  { scope: 'settings', href: '/admin/settings', label: 'Alapadatok', u1: true },
  { scope: 'publish', href: '/admin/publish', label: 'Korábbi élesítések', u1: true },
  { scope: 'users', href: '/admin/users', label: 'Felhasználók', u1: true },
  { scope: 'audit', href: '/admin/audit', label: 'Napló', u1: true },
]);

const empty = () => ({ canSave: false, canArchive: false, canDelete: false, canRepublish: false, canRestore: false });
const row = (p = {}) => ({ ...empty(), ...p });
export const defaultNewUserPermissionMatrix = Object.freeze({
  pages: row({ canSave: true, canArchive: true }),
  menu: row({ canSave: true, canArchive: true }),
  media: row({ canSave: true, canArchive: true }),
  settings: row({ canSave: true }),
  publish: row(),
});
export const fullAdminPermissionMatrix = Object.freeze({
  pages: row({ canSave: true, canArchive: true, canDelete: true }),
  menu: row({ canSave: true, canArchive: true, canDelete: true }),
  media: row({ canSave: true, canArchive: true }),
  settings: row({ canSave: true }),
  publish: row({ canRepublish: true, canRestore: true }),
  users: row({ canSave: true, canArchive: true }),
  audit: row(),
});
export function sqlPermissionRows(matrix = fullAdminPermissionMatrix) {
  return Object.entries(matrix).map(([scope, p]) => ({
    scope_code: scope,
    can_save: p.canSave ? 1 : 0,
    can_archive: p.canArchive ? 1 : 0,
    can_delete: p.canDelete ? 1 : 0,
    can_republish: p.canRepublish ? 1 : 0,
    can_restore: p.canRestore ? 1 : 0,
  }));
}
export function normalizePermissions(rows = []) {
  const out = {};
  for (const r of rows || []) {
    const scope = String(r.scope_code || r.scope || '').trim();
    if (!adminScopes.includes(scope)) continue;
    out[scope] = row({
      canSave: r.can_save === 1 || r.can_save === true,
      canArchive: r.can_archive === 1 || r.can_archive === true,
      canDelete: r.can_delete === 1 || r.can_delete === true,
      canRepublish: r.can_republish === 1 || r.can_republish === true,
      canRestore: r.can_restore === 1 || r.can_restore === true,
    });
    for (const key of Object.keys(out[scope])) {
      const action = key.replace(/^can/, '').toLowerCase();
      if (!scopeActions[scope].includes(action)) out[scope][key] = false;
    }
  }
  return out;
}
export function hasScope(permissions, scope) {
  return adminScopes.includes(scope) && Boolean(permissions?.[scope]);
}
export function hasAction(permissions, scope, action) {
  if (!hasScope(permissions, scope) || !scopeActions[scope].includes(action)) return false;
  const key = { save: 'canSave', archive: 'canArchive', delete: 'canDelete', republish: 'canRepublish', restore: 'canRestore' }[action];
  return Boolean(key && permissions[scope][key] === true);
}
export function requiredAllowed(permissions, required = []) {
  return required.every((r) => r.action ? hasAction(permissions, r.scope, r.action) : hasScope(permissions, r.scope));
}
export function permissionRowsForInsert(matrix = fullAdminPermissionMatrix) {
  return sqlPermissionRows(matrix);
}

const rule = (pattern, methods, scope, action, opts = {}) => ({
  pattern,
  methods: Array.isArray(methods) ? methods : [methods],
  scope,
  action,
  ...opts,
});
export const adminRouteRules = Object.freeze([
  rule(/^\/admin$/, ['GET'], null, null, { public: true }),
  rule(/^\/admin\/login$/, ['GET'], null, null, { public: true }),
  rule(/^\/api\/admin\/login$/, ['POST'], null, null, { public: true }),
  rule(/^\/admin\/forgot-password$/, ['GET'], null, null, { public: true }),
  rule(/^\/admin\/reset-password$/, ['GET'], null, null, { public: true }),
  rule(/^\/api\/admin\/password-reset\/request$/, ['POST'], null, null, { public: true }),
  rule(/^\/api\/admin\/password-reset\/confirm$/, ['POST'], null, null, { public: true }),
  rule(/^\/admin\/dashboard$/, ['GET'], 'pages'),
  rule(/^\/api\/admin\/session$/, ['GET'], null, null, { authOnly: true }),
  rule(/^\/api\/admin\/logout$/, ['POST'], null, null, { authOnly: true, csrf: true }),
  rule(/^\/admin\/pages$/, ['GET'], 'pages'),
  rule(/^\/admin\/pages\/\d+$/, ['GET'], 'pages'),
  rule(/^\/admin\/pages\/\d+\/home\/preview(?:\/.*)?$/, ['GET'], 'pages'),
  rule(/^\/api\/admin\/pages$/, ['GET'], 'pages'),
  rule(/^\/api\/admin\/pages$/, ['POST'], 'pages', 'save'),
  rule(/^\/api\/admin\/pages\/\d+$/, ['GET'], 'pages'),
  rule(/^\/api\/admin\/pages\/\d+$/, ['PUT', 'PATCH'], 'pages'),
  rule(/^\/api\/admin\/pages\/\d+$/, ['DELETE'], 'pages', 'delete'),
  rule(/^\/api\/admin\/pages\/\d+\/home$/, ['PUT'], 'pages'),
  rule(/^\/api\/admin\/blocks$/, ['POST'], 'pages'),
  rule(/^\/api\/admin\/blocks\/\d+$/, ['DELETE'], 'pages', 'archive'),
  rule(/^\/admin\/menu$/, ['GET'], 'menu'),
  rule(/^\/api\/admin\/navigation$/, ['GET'], 'menu'),
  rule(/^\/api\/admin\/navigation$/, ['POST', 'PUT'], 'menu'),
  rule(/^\/api\/admin\/navigation\/\d+$/, ['DELETE'], 'menu', 'delete'),
  rule(/^\/admin\/media$/, ['GET'], 'media'),
  rule(/^\/api\/admin\/media$/, ['GET'], 'media'),
  rule(/^\/api\/admin\/media$/, ['POST'], 'media', 'save'),
  rule(/^\/api\/admin\/media\/\d+\/file$/, ['GET'], 'media'),
  rule(/^\/api\/admin\/media\/\d+$/, ['PATCH', 'PUT'], 'media'),
  rule(/^\/api\/admin\/media\/\d+$/, ['DELETE'], 'media', 'archive'),
  rule(/^\/admin\/settings$/, ['GET'], 'settings'),
  rule(/^\/api\/admin\/settings$/, ['GET'], 'settings'),
  rule(/^\/api\/admin\/settings$/, ['POST', 'PUT'], 'settings', 'save'),
  rule(/^\/admin\/publish$/, ['GET'], 'publish'),
  rule(/^\/admin\/audit$/, ['GET'], 'audit'),
  rule(/^\/api\/admin\/audit$/, ['GET'], 'audit'),
  rule(/^\/admin\/users$/, ['GET'], 'users'),
  rule(/^\/api\/admin\/users$/, ['GET'], 'users'),
  rule(/^\/api\/admin\/users$/, ['POST'], 'users', 'save'),
  rule(/^\/api\/admin\/users\/\d+$/, ['GET'], 'users'),
  rule(/^\/api\/admin\/users\/\d+$/, ['PUT', 'PATCH'], 'users'),
  rule(/^\/api\/admin\/users\/\d+\/revoke-sessions$/, ['POST'], 'users', 'archive'),
  rule(/^\/api\/admin\/users\/\d+\/send-reset-link$/, ['POST'], 'users', 'save'),
  rule(/^\/api\/admin\/publish$/, ['POST'], 'publish', 'republish'),
  rule(/^\/api\/admin\/publish\/rollback\/\d+$/, ['POST'], 'publish', 'restore'),
]);
export function routeRequirement(method, pathname) {
  const m = String(method || 'GET').toUpperCase();
  const p = String(pathname || '');
  const matches = adminRouteRules.filter((r) => r.pattern.test(p));
  if (!matches.length) return p.startsWith('/admin') || p.startsWith('/api/admin') ? { unmapped: true } : null;
  const exact = matches.find((r) => r.methods.includes(m));
  if (!exact) return { methodAllowed: false, allowed: [...new Set(matches.flatMap((r) => r.methods))] };
  if (exact.public) return { public: true };
  return {
    authOnly: exact.authOnly === true,
    required: exact.scope ? [{ scope: exact.scope, action: exact.action }] : [],
    csrf: exact.csrf === true || ['POST', 'PUT', 'PATCH', 'DELETE'].includes(m),
  };
}

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);
const normScalar = (v) => v == null ? '' : String(v).trim();
const normNumber = (v) => v == null || v === '' ? '' : String(Number(v));
function parseJsonValue(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try { return JSON.parse(trimmed); } catch { return value; }
}
function stableJson(value) {
  const v = parseJsonValue(value);
  if (v == null || v === '') return null;
  if (Array.isArray(v)) return v.map((item) => stableJson(item));
  if (typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((key) => [key, stableJson(v[key])]));
  return v;
}
const normJson = (v) => JSON.stringify(stableJson(v));
const asStatus = (value, fallback = 'draft') => String(value ?? fallback).trim() || fallback;
function statusNeeds(before, after) {
  if (before === after) return { save: false, archive: false };
  if (before !== 'archived' && after === 'archived') return { save: false, archive: true };
  return { save: true, archive: false };
}
function diffStatusActions(before, after) {
  const result = statusNeeds(asStatus(before), asStatus(after));
  return { needsSave: result.save, needsArchive: result.archive };
}

export const pageMutationFields = [
  'route', 'slug', 'type', 'title', 'seo_title', 'seo_description',
  'hero_eyebrow', 'hero_title', 'hero_description', 'hero_asset', 'hero_video',
  'hero_height', 'hero_image_fit', 'hero_image_position_x', 'hero_image_position_y',
  'hero_image_position_mobile_x', 'hero_image_position_mobile_y',
  'hero_overlay_strength', 'hero_image_scale', 'presentation', 'status', 'sort_order',
];
export const blockMutationFields = [
  'page_id', 'block_key', 'type', 'title', 'body', 'items', 'presentation', 'sort_order', 'status',
];
export const navigationMutationFields = [
  'title', 'href', 'target_type', 'target_page_id', 'title_override', 'parent_ref', 'sort_order', 'status',
];
export const mediaMutationFields = ['alt', 'status'];

const pageNorm = {
  hero_video: normJson,
  presentation: normJson,
  sort_order: normNumber,
  hero_image_position_x: normNumber,
  hero_image_position_y: normNumber,
  hero_image_position_mobile_x: normNumber,
  hero_image_position_mobile_y: normNumber,
  hero_image_scale: normNumber,
};
const blockNorm = { page_id: normNumber, items: normJson, presentation: normJson, sort_order: normNumber };
const navNorm = { target_page_id: normNumber, parent_ref: normScalar, sort_order: normNumber };

function classifyEntity(current, payload, fields, normalizers = {}, { isNew = false } = {}) {
  if (isNew) return { needsSave: true, needsArchive: false, noOp: false };
  if (!payload || Object.keys(payload).length === 0) return { needsSave: false, needsArchive: false, noOp: true };
  let needsSave = false;
  let needsArchive = false;
  let considered = false;
  if (hasOwn(payload, 'status')) {
    considered = true;
    const status = statusNeeds(normScalar(current?.status || 'draft'), normScalar(payload.status || ''));
    needsSave ||= status.save;
    needsArchive ||= status.archive;
  }
  for (const field of fields) {
    if (field === 'status' || !hasOwn(payload, field)) continue;
    considered = true;
    const normalize = normalizers[field] || normScalar;
    if (normalize(current?.[field]) !== normalize(payload[field])) needsSave = true;
  }
  return { needsSave, needsArchive, noOp: !considered || (!needsSave && !needsArchive) };
}
export const classifyPageMutation = (current, payload, options) => classifyEntity(current, payload, pageMutationFields, pageNorm, options);
export const classifyBlockMutation = (current, payload, options) => classifyEntity(current, payload, blockMutationFields, blockNorm, options);
export const classifyMediaMutation = (current, payload, options) => classifyEntity(current, payload, mediaMutationFields, {}, options);
export const classifyStatusMutation = classifyPageMutation;
export function classifyNavigationBulk(currentRows = [], nextRows = []) {
  const plan = buildNavigationEffectiveMutationPlan(currentRows, nextRows);
  return { needsSave: plan.needsSave, needsArchive: plan.needsArchive, noOp: plan.noOp };
}
export function classifyHomeAggregateMutation(current = {}, payload = {}) {
  const plan = buildHomeAggregateEffectiveMutationPlan(current, payload);
  return { needsSave: plan.needsSave, needsArchive: plan.needsArchive, noOp: plan.noOp };
}

function parseObject(value) {
  const v = parseJsonValue(value);
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}
export function normalizePagePresentationForPlan(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    && !hasOwn(value, 'heroVariant') && !hasOwn(value, 'hero_variant')
    && hasOwn(value, 'presentation_hero_variant')
    ? { heroVariant: value.presentation_hero_variant }
    : value;
  const raw = parseObject(source);
  const variant = String(raw.heroVariant ?? raw.hero_variant ?? 'listing').trim() || 'listing';
  return { heroVariant: variant };
}
function normalizePageNext(current = {}, payload = {}) {
  const next = { ...current, ...payload };
  if (hasOwn(payload, 'presentation') || hasOwn(payload, 'presentation_hero_variant')) {
    next.presentation = normalizePagePresentationForPlan(hasOwn(payload, 'presentation') ? payload.presentation : payload);
  } else {
    next.presentation = current.presentation;
  }
  delete next.presentation_hero_variant;
  return next;
}
function normalizerFor(field) {
  if (field.endsWith('_id') || field === 'sort_order' || field === 'page_id') return normNumber;
  if (field === 'items' || field === 'presentation' || field === 'hero_video') return normJson;
  if (field === 'parent_ref') return normScalar;
  return normScalar;
}
function planResult(next, persistedFields, current, isNew = false, scope = 'pages') {
  if (isNew) {
    return { next, needsSave: true, needsArchive: false, noOp: false, required: [{ scope, action: 'save' }] };
  }
  let needsSave = false;
  let needsArchive = false;
  const status = diffStatusActions(current.status, next.status);
  needsSave ||= status.needsSave;
  needsArchive ||= status.needsArchive;
  for (const field of persistedFields) {
    if (field === 'status') continue;
    const normalize = normalizerFor(field);
    if (normalize(current[field]) !== normalize(next[field])) needsSave = true;
  }
  return {
    next,
    needsSave,
    needsArchive,
    noOp: !needsSave && !needsArchive,
    required: [
      ...(needsSave ? [{ scope, action: 'save' }] : []),
      ...(needsArchive ? [{ scope, action: 'archive' }] : []),
    ],
  };
}
export function buildPageEffectiveMutationPlan(current = {}, payload = {}) {
  return planResult(normalizePageNext(current, payload), pageMutationFields, current, false, 'pages');
}

function parseArrayJson(value) {
  const v = parseJsonValue(value);
  return Array.isArray(v) ? v : [];
}
function normalizeVisibleKeys(value) {
  const parsed = parseJsonValue(value);
  if (!Array.isArray(parsed)) return [];
  return [...new Set(parsed.map((key) => String(key || '').trim()).filter(Boolean))];
}
function mergeBlockPresentationForPlan(currentValue, submittedValue, visibleKeysValue) {
  const current = parseObject(currentValue);
  const submitted = parseObject(submittedValue);
  const visibleKeys = normalizeVisibleKeys(visibleKeysValue);
  const next = { ...current };
  for (const key of visibleKeys) delete next[key];
  return stableJson({ ...next, ...submitted });
}
export function buildBlockEffectiveMutationPlan(current = null, payload = {}) {
  const isNew = !current;
  const base = isNew ? {} : current;
  const next = { ...base };
  for (const field of blockMutationFields) {
    if (hasOwn(payload, field)) next[field] = payload[field];
  }

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
    if (hasOwn(payload, 'presentation') || hasOwn(payload, 'presentation_visible_keys')) {
      next.presentation = mergeBlockPresentationForPlan(
        current.presentation,
        hasOwn(payload, 'presentation') ? payload.presentation : {},
        payload.presentation_visible_keys,
      );
    } else {
      next.presentation = stableJson(current.presentation);
    }
    next.sort_order = hasOwn(payload, 'sort_order') ? Number(payload.sort_order || 0) : Number(current.sort_order || 0);
    next.status = hasOwn(payload, 'status') ? payload.status : current.status;
  }

  if (hasOwn(payload, 'presentation_visible_keys')) {
    next.presentation_visible_keys = normalizeVisibleKeys(payload.presentation_visible_keys);
  }
  return planResult(next, blockMutationFields, current || {}, isNew, 'pages');
}
export function buildHomeAggregateEffectiveMutationPlan(current = {}, payload = {}) {
  const pagePlan = buildPageEffectiveMutationPlan(current.page || {}, payload.page || {});
  let needsSave = pagePlan.needsSave;
  let needsArchive = pagePlan.needsArchive;
  const blocksById = new Map((current.blocks || []).map((block) => [String(block.id), block]));
  const blockPlans = [];

  for (const raw of payload.blocks || []) {
    const existing = raw?.id ? blocksById.get(String(raw.id)) : null;
    const plan = buildBlockEffectiveMutationPlan(existing || null, {
      ...(raw || {}),
      page_id: current.page?.id ?? raw?.page_id,
    });
    blockPlans.push({ ...plan, id: raw?.id || null, client_key: raw?.client_key || raw?.clientKey || '' });
    needsSave ||= plan.needsSave;
    needsArchive ||= plan.needsArchive;
  }

  const archiveIds = [];
  for (const rawId of payload.archived_block_ids || []) {
    const block = blocksById.get(String(rawId));
    if (!block || asStatus(block.status) === 'archived') continue;
    const plan = buildBlockEffectiveMutationPlan(block, { status: 'archived' });
    archiveIds.push(Number(rawId));
    needsSave ||= plan.needsSave;
    needsArchive ||= plan.needsArchive;
  }

  const noOp = !needsSave && !needsArchive;
  const nextPayload = {
    ...payload,
    page: pagePlan.next,
    blocks: blockPlans.filter((plan) => !plan.noOp).map((plan) => ({
      ...plan.next,
      ...(plan.client_key ? { client_key: plan.client_key } : {}),
    })),
    archived_block_ids: archiveIds,
  };
  return {
    nextPayload,
    pagePlan,
    blockPlans,
    archiveIds,
    needsSave,
    needsArchive,
    noOp,
    required: [
      ...(needsSave ? [{ scope: 'pages', action: 'save' }] : []),
      ...(needsArchive ? [{ scope: 'pages', action: 'archive' }] : []),
    ],
  };
}

function canonicalParentRef(row = {}) {
  return normalizeNavigationParentRef(row);
}
function normalizeNavPersist(row = {}) {
  const normalized = normalizeNavigationRow(row);
  const parentRef = canonicalParentRef({ ...row, ...normalized });
  return {
    title: String(normalized.title ?? row.title ?? ''),
    href: normalized.target_type === 'group' ? null : (normalized.href ?? row.href ?? null),
    target_type: normalized.target_type || 'legacy',
    target_page_id: normalized.target_page_id == null || normalized.target_page_id === '' ? null : Number(normalized.target_page_id),
    title_override: normalized.title_override ?? row.title_override ?? null,
    parent_ref: parentRef,
    parent_id: parentRef?.startsWith('id:') ? Number(parentRef.slice(3)) : null,
    sort_order: Number(normalized.sort_order || 0),
    status: normalized.status || 'draft',
    id: normalized.id ? Number(normalized.id) : undefined,
    client_key: normalized.client_key || normalized.clientKey || normalized._client_key || row.client_key || row.clientKey || row._client_key || undefined,
  };
}
export function buildNavigationEffectiveMutationPlan(currentRows = [], submittedRows = []) {
  const currentById = new Map((currentRows || []).map((item) => [String(item.id), normalizeNavPersist(item)]));
  let needsSave = false;
  let needsArchive = false;
  const nextRows = [];

  for (const raw of submittedRows || []) {
    const current = raw?.id ? currentById.get(String(raw.id)) : null;
    const parentRef = canonicalParentRef(raw);
    const next = normalizeNavPersist({ ...(current || {}), ...(raw || {}), parent_ref: parentRef });
    nextRows.push(next);

    if (!current) {
      needsSave = true;
      continue;
    }
    const status = diffStatusActions(current.status, next.status);
    needsSave ||= status.needsSave;
    needsArchive ||= status.needsArchive;
    for (const field of navigationMutationFields) {
      if (field === 'status') continue;
      const normalize = navNorm[field] || normScalar;
      if (normalize(current[field]) !== normalize(next[field])) needsSave = true;
    }
  }

  return {
    nextRows,
    needsSave,
    needsArchive,
    noOp: !needsSave && !needsArchive,
    required: [
      ...(needsSave ? [{ scope: 'menu', action: 'save' }] : []),
      ...(needsArchive ? [{ scope: 'menu', action: 'archive' }] : []),
    ],
  };
}
