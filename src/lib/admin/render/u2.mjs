import {
  layout as baseLayout,
  loginHtml as baseLoginHtml,
  navHtml,
  pageForm,
  pagesTable,
  publishPanel,
  mediaPanel,
  mediaPickerJs,
  settingsPanel,
} from './security-corrections.mjs';

const publicSiteLink = '<a class="admin-nav__public" href="/">Weboldal</a>';
const publicSiteLinkStyles = '.admin-nav__public{min-height:30px!important;padding:0 12px!important;background:#eef6ff!important;border-color:#c8ddff!important;color:#203a60!important;font-size:.78rem}.admin-nav__public:hover{background:#dfeeff!important;border-color:#a9caef!important;color:#132d50!important}';

function addPublicSiteLink(html) {
  if (html.includes('admin-nav__public')) return html;
  return html
    .replace('</style>', `${publicSiteLinkStyles}</style>`)
    .replace('<form method="post" action="/api/admin/logout">', `${publicSiteLink}<form method="post" action="/api/admin/logout">`);
}

export function layout(body, options = {}) {
  const html = baseLayout(body, options);
  return options.nav === false || !options.adminContext?.user ? html : addPublicSiteLink(html);
}

export function loginHtml(error = '') {
  return baseLoginHtml(error).replace(
    '</form></div>',
    '</form><p><a href="/admin/forgot-password">Elfelejtett jelszó</a></p></div>',
  );
}

export {
  navHtml,
  pageForm,
  pagesTable,
  publishPanel,
  mediaPanel,
  mediaPickerJs,
  settingsPanel,
};
