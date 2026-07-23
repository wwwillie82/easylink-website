import crypto from 'node:crypto';
import { hashPassword } from '../db/client.mjs';
import {
  adminScopes,
  scopeActions,
  defaultNewUserPermissionMatrix,
  fullAdminPermissionMatrix,
  normalizePermissions,
  permissionRowsForInsert,
} from './permissions.mjs';

const actionKeys = Object.freeze({
  save: 'canSave',
  archive: 'canArchive',
  delete: 'canDelete',
  republish: 'canRepublish',
  restore: 'canRestore',
});

const emptyPermissionRow = () => ({
  canSave: false,
  canArchive: false,
  canDelete: false,
  canRepublish: false,
  canRestore: false,
});

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

export function userError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

export const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

export function normalizePermissionMatrix(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const matrix = {};
  for (const scope of adminScopes) {
    const raw = source[scope];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const normalized = emptyPermissionRow();
    for (const action of scopeActions[scope]) {
      if (scope === 'media' && action === 'delete') continue;
      normalized[actionKeys[action]] = raw[actionKeys[action]] === true;
    }
    matrix[scope] = normalized;
  }
  return matrix;
}

export const defaultNewUserPermissions = Object.freeze(normalizePermissionMatrix(defaultNewUserPermissionMatrix));

export function publicUser(row, permissions) {
  const normalizedPermissions = Array.isArray(permissions)
    ? normalizePermissions(permissions)
    : normalizePermissionMatrix(permissions || {});
  return {
    id: Number(row.id),
    email: row.email,
    display_name: row.display_name,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_login_at: row.last_login_at,
    permissions: normalizedPermissions,
  };
}

function assertNoSensitiveUserFields(payload) {
  const forbidden = ['role', 'password', 'password_hash', 'session_token', 'csrf_token', 'reset_token'];
  const field = forbidden.find((key) => hasOwn(payload, key));
  if (field) throw userError(400, 'IMMUTABLE_USER_FIELD', `A(z) ${field} mező nem módosítható.`);
}

export function validateUserPayload(payload = {}, { create = false, current = null } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw userError(400, 'INVALID_USER', 'Hibás felhasználói adatok.');
  }
  assertNoSensitiveUserFields(payload);

  const displayName = String(
    hasOwn(payload, 'display_name') || hasOwn(payload, 'displayName')
      ? (payload.display_name ?? payload.displayName)
      : current?.display_name,
  ).trim();
  const email = normalizeEmail(hasOwn(payload, 'email') ? payload.email : current?.email);
  const status = create ? 'active' : String(hasOwn(payload, 'status') ? payload.status : current?.status || 'active');

  if (!displayName) throw userError(400, 'INVALID_USER', 'A megjelenített név kötelező.');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw userError(400, 'INVALID_USER', 'Érvényes e-mail-cím szükséges.');
  if (!['active', 'disabled'].includes(status)) throw userError(400, 'INVALID_USER_STATUS', 'Hibás felhasználói státusz.');

  if (hasOwn(payload, 'permissions') && (!payload.permissions || typeof payload.permissions !== 'object' || Array.isArray(payload.permissions))) {
    throw userError(400, 'INVALID_USER_PERMISSIONS', 'Hibás jogosultsági mátrix.');
  }

  const suppliedPermissions = hasOwn(payload, 'permissions') ? payload.permissions : null;
  const permissions = create
    ? normalizePermissionMatrix(
        suppliedPermissions && Object.keys(suppliedPermissions).length
          ? suppliedPermissions
          : defaultNewUserPermissions,
      )
    : normalizePermissionMatrix(suppliedPermissions ?? current?.permissions ?? {});

  return { display_name: displayName, email, status, permissions };
}

function stablePermissionJson(matrix) {
  const normalized = normalizePermissionMatrix(matrix);
  return JSON.stringify(adminScopes.map((scope) => [scope, normalized[scope] || null]));
}

export function classifyUserMutation(current, payload = {}) {
  if (!current) throw userError(404, 'USER_NOT_FOUND', 'A felhasználó nem található.');
  const next = validateUserPayload(payload, { current });
  const needsArchive = current.status === 'active' && next.status === 'disabled';
  const needsSave = (
    String(current.display_name || '') !== next.display_name
    || normalizeEmail(current.email) !== next.email
    || (current.status === 'disabled' && next.status === 'active')
    || stablePermissionJson(current.permissions) !== stablePermissionJson(next.permissions)
  );
  return { needsSave, needsArchive, noOp: !needsSave && !needsArchive, next };
}

export function isFullAdminMatrix(matrix = {}) {
  const normalized = normalizePermissionMatrix(matrix);
  return adminScopes.every((scope) => normalized[scope] && scopeActions[scope]
    .filter((action) => !(scope === 'media' && action === 'delete'))
    .every((action) => normalized[scope][actionKeys[action]] === true));
}

export function unknownCredentialHash() {
  return hashPassword(crypto.randomBytes(32).toString('base64url'));
}

export function rowsFromMatrix(matrix) {
  return permissionRowsForInsert(normalizePermissionMatrix(matrix));
}

export { fullAdminPermissionMatrix };
