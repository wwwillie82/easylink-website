export function ctaAdminEnhancementJs() {
  return String.raw`(()=>{
    const MAX=4;
    const doc=document;
    const clean=(v)=>String(v??'').trim();
    const obj=(v)=>v&&typeof v==='object'&&!Array.isArray(v);
    const parse=(v,fallback)=>{try{return JSON.parse(v||'');}catch{return fallback;}};
    const buttonList=(source,kind='item')=>{
      if(Array.isArray(source?.buttons)) return source.buttons.slice(0,MAX).map((b,i)=>({label:clean(b?.label),url:clean(b?.url??b?.href),showInHeader:b?.showInHeader===undefined?i===0:!!b.showInHeader}));
      return kind==='default'
        ? [{label:clean(source?.primaryLabel),url:clean(source?.primaryUrl),showInHeader:true},{label:clean(source?.secondaryLabel),url:clean(source?.secondaryUrl),showInHeader:false}]
        : [{label:clean(source?.label),url:clean(source?.url),showInHeader:true},{label:clean(source?.secondaryLabel),url:clean(source?.secondaryUrl),showInHeader:false}];
    };
    const compact=(buttons)=>buttons.map((b)=>({label:clean(b.label),url:clean(b.url),showInHeader:!!b.showInHeader})).filter((b)=>b.label||b.url).slice(0,MAX);
    const style=doc.createElement('style');
    style.textContent='.cta-mode-selector{grid-column:1/-1;border:0;padding:0;margin:0;display:grid;gap:10px}.cta-mode-selector legend{font-weight:800;margin-bottom:4px}.cta-mode-selector label{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:center;margin:0;padding:14px 16px;border:1px solid #cdd7cc;border-radius:14px;background:#fff;cursor:pointer}.cta-mode-selector label:has(input:checked){border-color:#0f1159;box-shadow:0 0 0 2px #0f115926;background:#f7f8ff}.cta-mode-selector input{width:auto;margin:0}.cta-button-editor{grid-column:1/-1;display:grid;gap:12px}.cta-button-editor h4{margin:6px 0 0}.cta-button-row{display:grid;grid-template-columns:minmax(170px,1fr) minmax(220px,1.4fr) auto;gap:12px;align-items:end;padding:14px;border:1px solid #dfe6df;border-radius:16px;background:#fbfdfb}.cta-button-row label{margin:0}.cta-header-choice{display:flex!important;align-items:center;gap:8px!important;margin:0!important;padding:10px 12px;border:1px solid #dfe6df;border-radius:12px;background:#fff;white-space:nowrap}.cta-header-choice input{width:auto}.cta-page-header-toggle{grid-column:1/-1;width:max-content;max-width:100%}.cta-legacy-field{display:none!important}@media(max-width:760px){.cta-button-row{grid-template-columns:1fr}.cta-header-choice{white-space:normal}.cta-page-header-toggle{width:auto}}';
    doc.head?.appendChild(style);

    function makeEditor(buttons,{headerChoices=false,title='CTA gombok'}={}){
      const root=doc.createElement('div'); root.className='cta-button-editor'; root.dataset.ctaButtonsEditor='true';
      const heading=doc.createElement('h4'); heading.textContent=title; root.appendChild(heading);
      for(let i=0;i<MAX;i++){
        const source=buttons[i]||{label:'',url:'',showInHeader:false};
        const row=doc.createElement('div'); row.className='cta-button-row'; row.dataset.ctaButtonRow=String(i);
        const labelWrap=doc.createElement('label'); labelWrap.textContent=(i+1)+'. gomb felirata';
        const label=doc.createElement('input'); label.dataset.ctaButtonLabel=''; label.value=source.label||''; labelWrap.appendChild(label);
        const urlWrap=doc.createElement('label'); urlWrap.textContent=(i+1)+'. gomb célja';
        const url=doc.createElement('input'); url.dataset.ctaButtonUrl=''; url.value=source.url||''; urlWrap.appendChild(url);
        row.append(labelWrap,urlWrap);
        if(headerChoices){
          const header=doc.createElement('label'); header.className='cta-header-choice';
          const checkbox=doc.createElement('input'); checkbox.type='checkbox'; checkbox.dataset.ctaButtonHeader=''; checkbox.checked=!!source.showInHeader;
          const text=doc.createElement('span'); text.textContent='Megjelenik a headerben'; header.append(checkbox,text); row.appendChild(header);
        }
        root.appendChild(row);
      }
      return root;
    }
    const readEditor=(editor)=>compact([...editor.querySelectorAll('[data-cta-button-row]')].map((row)=>({label:row.querySelector('[data-cta-button-label]')?.value||'',url:row.querySelector('[data-cta-button-url]')?.value||'',showInHeader:!!row.querySelector('[data-cta-button-header]')?.checked})));
    const writeEditor=(editor,buttons)=>{[...editor.querySelectorAll('[data-cta-button-row]')].forEach((row,i)=>{const b=buttons[i]||{};const label=row.querySelector('[data-cta-button-label]');const url=row.querySelector('[data-cta-button-url]');const header=row.querySelector('[data-cta-button-header]');if(label)label.value=b.label||'';if(url)url.value=b.url||'';if(header)header.checked=!!b.showInHeader;});};
    const hideLegacy=(panel)=>['[data-cta-label]','[data-cta-url]','[data-cta-secondary-label]','[data-cta-secondary-url]'].forEach((selector)=>panel.querySelector(selector)?.closest('label')?.classList.add('cta-legacy-field'));
    const mirrorLegacy=(panel,buttons)=>{const set=(selector,value)=>{const el=panel.querySelector(selector);if(el)el.value=value||'';};set('[data-cta-label]',buttons[0]?.label);set('[data-cta-url]',buttons[0]?.url);set('[data-cta-secondary-label]',buttons[1]?.label);set('[data-cta-secondary-url]',buttons[1]?.url);};

    function enhanceBlockForm(form){
      const panel=form.querySelector('[data-panel="cta"]');
      if(!panel||panel.dataset.ctaFourEnhanced) return;
      panel.dataset.ctaFourEnhanced='true';
      const itemsInput=form.querySelector('input[name="items"]');
      const initial=parse(itemsInput?.value,[]);
      const item=obj(initial?.[0])?initial[0]:{};
      const isPage=!!panel.matches('[data-page-cta-editor]')||form.dataset.pageCtaForm==='true';
      hideLegacy(panel);
      const local=panel.querySelector('[data-cta-local-fields]')||panel;
      const editor=makeEditor(buttonList(item,'item'),{headerChoices:isPage,title:'CTA gombok – legfeljebb 4'});
      local.appendChild(editor);
      if(isPage){
        const fieldset=panel.querySelector('fieldset');
        fieldset?.classList.add('cta-mode-selector');
        const toggle=doc.createElement('label'); toggle.className='admin-toggle-row admin-toggle-row--lead cta-page-header-toggle';
        const checkbox=doc.createElement('input'); checkbox.type='checkbox'; checkbox.dataset.ctaHeaderHidden=''; checkbox.checked=item.headerHidden===true;
        const text=doc.createElement('span'); text.textContent='Header CTA kikapcsolása ezen az oldalon'; toggle.append(checkbox,text);
        fieldset?.after(toggle);
      }
      const sync=()=>{
        const buttons=readEditor(editor); mirrorLegacy(panel,buttons);
        const parsed=parse(itemsInput?.value,[]); const current=obj(parsed?.[0])?{...parsed[0]}:{...item};
        current.buttons=buttons; current.label=buttons[0]?.label||''; current.url=buttons[0]?.url||''; current.secondaryLabel=buttons[1]?.label||''; current.secondaryUrl=buttons[1]?.url||'';
        if(isPage){current.headerHidden=!!panel.querySelector('[data-cta-header-hidden]')?.checked;current.ctaMode=panel.querySelector('[data-cta-mode]:checked')?.value||current.ctaMode||'global';}
        if(itemsInput){itemsInput.value=JSON.stringify([current]);itemsInput.dispatchEvent(new Event('input',{bubbles:true}));}
        form.dataset.itemsTouched='true';
      };
      editor.addEventListener('input',sync); editor.addEventListener('change',sync); panel.querySelector('[data-cta-header-hidden]')?.addEventListener('change',sync);
      panel.querySelectorAll('[data-cta-mode]').forEach((radio)=>radio.addEventListener('change',()=>{
        if(radio.checked&&radio.value==='custom'&&!readEditor(editor).length){const defaults=parse(panel.dataset.defaultCta,{});writeEditor(editor,buttonList(defaults,'default'));}
        sync();
      }));
      mirrorLegacy(panel,readEditor(editor));
    }

    let settingsEditor=null; let settingsDirty=false; let nativeFetch=globalThis.fetch?.bind(globalThis);
    function settingsButtons(){return settingsEditor?readEditor(settingsEditor):[];}
    function mirrorSettingsLegacy(form){const buttons=settingsButtons();const set=(name,value)=>{if(form.elements[name])form.elements[name].value=value||'';};set('defaultCta.primaryLabel',buttons[0]?.label);set('defaultCta.primaryUrl',buttons[0]?.url);set('defaultCta.secondaryLabel',buttons[1]?.label);set('defaultCta.secondaryUrl',buttons[1]?.url);}
    function settingsPayload(form){
      const val=(name)=>form.elements[name]?.value||''; const checked=(name)=>!!form.elements[name]?.checked;
      const docPath=(type)=>val('legalDocuments.'+type+'.pdfPath');
      const platforms=['facebook','instagram','tiktok','youtube','linkedin'].map((id)=>({id,active:checked('social.'+id+'.active'),url:val('social.'+id+'.url'),order:Number(val('social.'+id+'.order')||0)}));
      const docs=[['terms','termsPdfPath'],['privacy','privacyPdfPath'],['cookie','cookiePdfPath']].map(([type])=>({type,label:val('legalDocuments.'+type+'.label'),pdfPath:docPath(type),active:checked('legalDocuments.'+type+'.active'),order:Number(val('legalDocuments.'+type+'.order')||0)}));
      return {analytics:{enabled:checked('analytics.enabled'),provider:val('analytics.provider'),ga4MeasurementId:val('analytics.ga4MeasurementId'),consentMode:val('analytics.consentMode'),consentConfigurationVersion:Number(val('analytics.consentConfigurationVersion'))},legalDocuments:{termsPdfPath:docPath('terms'),privacyPdfPath:docPath('privacy'),cookiePdfPath:docPath('cookie'),items:docs},contact:{companyName:val('contact.companyName'),email:val('contact.email'),phone:val('contact.phone'),postalCode:val('contact.postalCode'),city:val('contact.city'),addressLine:val('contact.addressLine'),country:val('contact.country')},brand:{headerLogoPath:val('brand.headerLogoPath'),headerLogoAlt:val('brand.headerLogoAlt'),footerLogoPath:val('brand.footerLogoPath'),footerLogoAlt:val('brand.footerLogoAlt')},social:{platforms},defaultCta:{eyebrow:val('defaultCta.eyebrow'),title:val('defaultCta.title'),description:val('defaultCta.description'),primaryLabel:val('defaultCta.primaryLabel'),primaryUrl:val('defaultCta.primaryUrl'),secondaryLabel:val('defaultCta.secondaryLabel'),secondaryUrl:val('defaultCta.secondaryUrl'),buttons:settingsButtons()},searchVisibility:val('searchVisibility')};
    }
    function settingsMessage(text,ok=true){const el=doc.getElementById('msg');if(el)el.innerHTML='<p class="msg '+(ok?'ok':'err')+'">'+String(text).replace(/[&<>]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))+'</p>';}
    function enhanceSettings(){
      const form=doc.getElementById('settings-form'); const section=form?.querySelector('[data-settings-section="cta"]');
      if(!form||!section||section.dataset.ctaFourEnhanced) return;
      section.dataset.ctaFourEnhanced='true';
      ['primaryLabel','primaryUrl','secondaryLabel','secondaryUrl'].forEach((key)=>form.elements['defaultCta.'+key]?.closest('label')?.classList.add('cta-legacy-field'));
      const fallback=buttonList({primaryLabel:form.elements['defaultCta.primaryLabel']?.value,primaryUrl:form.elements['defaultCta.primaryUrl']?.value,secondaryLabel:form.elements['defaultCta.secondaryLabel']?.value,secondaryUrl:form.elements['defaultCta.secondaryUrl']?.value},'default');
      settingsEditor=makeEditor(fallback,{headerChoices:true,title:'CTA gombok – legfeljebb 4'}); section.querySelector('.admin-grid')?.appendChild(settingsEditor);
      const sync=()=>{mirrorSettingsLegacy(form);settingsDirty=true;queueMicrotask(()=>{const submit=form.querySelector('button[type="submit"]');if(submit)submit.disabled=false;});};
      settingsEditor.addEventListener('input',sync); settingsEditor.addEventListener('change',sync);
      nativeFetch('/api/admin/settings',{headers:{accept:'application/json'}}).then((response)=>response.json()).then((json)=>{if(!settingsDirty&&json?.ok){writeEditor(settingsEditor,buttonList(json.data?.defaultCta||{},'default'));mirrorSettingsLegacy(form);settingsDirty=false;}}).catch(()=>{});
      form.addEventListener('submit',async(event)=>{
        if(!settingsDirty) return;
        event.preventDefault();event.stopImmediatePropagation();
        const submit=form.querySelector('button[type="submit"]');if(submit)submit.disabled=true;
        try{const response=await nativeFetch('/api/admin/settings',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(settingsPayload(form))});const json=await response.json();if(!json?.ok){settingsMessage(json?.error?.message||'Mentési hiba.',false);if(submit)submit.disabled=false;return;}settingsDirty=false;settingsMessage(json.publish?.ok?'Beállítások mentve és élesítve.':'Beállítások mentve, de az élesítés nem fejeződött be.',!!json.publish?.ok);setTimeout(()=>globalThis.location?.reload(),350);}
        catch{settingsMessage('Hálózati hiba. Próbáld újra.',false);if(submit)submit.disabled=false;}
      },true);
    }
    if(nativeFetch){
      globalThis.fetch=(input,init={})=>{
        const url=typeof input==='string'?input:input?.url||'';
        if(url==='/api/admin/settings'&&init?.body&&settingsEditor){
          try{const payload=JSON.parse(init.body);payload.defaultCta=payload.defaultCta||{};payload.defaultCta.buttons=settingsButtons();init={...init,body:JSON.stringify(payload)};}catch{}
        }
        return nativeFetch(input,init);
      };
    }
    const enhanceAll=()=>{doc.querySelectorAll('[data-block-form]').forEach(enhanceBlockForm);enhanceSettings();};
    enhanceAll();
    new MutationObserver(enhanceAll).observe(doc.body,{childList:true,subtree:true});
  })();`;
}
