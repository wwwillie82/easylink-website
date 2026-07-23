import { AUDIT_EVENTS, AUDIT_EVENT_LABELS } from '../audit.mjs';

const AUDIT_TARGET_TYPE_LABELS = Object.freeze({
  admin_user: 'Admin felhasználó',
  admin_login: 'Belépés / jelszóbeállítás',
  page: 'Oldal',
  block: 'Tartalmi blokk',
  navigation: 'Teljes menü',
  navigation_item: 'Menüpont',
  media: 'Média',
  settings: 'Alapadatok',
  publish_snapshot: 'Élesítési snapshot',
});

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

export function auditPanel() {
  const events = AUDIT_EVENTS
    .map((eventCode) => `<option value="${esc(eventCode)}">${esc(AUDIT_EVENT_LABELS[eventCode] || eventCode)}</option>`)
    .join('');
  const targetTypes = Object.entries(AUDIT_TARGET_TYPE_LABELS)
    .map(([targetType, label]) => `<option value="${esc(targetType)}">${esc(label)}</option>`)
    .join('');
  const labels = JSON.stringify(AUDIT_EVENT_LABELS);
  const targetTypeLabels = JSON.stringify(AUDIT_TARGET_TYPE_LABELS);
  return `<div class="admin-page admin-page--audit">
<style>
.admin-page--audit .audit-row--failure{background:#fff1f1}.admin-page--audit .audit-row--denied{background:#fff8df}.admin-page--audit .audit-result{display:inline-flex;border-radius:999px;padding:3px 8px;font-weight:700}.admin-page--audit .audit-row--success .audit-result{background:#eaf7e8;color:#245824}.admin-page--audit .audit-row--failure .audit-result{background:#ffd9d9;color:#8a2020}.admin-page--audit .audit-row--denied .audit-result{background:#ffedb3;color:#775600}.admin-page--audit pre{max-width:min(760px,75vw);max-height:360px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}.admin-page--audit .toolbar button:disabled{opacity:.45;cursor:not-allowed}.admin-page--audit .audit-filter-help{grid-column:1/-1;margin:0}.admin-page--audit td code{overflow-wrap:anywhere}
</style>
<header class="admin-page-header"><h2>Napló</h2><p class="admin-section-description">A site-admin biztonsági és tartalmi műveleteinek csak olvasható naplója.</p></header>
<div id="msg" class="hint" role="status" aria-live="polite">Betöltés…</div>
<form id="audit-filters" class="admin-section admin-grid">
<label>Dátum ettől<input name="date_from" type="datetime-local"></label><label>Dátum eddig<input name="date_to" type="datetime-local"></label>
<label>Eredmény<select name="result"><option value="">Mind</option><option value="success">Siker</option><option value="failure">Hiba</option><option value="denied">Elutasítva</option></select></label>
<label>Esemény<select name="event_code"><option value="">Mind</option>${events}</select></label><label>Terület<input name="scope_code" placeholder="például pages"></label>
<label>Felhasználó<input name="actor" placeholder="név vagy e-mail"></label><label>Cél típusa<select name="target_type"><option value="">Mind</option>${targetTypes}</select></label><label>Cél ID<input name="target_id" placeholder="azonosító-részlet"></label>
<label>Request ID<input name="request_id" placeholder="azonosító-részlet"></label><label>Keresés<input name="q" placeholder="esemény vagy cél neve"></label>
<label>Oldalméret<select name="limit"><option>50</option><option>25</option><option>100</option></select></label><button type="submit">Szűrés</button>
<p class="hint audit-filter-help">A cél típusa azt jelzi, milyen rendszerobjektumot érintett a művelet. A Cél ID és a Request ID mezőben az azonosító egy részlete is elegendő.</p>
</form>
<div class="admin-table-scroll"><table id="audit-table"><thead><tr><th>Időpont</th><th>Felhasználó</th><th>Esemény</th><th>Terület</th><th>Művelet</th><th>Cél típusa</th><th>Cél ID</th><th>Cél neve</th><th>Eredmény</th><th>Request ID</th><th>Részletek</th></tr></thead><tbody><tr><td colspan="11">Betöltés…</td></tr></tbody></table></div>
<div class="toolbar"><button type="button" id="prev">Előző</button><span id="page-info"></span><button type="button" id="next">Következő</button></div>
</div><script>
const auditLabels=${labels};const targetLabels=${targetTypeLabels};const form=document.getElementById('audit-filters'),tbody=document.querySelector('#audit-table tbody'),msg=document.getElementById('msg'),pageInfo=document.getElementById('page-info'),prev=document.getElementById('prev'),next=document.getElementById('next');let page=1,totalPages=1;function escHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}function resultLabel(r){return r==='success'?'Siker':(r==='denied'?'Elutasítva':'Hiba');}function eventLabel(c){return auditLabels[c]||c;}function targetLabel(c){return targetLabels[c]||c||'—';}async function load(){msg.className='hint';msg.textContent='Betöltés…';prev.disabled=true;next.disabled=true;try{const p=new URLSearchParams(new FormData(form));p.set('page',page);const r=await fetch('/api/admin/audit?'+p);const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.error?.message||'Betöltési hiba');totalPages=Math.max(1,j.pagination.total_pages||1);pageInfo.textContent=page+' / '+totalPages+' · '+j.pagination.total+' rekord';tbody.innerHTML=j.data.length?j.data.map(a=>'<tr class="audit-row audit-row--'+escHtml(a.result)+'"><td>'+escHtml(a.created_at)+'</td><td>'+escHtml(a.actor_display_name||a.actor_email||'—')+'</td><td title="'+escHtml(a.event_code)+'"><strong>'+escHtml(eventLabel(a.event_code))+'</strong></td><td>'+escHtml(a.scope_code||'—')+'</td><td>'+escHtml(a.action_code||'—')+'</td><td title="'+escHtml(a.target_type||'')+'">'+escHtml(targetLabel(a.target_type))+'</td><td><code>'+escHtml(a.target_id||'—')+'</code></td><td>'+escHtml(a.target_label||'—')+'</td><td><span class="audit-result">'+resultLabel(a.result)+'</span></td><td><code>'+escHtml(a.request_id||'—')+'</code></td><td><details><summary>Megnyitás</summary><pre>'+escHtml(JSON.stringify(a.metadata_json||{},null,2))+'</pre></details></td></tr>').join(''):'<tr><td colspan="11">Nincs naplóbejegyzés.</td></tr>';msg.textContent='';}catch(error){tbody.innerHTML='<tr><td colspan="11">A napló nem tölthető be.</td></tr>';msg.className='msg err';msg.setAttribute('role','alert');msg.setAttribute('aria-live','assertive');msg.textContent=error.message||'Betöltési hiba';}finally{prev.disabled=page<=1;next.disabled=page>=totalPages;}}form.onsubmit=e=>{e.preventDefault();page=1;load();};prev.onclick=()=>{if(page>1){page--;load();}};next.onclick=()=>{if(page<totalPages){page++;load();}};load();
</script>`;
}
