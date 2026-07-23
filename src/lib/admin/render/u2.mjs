import {
  layout,
  loginHtml as baseLoginHtml,
  navHtml,
  pageForm,
  pagesTable,
  publishPanel,
  mediaPanel,
  mediaPickerJs,
  settingsPanel,
} from './security-corrections.mjs';

export function loginHtml(error = '') {
  return baseLoginHtml(error).replace(
    '</form></div>',
    '</form><p><a href="/admin/forgot-password">Elfelejtett jelszó</a></p></div>',
  );
}

export {
  layout,
  navHtml,
  pageForm,
  pagesTable,
  publishPanel,
  mediaPanel,
  mediaPickerJs,
  settingsPanel,
};
