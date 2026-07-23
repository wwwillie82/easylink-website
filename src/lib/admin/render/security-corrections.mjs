import { layout as baseLayout, loginHtml as baseLoginHtml } from './layout.mjs';
import { navHtml as baseNavHtml } from './menu-position-controls.mjs';
import { pageForm as basePageForm, pagesTable as basePagesTable } from './pages-delete.mjs';
import { publishPanel as basePublishPanel } from './publish.mjs';
import { mediaPanel as baseMediaPanel, mediaPickerJs } from './media.mjs';
import { settingsPanel as baseSettingsPanel } from './settings.mjs';

function capabilityOptions(args, scope) {
  const options = args.findLast?.((value) => value && typeof value === 'object' && value.permissions)
    || [...args].reverse().find((value) => value && typeof value === 'object' && value.permissions)
    || {};
  return options.permissions?.[scope] || {};
}

function withoutArchivedStatusOption(html, allowed) {
  if (allowed) return html;
  return String(html).replace(/<option value="archived"[^>]*>Archivált<\/option>/g, '');
}

function removeLegacyGlobalPermissionGuard(html) {
  const source = String(html);
  const start = source.indexOf('(()=>{const p=');
  if (start < 0) return source;
  const marker = source.indexOf('button.danger', start);
  if (marker < 0) return source;
  const end = source.indexOf('})();', marker);
  if (end < 0) return source;
  return source.slice(0, start) + source.slice(end + 5);
}

function neutralizedLayoutContext(adminContext) {
  if (!adminContext?.permissions) return adminContext;
  const permissions = Object.fromEntries(Object.entries(adminContext.permissions).map(([scope, caps]) => [
    scope,
    {
      ...caps,
      canSave: true,
      canArchive: true,
      canDelete: true,
      canRepublish: true,
      canRestore: true,
    },
  ]));
  return { ...adminContext, permissions };
}

function repairPageRuntime(html) {
  return String(html)
    .replace(/if\(f\.dataset\.canSave/g, 'if(pf.dataset.canSave')
    .replace(/if\s*\(f\.dataset\.canSave/g, 'if(pf.dataset.canSave');
}

function repairMediaRuntime(html) {
  return String(html)
    .replace(/\+\s*<span>'\s*\+/g, "+ '<span>' +")
    .replace(/\+\s*<span>"/g, '+ \'<span>"');
}

export function layout(body, options = {}) {
  return removeLegacyGlobalPermissionGuard(baseLayout(body, {
    ...options,
    adminContext: neutralizedLayoutContext(options.adminContext),
  }));
}

export const loginHtml = baseLoginHtml;

export function navHtml(...args) {
  const caps = capabilityOptions(args, 'menu');
  return withoutArchivedStatusOption(baseNavHtml(...args), caps.canArchive === true);
}

export function pageForm(...args) {
  const caps = capabilityOptions(args, 'pages');
  return repairPageRuntime(withoutArchivedStatusOption(basePageForm(...args), caps.canArchive === true));
}

export function pagesTable(...args) {
  const caps = capabilityOptions(args, 'pages');
  return withoutArchivedStatusOption(basePagesTable(...args), caps.canArchive === true);
}

export function mediaPanel(...args) {
  return repairMediaRuntime(baseMediaPanel(...args));
}

export function publishPanel(...args) {
  return basePublishPanel(...args);
}

export function settingsPanel(...args) {
  return baseSettingsPanel(...args);
}

export { mediaPickerJs };
