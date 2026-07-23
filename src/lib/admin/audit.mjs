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

export const AUDIT_EVENT_LABELS = Object.freeze({
  admin_login_succeeded: 'Sikeres belépés',
  admin_login_failed: 'Sikertelen belépés',
  admin_logout: 'Kijelentkezés',
  admin_session_revoked: 'Munkamenet visszavonva',
  password_reset_requested: 'Jelszóbeállító link kérése',
  password_reset_completed: 'Jelszó beállítva',
  password_reset_failed: 'Sikertelen jelszóbeállítás',
  admin_authorization_denied: 'Jogosultság miatt elutasítva',
  admin_csrf_rejected: 'CSRF-védelem miatt elutasítva',
  admin_user_created: 'Felhasználó létrehozva',
  admin_user_updated: 'Felhasználó módosítva',
  admin_user_disabled: 'Felhasználó letiltva',
  admin_user_reactivated: 'Felhasználó aktiválva',
  admin_user_permissions_changed: 'Jogosultságok módosítva',
  admin_user_sessions_revoked: 'Felhasználói munkamenetek visszavonva',
  admin_user_reset_link_requested: 'Jelszóbeállító link elküldése',
  admin_page_created: 'Oldal létrehozva',
  admin_page_updated: 'Oldal módosítva',
  admin_page_archived: 'Oldal archiválva',
  admin_page_reactivated: 'Oldal újraaktiválva',
  admin_page_deleted: 'Oldal véglegesen törölve',
  admin_block_created: 'Blokk létrehozva',
  admin_block_updated: 'Blokk módosítva',
  admin_block_archived: 'Blokk archiválva',
  admin_block_reactivated: 'Blokk újraaktiválva',
  admin_block_deleted: 'Blokk véglegesen törölve',
  admin_navigation_saved: 'Menü mentve',
  admin_navigation_item_deleted: 'Menüpont véglegesen törölve',
  admin_media_uploaded: 'Média feltöltve',
  admin_media_updated: 'Média módosítva',
  admin_media_archived: 'Média archiválva',
  admin_media_reactivated: 'Média újraaktiválva',
  admin_settings_updated: 'Alapadatok módosítva',
  admin_publish_completed: 'Élesítés befejezve',
  admin_publish_failed: 'Élesítés sikertelen',
  admin_publish_rollback_completed: 'Visszaállítás befejezve',
  admin_publish_rollback_failed: 'Visszaállítás sikertelen',
});

const EVENT_SET = new Set(AUDIT_EVENTS);
const RESULT_SET = new Set(AUDIT_RESULTS);
const FORBIDDEN_KEY_RE = /(password|token|session|csrf|cookie|authorization|smtp|secret|api[_-]?key)/i;
const AUDIT_EVENT_MARKS = Symbol.for('easylink.admin.auditEventMarks');
const MAX_META_JSON = 8000;
const MAX_DEPTH = 6;
const MAX_KEYS = 80;
const MAX_ARRAY = 50;
const MAX_STRING = 512;

function trunc(value, max) {
  if (value == null) return null;
  const text = String(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function sanitizeKey(key) {
  return String(key || '').trim().slice(0, 120);
}

function normalizedEventCode(event = {}) {
  const requested = String(event.event_code || '').trim();
  if (requested === 'admin_block_deleted' && String(event.metadata?.nextStatus || '') === 'archived') {
    return 'admin_block_archived';
  }
  return requested;
}

function eventMark(eventCode, result) {
  return `${eventCode}:${result}`;
}

export function markAuditEvent(req, eventCode, result) {
  if (!req) return;
  if (!req[AUDIT_EVENT_MARKS]) req[AUDIT_EVENT_MARKS] = new Set();
  req[AUDIT_EVENT_MARKS].add(eventMark(eventCode, result));
}

export function hasAuditEvent(req, eventCode, result = null) {
  const marks = req?.[AUDIT_EVENT_MARKS];
  if (!marks) return false;
  if (result) return marks.has(eventMark(eventCode, result));
  return AUDIT_RESULTS.some((candidate) => marks.has(eventMark(eventCode, candidate)));
}

export function sanitizeAuditMetadata(value, depth = 0) {
  if (value == null) return null;
  if (depth > MAX_DEPTH) return '[TRUNCATED_DEPTH]';
  if (typeof value === 'string') return trunc(value, MAX_STRING);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY)
      .map((entry) => sanitizeAuditMetadata(entry, depth + 1))
      .concat(value.length > MAX_ARRAY ? [`[TRUNCATED_ARRAY:${value.length - MAX_ARRAY}]`] : []);
  }
  if (typeof value === 'object') {
    const out = {};
    let count = 0;
    for (const [rawKey, rawValue] of Object.entries(value)) {
      const key = sanitizeKey(rawKey);
      if (!key) continue;
      if (FORBIDDEN_KEY_RE.test(key)) {
        out[key] = '[REDACTED]';
        continue;
      }
      if (count++ >= MAX_KEYS) {
        out.__truncated_keys = Math.max(0, Object.keys(value).length - MAX_KEYS);
        break;
      }
      out[key] = sanitizeAuditMetadata(rawValue, depth + 1);
    }
    return out;
  }
  return trunc(String(value), MAX_STRING);
}

export function normalizeAuditMetadata(metadata) {
  const sanitized = sanitizeAuditMetadata(metadata);
  if (sanitized == null) return null;
  const json = JSON.stringify(sanitized);
  if (json.length <= MAX_META_JSON) return sanitized;
  return {
    truncated: true,
    originalBytes: Buffer.byteLength(json),
    summary: trunc(json, MAX_META_JSON - 80),
  };
}

export function auditRequestContext(req, actor = null) {
  if (!req.__easylinkAuditRequestId) {
    req.__easylinkAuditRequestId = crypto.randomUUID().replace(/-/g, '').slice(0, 64);
  }
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

export function eventTargetLabel(value) {
  return trunc(value, 255);
}

export function buildAuditEventRow(req, event = {}) {
  const event_code = normalizedEventCode(event);
  const result = String(event.result || '').trim();
  if (!EVENT_SET.has(event_code)) throw new Error(`Unknown audit event: ${event_code}`);
  if (!RESULT_SET.has(result)) throw new Error(`Invalid audit result: ${result}`);
  const context = { ...auditRequestContext(req, event.actor || null), ...(event.context || {}) };
  return {
    actor_user_id: context.actor_user_id == null ? null : Number(context.actor_user_id),
    actor_display_name: trunc(context.actor_display_name, 255),
    actor_email: trunc(context.actor_email, 255),
    event_code,
    scope_code: trunc(event.scope_code || null, 50),
    action_code: trunc(event.action_code || null, 50),
    target_type: trunc(event.target_type || null, 80),
    target_id: trunc(event.target_id || null, 100),
    target_label: eventTargetLabel(event.target_label || null),
    result,
    request_id: trunc(context.request_id || null, 64),
    ip_address: trunc(context.ip_address || null, 64),
    user_agent: trunc(context.user_agent || null, 512),
    metadata_json: normalizeAuditMetadata(event.metadata || null),
  };
}

export async function writeAuditEvent(repo, req, event = {}) {
  if (!repo?.insertAuditEvent) return null;
  const row = buildAuditEventRow(req, event);
  const result = await repo.insertAuditEvent(row);
  markAuditEvent(req, row.event_code, row.result);
  return result;
}

export function auditChangedFields(before = {}, after = {}, fields = []) {
  return fields.filter((field) => JSON.stringify(before?.[field] ?? null) !== JSON.stringify(after?.[field] ?? null));
}

export const auditUiLabels = AUDIT_EVENT_LABELS;
