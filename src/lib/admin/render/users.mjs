import { esc } from './utils.mjs';
import { adminScopes, scopeActions } from '../permissions.mjs';
import { RESET_PASSWORD_MIN_LENGTH } from '../password-reset.mjs';
import { defaultNewUserPermissions } from '../users.mjs';

const scopeLabels = {
  pages: 'Oldalak',
  menu: 'Menü',
  media: 'Média',
  settings: 'Alapadatok',
  publish: 'Korábbi élesítések',
  users: 'Felhasználók',
  audit: 'Napló',
};

const actionLabels = {
  save: 'Mentés',
  archive: 'Archiválás',
  delete: 'Törlés',
  republish: 'Újraélesítés',
  restore: 'Visszaállítás',
};

const actionKeys = {
  save: 'canSave',
  archive: 'canArchive',
  delete: 'canDelete',
  republish: 'canRepublish',
  restore: 'canRestore',
};

function clientJs({ canSave, canArchive }) {
  const scopes = adminScopes.map((scope) => ({
    scope,
    label: scopeLabels[scope],
    actions: scopeActions[scope]
      .filter((action) => !(scope === 'media' && action === 'delete'))
      .map((action) => ({
        action,
        key: actionKeys[action],
        label: scope === 'users' && action === 'archive'
          ? 'Letiltás / session-visszavonás'
          : actionLabels[action],
      })),
  }));

  return `(()=>{
    const canSave=${Boolean(canSave)};
    const canArchive=${Boolean(canArchive)};
    const scopes=${JSON.stringify(scopes)};
    const defaultPermissions=${JSON.stringify(defaultNewUserPermissions)};
    const msg=document.getElementById('msg');
    const rows=document.getElementById('usersRows');
    const editor=document.getElementById('editor');
    const escapeHtml=(value)=>String(value??'').replace(/[&<>\"]/g,(char)=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[char]));
    const notify=(text,type='ok')=>{
      msg.textContent=text;
      msg.className='msg admin-users-toast '+type;
      msg.setAttribute('role',type==='err'?'alert':'status');
      msg.setAttribute('aria-live',type==='err'?'assertive':'polite');
    };
    const api=async(url,options={})=>{
      const headers={...(options.body?{'content-type':'application/json'}:{}),...(options.headers||{})};
      const response=await fetch(url,{...options,headers});
      const payload=await response.json().catch(()=>({ok:false,error:{message:'Hibás szerverválasz.'}}));
      if(!response.ok||payload.ok===false)throw new Error(payload.error?.message||'A művelet sikertelen.');
      return payload;
    };
    const permissionTable=(user)=>'<table><thead><tr><th>Terület</th><th>Hozzáférés</th><th>Műveletek</th></tr></thead><tbody>'
      +scopes.map((scope)=>'<tr><td>'+scope.label+'</td><td><label><input type="checkbox" data-scope="'+scope.scope+'" '
        +(user.permissions?.[scope.scope]?'checked ':'')+(canSave?'':'disabled ')+'> Olvasás</label></td><td>'
        +scope.actions.map((action)=>'<label><input type="checkbox" data-action="'+scope.scope+'.'+action.action+'" '
          +(user.permissions?.[scope.scope]?.[action.key]?'checked ':'')+(canSave?'':'disabled ')+'> '+action.label+'</label>').join('')
      +'</td></tr>').join('')+'</tbody></table>';
    const collectPermissions=()=>{
      const permissions={};
      editor.querySelectorAll('[data-scope]').forEach((input)=>{
        if(input.checked)permissions[input.dataset.scope]={canSave:false,canArchive:false,canDelete:false,canRepublish:false,canRestore:false};
      });
      editor.querySelectorAll('[data-action]').forEach((input)=>{
        const [scope,action]=input.dataset.action.split('.');
        const key={save:'canSave',archive:'canArchive',delete:'canDelete',republish:'canRepublish',restore:'canRestore'}[action];
        if(permissions[scope]&&input.checked)permissions[scope][key]=true;
      });
      return permissions;
    };
    const load=async()=>{
      const result=await api('/api/admin/users');
      rows.innerHTML=result.data.map((user)=>'<tr><td>'+escapeHtml(user.display_name)+'</td><td>'+escapeHtml(user.email)+'</td><td>'
        +(user.status==='active'?'Aktív':'Letiltott')+'</td><td>'+escapeHtml(user.last_login_at||'-')+'</td><td><button data-edit="'+user.id+'">Szerkesztés</button> '
        +(canArchive?'<button class="danger" data-revoke="'+user.id+'">Összes munkamenet visszavonása</button> ':'')
        +(canSave?'<button data-reset="'+user.id+'">Jelszóbeállító link újraküldése</button>':'')+'</td></tr>').join('');
    };
    const edit=async(id,{scroll=true}={})=>{
      const isNew=!id;
      const user=isNew
        ?{id:null,display_name:'',email:'',status:'active',permissions:defaultPermissions,is_self:false}
        :(await api('/api/admin/users/'+id)).data;
      const canReactivate=canSave;
      const canDisable=canArchive&&!user.is_self;
      const statusDisabled=isNew||(!canSave&&!canArchive);
      const activeDisabled=!isNew&&user.status==='disabled'&&!canReactivate;
      const disabledDisabled=!isNew&&user.status==='active'&&!canDisable;
      const editorTitle=isNew?'Új felhasználó':'Felhasználó szerkesztése ('+escapeHtml(user.display_name||user.email||('#'+user.id))+')';
      editor.hidden=false;
      editor.innerHTML='<h3>'+editorTitle+'</h3>'
        +'<label>Megjelenített név<input name="display_name" value="'+escapeHtml(user.display_name||'')+'" '+(canSave?'':'disabled')+'></label>'
        +'<label>E-mail<input name="email" type="email" value="'+escapeHtml(user.email||'')+'" '+(canSave?'':'disabled')+'></label>'
        +'<label>Státusz<select name="status" '+(statusDisabled?'disabled':'')+'><option value="active" '+(activeDisabled?'disabled':'')+'>Aktív</option><option value="disabled" '+(disabledDisabled?'disabled':'')+'>Letiltott</option></select></label>'
        +permissionTable(user)
        +'<p class="toolbar">'+((isNew?canSave:(canSave||canArchive))?'<button id="saveUser">Mentés</button>':'')+'</p>';
      const statusInput=editor.querySelector('[name=status]');
      statusInput.value=user.status||'active';
      editor.querySelectorAll('[data-scope]').forEach((checkbox)=>checkbox.addEventListener('change',()=>{
        const actions=editor.querySelectorAll('[data-action^="'+checkbox.dataset.scope+'."]');
        actions.forEach((action)=>{action.disabled=!canSave||!checkbox.checked;if(!checkbox.checked)action.checked=false;});
      }));
      editor.querySelectorAll('[data-scope]').forEach((checkbox)=>checkbox.dispatchEvent(new Event('change')));
      editor.querySelector('#saveUser')?.addEventListener('click',async()=>{
        try{
          const payload={};
          if(canSave){
            payload.display_name=editor.querySelector('[name=display_name]').value;
            payload.email=editor.querySelector('[name=email]').value;
            payload.permissions=collectPermissions();
          }
          if(isNew){
            payload.status='active';
          }else if(statusInput.value!==user.status){
            if(user.status==='active'&&statusInput.value==='disabled'&&!canDisable)throw new Error('Nincs jogosultság a felhasználó letiltásához.');
            if(user.status==='disabled'&&statusInput.value==='active'&&!canReactivate)throw new Error('Nincs jogosultság a felhasználó aktiválásához.');
            payload.status=statusInput.value;
          }
          if(!Object.keys(payload).length)throw new Error('Nincs menthető változás.');
          const result=await api(isNew?'/api/admin/users':'/api/admin/users/'+id,{method:isNew?'POST':'PATCH',body:JSON.stringify(payload)});
          if(isNew&&result.reset?.ok===false){
            notify('A felhasználó létrejött, de a jelszóbeállító link nem ment ki: '+(result.reset.message||'küldd újra később.'),'warn');
          }else{
            notify('Mentve.');
          }
          await load();
          if(!isNew)await edit(id,{scroll:false});
          window.scrollTo({top:0,behavior:'smooth'});
        }catch(error){notify(error.message,'err');}
      });
      if(scroll)requestAnimationFrame(()=>editor.scrollIntoView({behavior:'smooth',block:'start'}));
    };
    document.getElementById('newUser')?.addEventListener('click',()=>edit(null,{scroll:true}));
    rows.addEventListener('click',async(event)=>{
      const button=event.target.closest('button');
      if(!button)return;
      try{
        if(button.dataset.edit)await edit(button.dataset.edit,{scroll:true});
        if(button.dataset.revoke){
          const result=await api('/api/admin/users/'+button.dataset.revoke+'/revoke-sessions',{method:'POST'});
          if(result.data?.selfRevoked)location.href='/admin/login';
          else notify('Munkamenetek visszavonva.');
        }
        if(button.dataset.reset){
          await api('/api/admin/users/'+button.dataset.reset+'/send-reset-link',{method:'POST'});
          notify('Jelszóbeállító link elküldve.');
        }
      }catch(error){notify(error.message,'err');}
    });
    load().catch((error)=>notify(error.message,'err'));
  })();`;
}

export function usersHtml({ permissions = {} } = {}) {
  const canSave = permissions.users?.canSave === true;
  const canArchive = permissions.users?.canArchive === true;
  return `<style>#msg.admin-users-toast{position:fixed;right:24px;bottom:24px;top:auto;z-index:1000;max-width:min(520px,calc(100vw - 48px));margin:0;box-shadow:0 12px 30px #0f115940}#msg.admin-users-toast:empty{display:none}#editor{scroll-margin-top:150px}@media(max-width:680px){#msg.admin-users-toast{left:16px;right:16px;bottom:16px;max-width:none}#editor{scroll-margin-top:110px}}</style><section class="admin-page-header"><h2>Felhasználók</h2><p class="admin-section-description">Admin felhasználók és jogosultságok kezelése.</p></section><p id="msg" class="msg admin-users-toast" role="status" aria-live="polite" aria-atomic="true"></p>${canSave ? '<button id="newUser">Új felhasználó</button>' : ''}<section class="admin-section"><div class="admin-table-scroll"><table><thead><tr><th>Név</th><th>E-mail</th><th>Státusz</th><th>Utolsó belépés</th><th>Műveletek</th></tr></thead><tbody id="usersRows"></tbody></table></div></section><section id="editor" class="admin-section" hidden></section><script>${clientJs({ canSave, canArchive })}</script>`;
}

export function forgotPasswordHtml() {
  return `<div class="card"><h2>Elfelejtett jelszó</h2><p id="msg" class="msg"></p><form id="forgot"><label>E-mail<input name="email" type="email" required></label><button>Jelszóbeállító link kérése</button></form><p><a href="/admin/login">Vissza a belépéshez</a></p></div><script>forgot.addEventListener('submit',async(event)=>{event.preventDefault();try{const response=await fetch('/api/admin/password-reset/request',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:forgot.email.value})});const payload=await response.json();msg.textContent=payload.message||payload.data?.message||'Ha az e-mail-címhez aktív felhasználó tartozik, elküldtük a jelszóbeállító linket.';msg.className='msg ok';}catch{msg.textContent='Ha az e-mail-címhez aktív felhasználó tartozik, elküldtük a jelszóbeállító linket.';msg.className='msg ok';}});</script>`;
}

export function resetPasswordHtml(token = '') {
  return `<div class="card"><h2>Új jelszó beállítása</h2><p id="msg" class="msg"></p><form id="reset"><input name="token" type="hidden" value="${esc(token)}"><label>Új jelszó<input name="password" type="password" minlength="${RESET_PASSWORD_MIN_LENGTH}" required></label><label>Új jelszó megerősítése<input name="password_confirm" type="password" minlength="${RESET_PASSWORD_MIN_LENGTH}" required></label><button>Jelszó módosítása</button></form><p><a href="/admin/login">Vissza a belépéshez</a></p></div><script>reset.addEventListener('submit',async(event)=>{event.preventDefault();const response=await fetch('/api/admin/password-reset/confirm',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({token:reset.token.value,password:reset.password.value,password_confirm:reset.password_confirm.value})});const payload=await response.json();msg.textContent=payload.data?.message||payload.error?.message||'Hiba';msg.className='msg '+(response.ok?'ok':'err');if(response.ok)setTimeout(()=>location.href='/admin/login',1200);});</script>`;
}
