import { esc } from './utils.mjs';
import { videoDraftGuardJs } from './video-draft.mjs';
import { ctaAdminEnhancementJs } from './cta-admin.mjs';
const adminStyles = `
body{font-family:Arial,sans-serif;margin:0;background:#f6f8f5;color:#0f1159}
.wrap{max-width:1100px;margin:0 auto;padding:28px}
.admin-header{position:sticky;top:0;z-index:30;background:#fff;border-bottom:1px solid #dfe6df;box-shadow:0 8px 24px#0f11590d}
.admin-bar{max-width:1100px;margin:0 auto;padding:18px 28px}
.admin-title{margin:0 0 14px}
.admin-nav{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.admin-nav__links{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.admin-nav__spacer{flex:1 1 auto}
.admin-nav a{display:inline-flex;align-items:center;min-height:36px;padding:0 14px;border:1px solid #d6dfd5;border-radius:999px;background:#f6f8f5;color:#0f1159;text-decoration:none;font-weight:700}
.admin-nav a:hover{background:#eaf3e7;border-color:#b9cbb6;transform:translateY(-1px)}
.admin-nav a[aria-current=page]{background:#0f1159;color:#fff;border-color:#0f1159}
.admin-nav__logout{background:#fff7f4!important;border-color:#edc9bd!important;color:#8b1d1d!important}
.card,.admin-section{background:#fff;border:1px solid #dfe6df;border-radius:22px;padding:24px;margin:32px 0;box-shadow:0 10px 30px #0f115912}
.grid,.admin-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;align-items:start}.admin-grid--compact{grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}.admin-grid--social{grid-template-columns:repeat(3,minmax(220px,1fr))}
.hint{color:#59605f;font-size:.95rem}
.admin-page-header{margin:0 0 24px}.admin-page-header h2{font-size:2rem;line-height:1.1;margin:0 0 8px}.admin-section-header{display:flex;justify-content:space-between;gap:16px;align-items:start;margin-bottom:18px;border-bottom:1px solid #e5ece4;padding-bottom:14px}.admin-section-header h3{font-size:1.45rem;line-height:1.15;margin:0;color:#0f1159}.admin-section-description{color:#59605f;font-size:1rem;line-height:1.5;margin:6px 0 0}.admin-subcard{border:1px solid #dfe6df;border-radius:18px;background:#fbfdfb;padding:16px;box-shadow:inset 0 1px 0 #fff}.admin-subcard h4{margin:0 0 8px;font-size:1.05rem}.admin-subcard-header{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:12px}.admin-toggle-row{display:flex;align-items:center;gap:10px!important;margin:0!important;padding:10px 12px;border:1px solid #dfe6df;border-radius:999px;background:#fff;cursor:pointer}.admin-toggle-row input{width:auto}.admin-toggle-row span{white-space:nowrap}.admin-toggle-row--lead{width:max-content;max-width:100%;margin-bottom:16px!important}.admin-field span{display:block;margin-bottom:6px}.admin-field-actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.admin-media-field{display:grid;gap:10px}.admin-current-path code{overflow-wrap:anywhere}.admin-logo-preview{max-width:180px;max-height:70px;object-fit:contain;border:1px solid #dfe6df;border-radius:12px;background:#fff;padding:8px}.admin-info{border:1px solid #c8ddff;background:#eef6ff;color:#203a60;border-radius:14px;padding:12px;line-height:1.45}.nav-list-actions{display:flex;justify-content:flex-start;margin:18px 0 0;padding:16px;border:1px dashed #cbd8c9;border-radius:16px;background:#fbfdfb}.target-page-meta{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:10px 0 14px;color:#59605f}.target-page-meta code{background:#eef2ee;border-radius:8px;padding:3px 7px;color:#0f1159}.nav-card__badges{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.admin-section--warning{border-color:#f0d48a;background:#fffdf4}.admin-save-bar{position:sticky;bottom:16px;z-index:20;display:flex;justify-content:space-between;align-items:center;gap:16px;background:#0f1159;color:#fff;border-radius:20px;padding:16px 18px;margin:32px 0 0;box-shadow:0 18px 40px #0f115940}.admin-save-bar .hint{color:#dfe6ff;margin:4px 0 0}.admin-save-bar button{background:#aefd00;border-color:#aefd00;color:#0f1159;margin-top:0}.admin-save-bar button:disabled{background:#d8dece;border-color:#d8dece;color:#0f1159}.admin-form{padding-bottom:180px}.admin-section,.admin-subcard,.block-card{scroll-margin-bottom:160px}.admin-table-scroll{overflow-x:auto}.admin-section table,.card table{margin-top:12px}

.toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.status-pill{display:inline-block;padding:4px 9px;border-radius:999px;background:#eef3ee;font-weight:700}
label{display:block;font-weight:700;margin-top:10px}
input,textarea,select{width:100%;box-sizing:border-box;padding:10px;border:1px solid #cdd7cc;border-radius:10px}
button,.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;margin-top:12px;padding:10px 14px;border-radius:999px;background:#0f1159;color:white;border:1px solid #0f1159;text-decoration:none;font-weight:700;cursor:pointer;transition:background .15s ease,border-color .15s ease,box-shadow .15s ease,opacity .15s ease,transform .08s ease}
button:hover,.btn:hover{background:#262875;border-color:#262875;box-shadow:0 6px 18px #0f115926;transform:translateY(-1px)}
button:active,.btn:active,.admin-nav a:active{transform:translateY(1px) scale(.99);box-shadow:0 2px 8px #0f11591f;transition-duration:.05s}
.admin-nav a{transition:background .15s ease,border-color .15s ease,box-shadow .15s ease,transform .08s ease}
button:focus-visible,.btn:focus-visible,.admin-nav a:focus-visible{outline:3px solid #ffb84d;outline-offset:3px}
button:disabled,button[aria-disabled=true],.btn[aria-disabled=true]{cursor:not-allowed;opacity:.55;filter:grayscale(.35);box-shadow:none;transform:none;background:#6f7285;border-color:#6f7285}
button:disabled:hover,button[aria-disabled=true]:hover,.btn[aria-disabled=true]:hover{background:#6f7285;border-color:#6f7285;box-shadow:none;transform:none}
.danger{background:#8b1d1d;border-color:#8b1d1d}
.danger:hover{background:#a12a2a;border-color:#a12a2a}
.secondary{background:#fff;color:#0f1159}
.warn{background:#fff7d1}
.is-archived-ui,.is-runtime-hidden{display:none!important}
.msg{padding:10px;border-radius:10px}
#msg{position:sticky;top:118px;z-index:25;margin-bottom:12px}
#msg:empty{display:none}
.ok{background:#e8ffd1}
.err{background:#ffe4e4}
table{width:100%;border-collapse:collapse}
td,th{border-bottom:1px solid #e2e8e2;padding:9px;text-align:left}
.advanced{border:1px dashed #cdd7cc;border-radius:14px;padding:12px;margin-top:14px}
.item-row{display:grid;grid-template-columns:1fr auto auto auto;gap:8px;align-items:end}
.block-card{border-left:5px solid #aefd00}
.media-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px;align-items:start}
.media-item{border:1px solid #dfe6df;border-radius:16px;padding:12px;background:#fff;display:grid;gap:10px;min-width:0;align-content:start}
.media-item img,.media-placeholder{display:block;width:100%;height:150px;object-fit:cover;border-radius:12px;background:#eef3ee}
.media-item video{display:block;width:100%;height:150px;object-fit:contain;border-radius:12px;background:#000;max-width:100%;outline:0}
.media-placeholder{display:grid;place-items:center;color:#59605f;font-weight:700;text-align:center}
.media-progress{display:grid;gap:6px;border:1px solid #dfe6df;background:#f6f8f5;border-radius:12px;padding:8px;font-size:.86rem;color:#343b3a}
.media-progress progress{width:100%;height:12px;accent-color:#0f1159}
.media-progress span{overflow-wrap:anywhere}
.media-item video:fullscreen{width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;object-fit:contain!important;background:#000!important;border-radius:0!important}
.media-item video:-webkit-full-screen{width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;object-fit:contain!important;background:#000!important;border-radius:0!important}
.media-item strong,.media-item span,.media-item label{min-width:0}
.media-item code{display:block;max-width:100%;font-size:.76rem;line-height:1.25;overflow-wrap:anywhere;word-break:break-word}
.media-item .toolbar{align-items:stretch}
.media-item .toolbar button{flex:1 1 120px}
.media-item button{max-width:100%}
.media-picker{position:fixed;inset:0;z-index:100;background:#0f115999;display:grid;place-items:center;padding:20px}
.media-picker[hidden]{display:none}
.media-picker__box{max-width:900px;max-height:85vh;overflow:auto}
@media(max-width:980px){.admin-grid--social{grid-template-columns:repeat(2,minmax(220px,1fr))}}@media(max-width:680px){.admin-grid,.grid,.admin-grid--compact,.admin-grid--social{grid-template-columns:1fr}.admin-section{margin:28px 0;padding:18px}.admin-subcard-header,.admin-save-bar{display:grid;align-items:stretch}.admin-toggle-row--lead{width:auto}.admin-save-bar{bottom:8px}.admin-form{padding-bottom:220px}.admin-toggle-row span{white-space:normal}.admin-page-header h2{font-size:1.55rem}.wrap,.admin-bar{padding:14px 18px}.admin-title{font-size:1.35rem;margin-bottom:8px}#msg{top:96px}.admin-nav{align-items:stretch}.admin-nav__links,.admin-nav{flex-direction:column}.admin-nav a{justify-content:center}.admin-nav__spacer{display:none}table{display:block;overflow-x:auto;white-space:nowrap}.item-row{grid-template-columns:1fr}.media-grid{grid-template-columns:1fr}.media-item img,.media-item video,.media-placeholder{height:180px}}
`;
const navItems = [['/admin/pages', 'Oldalak'],['/admin/menu', 'Menü'],['/admin/media', 'Média'],['/admin/settings', 'Alapadatok'],['/admin/publish', 'Korábbi élesítések']];
export const layout = (body, { nav = true, current = '' } = {}) => `<!doctype html><meta charset="utf-8"><title>Easylink site admin</title><style>${adminStyles}</style>${nav ? `<header class="admin-header"><div class="admin-bar"><h1 class="admin-title">Easylink site admin</h1><nav class="admin-nav" aria-label="Admin navigáció"><div class="admin-nav__links">${navItems.map(([href,label])=>`<a href="${href}"${current===href?' aria-current="page"':''}>${label}</a>`).join('')}</div><span class="admin-nav__spacer"></span><a class="admin-nav__logout" href="/api/admin/logout">Kilépés</a></nav></div></header>` : ''}<main class="wrap">${nav ? '' : '<h1>Easylink site admin</h1>'}${current === '/admin/media' ? '<p class="hint">Csak kész média választható a médiaválasztókban.</p>' : ''}${body}</main><script>${videoDraftGuardJs()}${ctaAdminEnhancementJs()}</script>`;
export function loginHtml(error = '') { return layout(`<div class="card"><h2>Belépés</h2>${error ? `<p class="msg err">${esc(error)}</p>` : ''}<form method="post" action="/api/admin/login"><label>Email<input name="email" type="email" required></label><label>Jelszó<input name="password" type="password" required></label><button>Belépés</button></form></div>`, { nav: false }); }
