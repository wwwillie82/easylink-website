import assert from 'node:assert/strict';
import { pageForm, pagesTable } from '../src/lib/admin/render/pages.mjs';
import { canonicalHomeBlockFixture } from '../src/lib/content/home-blocks.mjs';
const page = { id: 1, route: '/', slug: 'home', type: 'home', title: 'Home', seo_title: 'SEO', seo_description: '', hero_eyebrow: 'Ey', hero_title: 'Title', hero_description: 'Desc', hero_asset: '/a.webp', status: 'published', sort_order: 0 };
const blocks = canonicalHomeBlockFixture().map((b, i)=>({ id:i+1, page_id:1, block_key:b.block_key, type:b.type, title:b.title, body:b.body, items:JSON.stringify(b.items), sort_order:b.sort_order, status:b.status }));
const html = pageForm({ page, blocks, defaultCta: {}, navigationUsages: [], homeEditor: { editor_revision: 'abc', pages: [{ id: 2, route: '/megoldasaink/', type: 'solutions_index', title: 'Megoldásaink', status: 'published' }, { id: 3, route: '/megoldasaink/a/', type: 'solution_detail', title: 'A', status: 'published' }, { id: 4, route: '/kinek/a/', type: 'audience_detail', title: 'Aud', status: 'published' }] } });
assert.match(html, /data-page-section="home-canonical"/);
assert.match(html, /Főoldali canonical tartalom/);
assert.match(html, /home:hero-meta/);
assert.match(html, /home:audiences/);
assert.doesNotMatch(html, /admin-subcard--new-block/);
assert.match(html, /data-media-picker-target="input\[name=hero_asset\]"/);
assert.match(html, /data-media-picker-kind="video"/);
assert.match(html, /data-page-section="page-cta"/);
assert.match(html, /name="route" required value="\/" readonly/);
assert.match(html, /name="status"[^>]*disabled/);
assert.match(html, /name="slug"[^>]*readonly/);
assert.match(html, /name="sort_order"[^>]*readonly/);
assert.match(html, /data-home-invariant-note/);
assert.match(html, /Mentés[\s\S]*Előnézet[\s\S]*Élesítés/);
assert.match(html, /data-page-options='[^']*solution_detail/);
assert.match(html, /data-page-options='[^']*audience_detail/);
assert.match(html, /showHomeFieldErrors/);
assert.match(html, /field-error/);
assert.match(html, /cardOptionsFor\(blockKey,kind\)/);
const table = pagesTable([page]);
assert.match(table, /Főoldal szerkesztése/);
assert.doesNotMatch(table, /data-page-status="1"/);
console.log('Admin home UI smoke passed');
import { showHomeFieldErrors, clearHomeFieldErrors, targetForHomeErrorPath } from '../src/lib/admin/render/home.mjs';
class ClassList{constructor(e){this.e=e;this.s=new Set()}add(c){this.s.add(c)}remove(c){this.s.delete(c)}contains(c){return this.s.has(c)}}
class El{constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.parentNode=null;this.dataset={};this.attributes={};this.classList=new ClassList(this);this._textContent='';this.ownerDocument=null}set textContent(v){this._textContent=String(v)}get textContent(){return this._textContent+this.children.map(c=>c.textContent).join('')}set className(v){this.attributes.class=String(v);this.classList.s=new Set(String(v).split(/\s+/).filter(Boolean))}get className(){return [...this.classList.s].join(' ')}appendChild(c){c.parentNode=this;c.ownerDocument=this.ownerDocument;this.children.push(c);return c}append(...cs){cs.forEach(c=>this.appendChild(c))}prepend(c){c.parentNode=this;c.ownerDocument=this.ownerDocument;this.children.unshift(c)}remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(c=>c!==this)}setAttribute(n,v){this.attributes[n]=String(v);if(n.startsWith('data-')){const k=n.slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase());this.dataset[k]=String(v)}}querySelector(s){return this.querySelectorAll(s)[0]||null}querySelectorAll(sel){let out=[];const sels=sel.split(',').map(x=>x.trim());const visit=e=>{if(sels.some(s=>match(e,s)))out.push(e);e.children.forEach(visit)};this.children.forEach(visit);return out}closest(sel){let e=this;const sels=sel.split(',').map(x=>x.trim());while(e){if(sels.some(s=>match(e,s)))return e;e=e.parentNode}return null}}
class Doc extends El{constructor(){super('#document');this.ownerDocument=this}createElement(t){const e=new El(t);e.ownerDocument=this;return e}}
function match(e,s){if(!s)return false;if(s.startsWith('.'))return e.classList.contains(s.slice(1));if(s==='label')return e.tagName==='LABEL';let m=/^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(s);if(m){const a=m[1],v=m[2];let got;if(a.startsWith('data-'))got=e.dataset[a.slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase())];else got=e.attributes[a];return v===undefined?got!==undefined:got===v}return e.tagName===s.toUpperCase()}
function el(doc,tag='div',attrs={}){const e=doc.createElement(tag);for(const[k,v]of Object.entries(attrs)){if(k==='class')e.className=v;else e.setAttribute(k,v)}return e}
function input(doc,attr){return el(doc,'input',attr)}
function row(doc,kind){return el(doc,'div',{'class':'item-row','data-home-item':kind})}
function block(doc,key){return el(doc,'article',{'class':'admin-subcard','data-home-block':key})}
function buildDom(){const doc=new Doc();const editor=el(doc,'section',{'data-home-editor':''});doc.appendChild(editor);editor.appendChild(input(doc,{name:'hero_title'}));editor.appendChild(input(doc,{name:'hero_asset'}));editor.appendChild(input(doc,{name:'hero_video_media_path'}));editor.appendChild(input(doc,{name:'hero_video_youtube_url'}));
const hero=block(doc,'home:hero-meta');editor.appendChild(hero);for(let i=0;i<2;i++){const r=row(doc,'benefit');r.appendChild(input(doc,{'data-benefit-title':''}));r.appendChild(input(doc,{'data-benefit-text':''}));hero.appendChild(r)}
const intro=block(doc,'home:intro');intro.appendChild(input(doc,{'data-intro-heading':''}));editor.appendChild(intro);
const sol=block(doc,'home:solutions');editor.appendChild(sol);for(let i=0;i<2;i++){const r=row(doc,'card');r.append(input(doc,{'data-card-page':''}),input(doc,{'data-card-href':''}),input(doc,{'data-card-target':''}),input(doc,{'data-card-title':''}),input(doc,{'data-card-text':''}),input(doc,{'data-card-link-label':''}),input(doc,{'data-card-badge':''}));sol.appendChild(r)}const ar=row(doc,'section-action');ar.append(input(doc,{'data-card-page':''}),input(doc,{'data-card-title':''}));sol.appendChild(ar);
const aud=block(doc,'home:audiences');editor.appendChild(aud);for(let i=0;i<2;i++){const r=row(doc,'card');r.append(input(doc,{'data-card-page':''}),input(doc,{'data-card-href':''}));aud.appendChild(r)}
const ai=block(doc,'home:ai-assistant');ai.appendChild(input(doc,{'data-ai-heading':''}));const sr=row(doc,'source');sr.appendChild(input(doc,{'data-source-title':''}));ai.appendChild(sr);const mr=row(doc,'message');mr.append(input(doc,{'data-message-role':''}),input(doc,{'data-message-title':''}),input(doc,{'data-message-text':''}));ai.appendChild(mr);editor.appendChild(ai);
const integ=block(doc,'home:integrations');integ.appendChild(input(doc,{'data-integrations-heading':''}));const nr=row(doc,'node');nr.append(input(doc,{'data-node-id':''}),input(doc,{'data-node-label':''}));integ.appendChild(nr);editor.appendChild(integ);return {doc,editor,hero,sol,aud,ai,integ}}
const {doc,hero,sol,aud,ai,integ}=buildDom();
assert.equal(targetForHomeErrorPath(doc,'blocks.home:hero-meta.items.1.title'), hero.querySelectorAll('[data-benefit-title]')[1]);
assert.equal(targetForHomeErrorPath(doc,'blocks.home:intro.items.0.text')?.attributes['data-intro-heading'], '');
assert.equal(targetForHomeErrorPath(doc,'blocks.home:solutions.items.0.target_page_id'), sol.querySelectorAll('[data-card-page]')[0]);
assert.equal(targetForHomeErrorPath(doc,'blocks.home:solutions.items.2.target_page_id'), sol.querySelector('[data-home-item="section-action"]').querySelector('[data-card-page]'));
assert.equal(targetForHomeErrorPath(doc,'blocks.home:audiences.items.1.href'), aud.querySelectorAll('[data-card-href]')[1]);
assert.equal(targetForHomeErrorPath(doc,'blocks.home:ai-assistant.items.0.text'), ai.querySelector('[data-ai-heading]'));
assert.equal(targetForHomeErrorPath(doc,'blocks.home:ai-assistant.items.1.title'), ai.querySelector('[data-source-title]'));
assert.equal(targetForHomeErrorPath(doc,'blocks.home:ai-assistant.items.2.text'), ai.querySelector('[data-message-text]'));
assert.equal(targetForHomeErrorPath(doc,'blocks.home:integrations.items.0.text'), integ.querySelector('[data-integrations-heading]'));
assert.equal(targetForHomeErrorPath(doc,'blocks.home:integrations.items.1.id'), integ.querySelector('[data-node-id]'));
assert.equal(targetForHomeErrorPath(doc,'blocks.home:integrations.items.9.id'), integ);
const secondBenefit=hero.querySelectorAll('[data-benefit-title]')[1];hero.children[0].remove();assert.equal(targetForHomeErrorPath(doc,'blocks.home:hero-meta.items.0.title'), secondBenefit);
const xss='<img src=x onerror="globalThis.__homeXss=1">';showHomeFieldErrors(doc,{[xss]:xss,'blocks.home:solutions.items.0.target_page_id':xss});assert.equal(doc.querySelectorAll('img').length,0);assert.notEqual(globalThis.__homeXss,1);assert.match(doc.querySelector('[data-field-error="summary"]').textContent,new RegExp(xss.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));assert.equal(sol.querySelector('[data-card-page]').classList.contains('field-error'),true);assert.match(sol.querySelector('[data-card-page]').closest('div').querySelector('[data-field-error="blocks.home:solutions.items.0.target_page_id"]').textContent,/img src=x/);const count=doc.querySelectorAll('[data-field-error]').length;showHomeFieldErrors(doc,{'blocks.home:solutions.items.0.target_page_id':'új'});assert.ok(doc.querySelectorAll('[data-field-error]').length < count + 2);clearHomeFieldErrors(doc);assert.equal(doc.querySelectorAll('[data-field-error]').length,0);assert.equal(doc.querySelectorAll('.field-error').length,0);
