export function scopePermissions(options = {}, scope) {
  const permissions = options.permissions || options.adminContext?.permissions || {};
  if (permissions?.[scope]) return permissions[scope];
  if (!options.permissions && !options.adminContext?.permissions) return { canSave: true, canArchive: true, canDelete: true, canRepublish: true, canRestore: true };
  return {};
}

export function boolAttr(condition, attr) {
  return condition ? ` ${attr}` : '';
}

export function readonlyAttrs(canEdit) {
  return canEdit ? '' : ' readonly aria-readonly="true" data-permission-disabled="true"';
}

export function disabledAttrs(canEdit) {
  return canEdit ? '' : ' disabled aria-disabled="true" data-permission-disabled="true"';
}

export function jsPermission(scopePerm = {}) {
  return JSON.stringify({
    canSave: scopePerm.canSave === true,
    canArchive: scopePerm.canArchive === true,
    canDelete: scopePerm.canDelete === true,
    canRepublish: scopePerm.canRepublish === true,
    canRestore: scopePerm.canRestore === true,
  });
}
