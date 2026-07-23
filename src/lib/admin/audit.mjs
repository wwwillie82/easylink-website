import crypto from 'node:crypto';

export const AUDIT_RESULTS = Object.freeze(['success', 'failure', 'denied']);
export const AUDIT_EVENTS = Object.freeze([
  'admin_login_succeeded','admin_login_failed','admin_logout','admin_session_revoked','password_reset_requested','password_reset_completed','password_reset_failed',
  'admin_authorization_denied','admin_csrf_rejected',
  'admin_user_created','admin_user_updated','admin_user_disabled','admin_user_reactivated','admin_user_permissions_changed','admin_user_sessions_revoked','admin_user_reset_link_requested',
  'admin_page_created','admin_page_updated','admin_page_archived','admin_page_reactivated','admin_page_deleted',
  'admin_block_created','admin_block_updated','admin_block_archived','admin_block_reactivated','admin_block_deleted',
  'admin_navigation_saved','admin_navigation_item_deleted',
  'admin_media_uploaded','admin_media_updated','admin_media_archived','admin_media_reactivated',
  'admin_settings_updated','admin_publish_completed','admin_publish_failed','admin_publish_rollback_completed','admin_publish_rollback_failed',
]);
const EVENT_SET = new Set(AUDIT_EVENTS);
const RESULT_SET = new Set(AUDIT_RESULTS);
const FORBIDDEN_KEY_RE = /(password|token|session|csrf|cookie|authorization|smtp|secret|api[_-]?key)/i;
const MAX_META_JSON = 8000;
const MAX_DEPTH = 6;
const MAX_KEYS = 80;
const MAX_ARRAY = 50;
const MAX_STRING = 512;
function trunc(value, max) { if (value == null) return null; const s = String(value); return s.length > max ? `${s.slice(0, max - 1)}…` : s; }
function sanitizeKey(key) { return String(key || '').trim().slice(0, 120); }
export function sanitizeAuditMetadata(value, depth = 0) {
  if (value == null) return null;
  if (depth > MAX_DEPTH) return '[TRUNCATED_DEPTH]';
  if (typeof value === 'string') return trunc(value, MAX_STRING);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.slice(0, MAX_ARRAY).map((v) => sanitizeAuditMetadata(v, depth + 1)).concat(value.length > MAX_ARRAY ? [`[TRUNCATED_ARRAY:${value.length - MAX_ARRAY}]`] : []);
  if (typeof value === 'object') {
    const out = {};
    let count = 0;
    for (const [rawKey, rawVal] of Object.entries(value)) {
      const key = sanitizeKey(rawKey);
      if (!key) continue;
      if (FORBIDDEN_KEY_RE.test(key)) { out[key] = '[REDACTED]'; continue; }
      if (count++ >= MAX_KEYS) { out.__truncated_keys = Object.keys(value).length - MAX_KEYS; break; }
      out[key] = sanitizeAuditMetadata(rawVal, depth + 1);
    }
    return out;
  }
  return trunc(String(value), MAX_STRING);
}
export function normalizeAuditMetadata(metadata) {
  const sanitized = sanitizeAuditMetadata(metadata);
  if (sanitized == null) return null;
  let json = JSON.stringify(sanitized);
  if (json.length <= MAX_META_JSON) return sanitized;
  return { truncated: true, originalBytes: Buffer.byteLength(json), summary: trunc(json, MAX_META_JSON - 80) };
}
export function auditRequestContext(req, actor = null) {
  if (!req.__easylinkAuditRequestId) req.__easylinkAuditRequestId = crypto.randomUUID().replace(/-/g, '').slice(0, 64);
  const user = actor?.user || actor || null;
  return {
    request_id: req.__easylinkAuditRequestId,
    ip_address: trunc(req.socket?.remoteAddress || null, 64),
    user_agent: trunc(req.headers?.['user-agent'] || null, 512),
    actor_user_id: user?.id ?? user?.admin_user_id ?? null,
    actor_display_name: trunc(user?.displayName ?? user?.display_name ?? null, 255),
    actor_email: trunc(user?.email ?? null, 255),
  };
}
export function eventTargetLabel(value) { return trunc(value, 255); }
export async function writeAuditEvent(repo, req, event = {}) {
  if (!repo?.insertAuditEvent) return null;
  const event_code = String(event.event_code || '').trim();
  const result = String(event.result || '').trim();
  if (!EVENT_SET.has(event_code)) throw new Error(`Unknown audit event: ${event_code}`);
  if (!RESULT_SET.has(result)) throw new Error(`Invalid audit result: ${result}`);
  const ctx = { ...auditRequestContext(req, event.actor || null), ...(event.context || {}) };
  const row = {
    actor_user_id: ctx.actor_user_id == null ? null : Number(ctx.actor_user_id),
    actor_display_name: trunc(ctx.actor_display_name, 255), actor_email: trunc(ctx.actor_email, 255),
    event_code, scope_code: trunc(event.scope_code || null, 50), action_code: trunc(event.action_code || null, 50),
    target_type: trunc(event.target_type || null, 80), target_id: trunc(event.target_id || null, 100), target_label: eventTargetLabel(event.target_label || null),
    result, request_id: trunc(ctx.request_id || null, 64), ip_address: trunc(ctx.ip_address || null, 64), user_agent: trunc(ctx.user_agent || null, 512),
    metadata_json: normalizeAuditMetadata(event.metadata || null),
  };
  return repo.insertAuditEvent(row);
}
export function auditChangedFields(before = {}, after = {}, fields = []) { return fields.filter((f) => JSON.stringify(before?.[f] ?? null) !== JSON.stringify(after?.[f] ?? null)); }
export const auditUiLabels = Object.freeze(Object.fromEntries(AUDIT_EVENTS.map((code) => [code, code.replaceAll('_', ' ')])));
