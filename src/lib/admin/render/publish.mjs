import { esc } from './utils.mjs';
import { scopePermissions } from './permission-ui.mjs';
import { formatAdminDateTime } from '../date-time.mjs';

export function publishPanel({ snapshots = [], permissions = {} } = {}) {
  const perm = scopePermissions({ permissions }, 'publish');
  const canRepublish = perm.canRepublish === true;
  const canRestore = perm.canRestore === true;
  const rows = snapshots.map((s) => `<tr><td>${esc(formatAdminDateTime(s.created_at))}</td><td>${esc(String(s.content_hash || '').slice(0, 12))}</td><td>${s.is_current ? 'aktuális' : ''}</td><td>${canRestore ? `<button data-rollback="${esc(s.id)}">Visszaállítás erre az állapotra</button>` : '<span class="hint">Nincs visszaállítási jog</span>'}</td></tr>`).join('');
  const body = snapshots.length
    ? `<table><tr><th>Dátum</th><th>Azonosító</th><th>Aktuális</th><th></th></tr>${rows}</table>`
    : '<p class="msg">Még nincs korábbi sikeres élesítés. Az első mentés és élesítés után itt jelennek meg a visszaállítható állapotok.</p>';
  return `<div class="admin-page" data-can-republish="${canRepublish ? '1' : '0'}" data-can-restore="${canRestore ? '1' : '0'}"><div id="msg"></div><section class="admin-section"><header class="admin-section-header"><h2>Korábbi élesítések / Visszaállítás</h2></header>${canRepublish ? '<button type="button" data-republish>Jelenlegi tartalom újraélesítése</button>' : '<p class="hint">Nincs újraélesítési jog.</p>'}${body}</section></div><script>const msg=(t,ok=true)=>document.getElementById('msg').innerHTML='<p class="msg '+(ok?'ok':'err')+'">'+t+'</p>';const pm=(p)=>p?.ok?'Visszaállítás és élesítés sikeres.':(p?.status==='publish_in_progress'?'Visszaállítás mentve, de az élesítés folyamatban.':'Visszaállítás mentve, de az élesítés sikertelen; az élő oldal változatlan maradt.');document.querySelector('[data-republish]')?.addEventListener('click',async()=>{const r=await fetch('/api/admin/publish',{method:'POST'});const j=await r.json();msg(j.ok?'Újraélesítés indítva.':j.error.message,j.ok)});document.querySelectorAll('[data-rollback]').forEach((b)=>b.onclick=async()=>{const r=await fetch('/api/admin/publish/rollback/'+b.dataset.rollback,{method:'POST'});const j=await r.json();msg(j.ok?pm(j.publish):j.error.message,j.ok&&j.publish?.ok)});</script>`;
}
