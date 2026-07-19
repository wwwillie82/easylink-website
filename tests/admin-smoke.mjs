import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { hashPassword, verifyPassword } from '../src/lib/db/client.mjs';
import { readCookie, verifySessionToken } from '../src/lib/admin/auth.mjs';
import { shouldTryDbContentForEnv, pageWithFallback } from '../src/lib/content/provider.test-helper.mjs';
import { staticPagesData } from '../src/lib/content/static-seed-data.mjs';
import { createAdminServer } from '../src/lib/admin/server.mjs';
import { staleSeedKeys } from '../scripts/db-seed.mjs';
import { settingsSaveOutcome } from '../src/lib/admin/render/settings.mjs';
import { normalizeSiteSettings } from '../src/lib/admin/settings.mjs';
import { blockForm, pageEditorJs, movedBlockOrder, parseItemRowRaw, serializeEditorItems, sortOrderForMovedBlock, duplicateItemRow } from '../src/lib/admin/render/blocks.mjs';


const editedCard = serializeEditorItems({ type: 'cards', rows: [{ raw: { title: 'Old', text: 'Body', href: '/old', badge: 'Beta', extra: 'keep' }, title: 'New', text: 'Body', url: '/old', linkLabel: '', order: 'Beta' }] });
assert.deepEqual(editedCard, [{ title: 'New', text: 'Body', href: '/old', badge: 'Beta', extra: 'keep' }]);
const editedCta = serializeEditorItems({ type: 'cta', first: { eyebrow: 'Next', label: 'Old label', url: '/demo', secondaryLabel: 'Try', secondaryUrl: '/try', presentationRole: 'cta-section', role: 'legacy', extra: 'keep' }, rows: { eyebrow: 'Next', label: 'New label', url: '/demo', secondaryLabel: 'Try', secondaryUrl: '/try' } });
assert.deepEqual(editedCta, [{ eyebrow: 'Next', label: 'New label', url: '/demo', secondaryLabel: 'Try', secondaryUrl: '/try', presentationRole: 'cta-section', role: 'legacy', extra: 'keep' }]);
const editedImageText = serializeEditorItems({ type: 'image-text', first: { image: '/old.webp', alt: 'Old alt', position: 'left', extra: 'keep' }, rows: { image: '/new.webp', alt: 'Old alt', position: 'left' } });
assert.deepEqual(editedImageText, [{ image: '/new.webp', alt: 'Old alt', position: 'left', extra: 'keep' }]);
const editedFaq = serializeEditorItems({ type: 'faq', rows: [{ raw: { question: 'Old?', answer: 'Old answer', extra: 'keep' }, title: 'New?', text: 'Old answer' }] });
assert.deepEqual(editedFaq, [{ question: 'New?', answer: 'Old answer', extra: 'keep' }]);
assert.throws(() => serializeEditorItems({ type: 'raw', rawItemsText: '{bad' }), SyntaxError);
assert.deepEqual(serializeEditorItems({ type: 'ai-preview', rows: [{ raw: { text: 'Régi AI', extra: 'keep' }, kind: 'metric', title: 'Új AI', detail: 'Részlet', value: '42%', href: '/belso/', order: '2' }] }), [{ text: 'Új AI', extra: 'keep', kind: 'metric', detail: 'Részlet', value: '42%', href: '/belso/', order: 2 }]);
assert.deepEqual(serializeEditorItems({ type: 'ai-preview', rows: [{ raw: { label: 'Legacy címke' }, kind: 'bogus', title: 'Mentett cím', detail: '', value: '', href: '', order: '' }] }), [{ label: 'Mentett cím', kind: 'info' }]);

const textFeature = serializeEditorItems({ type: 'feature-list', rows: [{ raw: { text: 'Régi text', href: '/valami/', extra: 'keep' }, title: 'Új text' }] });
assert.deepEqual(textFeature, [{ text: 'Új text', href: '/valami/', extra: 'keep' }]);
const titleFeature = serializeEditorItems({ type: 'feature-list', rows: [{ raw: { title: 'Régi title', href: '/title/', extra: 'keep' }, title: 'Új title' }] });
assert.deepEqual(titleFeature, [{ title: 'Új title', href: '/title/', extra: 'keep' }]);
const stringFeature = serializeEditorItems({ type: 'feature-list', rows: [{ raw: 'Régi string', title: 'Új string' }] });
assert.deepEqual(stringFeature, ['Új string']);
assert.deepEqual(serializeEditorItems({ type: 'feature-list', rows: [{ raw: { text: 'Törlendő', href: '/x', extra: 'drop' }, title: '' }] }), []);
assert.throws(() => parseItemRowRaw('{bad'), SyntaxError);
const oneBlockMove = movedBlockOrder([{ id: 'fixed-a', fixed: true, sortOrder: 10 }, { id: 'free-a', fixed: false, sortOrder: 20 }, { id: 'free-b', fixed: false, sortOrder: 30 }, { id: 'fixed-b', fixed: true, sortOrder: 900 }], 1, 'down');
assert.equal(oneBlockMove.moved.id, 'free-a');
assert.equal(oneBlockMove.sortOrder, 465);
assert.deepEqual(oneBlockMove.domOrder.map((entry)=>entry.id), ['fixed-a', 'free-b', 'free-a', 'fixed-b']);
const upwardMove = movedBlockOrder([{ id: 'fixed-a', fixed: true, sortOrder: 10 }, { id: 'free-a', fixed: false, sortOrder: 20 }, { id: 'free-b', fixed: false, sortOrder: 30 }, { id: 'fixed-b', fixed: true, sortOrder: 900 }], 2, 'up');
assert.equal(upwardMove.sortOrder, 15);
assert.deepEqual(upwardMove.domOrder.map((entry)=>entry.id), ['fixed-a', 'free-b', 'free-a', 'fixed-b']);
assert.throws(() => movedBlockOrder([{ id: 'fixed-a', fixed: true, sortOrder: 10 }, { id: 'free-a', fixed: false, sortOrder: 20 }], 1, 'up'), /Nincs elegendő sorrendi hely/);
assert.throws(() => sortOrderForMovedBlock([{ id: 'prev', fixed: false, sortOrder: 10 }, { id: 'moved', fixed: false, sortOrder: 11 }, { id: 'next', fixed: false, sortOrder: 11 }], 1), /Nincs elegendő sorrendi hely/);
assert.deepEqual([{ id: 'fixed-a', fixed: true, sortOrder: 10 }, { id: 'fixed-b', fixed: true, sortOrder: 900 }].map((entry)=>entry.sortOrder), [10, 900]);
assert.doesNotMatch(pageEditorJs(1), /const raw=\{\.\.\.\(first|first is not defined/);
const fixedBlockHtml = blockForm({ id: 501, page_id: 20, block_key: '/megoldasaink/:cards:0', type: 'cards', title: 'Cards', body: '', items: [{ title: 'A', extra: 'keep' }], status: 'published', sort_order: 10 });
assert.match(fixedBlockHtml, /data-fixed-presentation="true"/);
assert.match(fixedBlockHtml, /Rögzített megjelenési hely/);
assert.match(fixedBlockHtml, /data-raw-item="\{&quot;title&quot;:&quot;A&quot;,&quot;extra&quot;:&quot;keep&quot;\}"/);
const textFeatureHtml = blockForm({ id: 503, page_id: 20, block_key: 'manual:text-feature', type: 'feature-list', title: 'Feature', body: '', items: [{ text: 'Text alapú listaelem', href: '/x', extra: 'keep' }, { title: 'Title alapú listaelem', href: '/y', extra: 'keep' }], status: 'published', sort_order: 30 });
assert.match(textFeatureHtml, /value="Text alapú listaelem"/);
assert.match(textFeatureHtml, /value="Title alapú listaelem"/);
const aiPreviewHtml = blockForm({ id: 504, page_id: 20, block_key: 'manual:ai-preview', type: 'ai-preview', title: 'AI', body: 'Intro', items: ['Legacy string', { text: 'Legacy text', kind: 'risk', detail: 'Risk detail', value: 'Magas', href: '/risk/' }], status: 'published', sort_order: 40 });
assert.match(aiPreviewHtml, /data-panel="ai-preview"/);
assert.match(aiPreviewHtml, /data-ai-preview-editor/);
assert.match(aiPreviewHtml, /AI üzleti pillanatkép demo elemei/);
assert.match(aiPreviewHtml, /nem élő AI-futtatás/);
assert.match(aiPreviewHtml, /data-ai-kind/);
assert.match(aiPreviewHtml, /data-ai-title value="Legacy string"/);
assert.match(aiPreviewHtml, /data-ai-title value="Legacy text"/);
assert.match(aiPreviewHtml, /data-ai-detail value="Risk detail"/);
assert.match(aiPreviewHtml, /data-ai-value value="Magas"/);
assert.match(aiPreviewHtml, /data-ai-href value="\/risk\/"/);
assert.match(aiPreviewHtml, /Haladó JSON export/);
assert.match(aiPreviewHtml, /data-ai-preview-json-export/);
assert.doesNotMatch(aiPreviewHtml, /data-panel="raw-items">Items JSON/);
assert.doesNotMatch(aiPreviewHtml, /data-raw-items/);
const networkVisualRawHtml = blockForm({ id: 505, page_id: 20, block_key: 'manual:network-visual', type: 'network-visual', title: 'Network', body: '', items: [{ title: 'Legacy raw', extra: 'keep' }], status: 'published', sort_order: 50 });
assert.match(networkVisualRawHtml, /data-panel="raw-items"/);
assert.match(networkVisualRawHtml, /textarea data-raw-items/);
assert.doesNotMatch(networkVisualRawHtml, /data-ai-preview-json-export/);
const editorRuntime = pageEditorJs(1);
assert.match(editorRuntime, /rawType==='ai-preview'\?'ai-preview'/);
assert.match(editorRuntime, /data-add-ai-item/);
assert.match(editorRuntime, /data-duplicate-item/);
assert.match(editorRuntime, /const duplicateItemRow=/);
assert.match(editorRuntime, /duplicateItemRow\(row\);serializeItems\(f\)/);
assert.doesNotMatch(editorRuntime, /row\.insertAdjacentHTML\('afterend',row\.outerHTML\)/);
assert.match(editorRuntime, /data-ai-preview-json-export/);
assert.match(editorRuntime, /if\(key==='raw-items'\)[^;]*data-raw-items disabled/);
assert.doesNotMatch(editorRuntime, /data-panel="ai-preview-raw"[^']*data-raw-items/);
assert.ok(editorRuntime.indexOf("if(e.target.dataset.removeItem") < editorRuntime.indexOf("if(e.target.dataset.addItem"));
for (const marker of ["if(e.target.dataset.removeItem", "if(e.target.dataset.addItem", "if(e.target.dataset.addAiItem", "if(e.target.dataset.duplicateItem", "if(e.target.dataset.moveItem"]) {
  const start = editorRuntime.indexOf(marker);
  assert.ok(start >= 0, `${marker} branch missing`);
  const branch = editorRuntime.slice(start, editorRuntime.indexOf("if(e.target.dataset.moveBlock)", start) > -1 ? editorRuntime.indexOf("if(e.target.dataset.moveBlock)", start) : start + 600);
  assert.match(branch, /f\.dataset\.itemsTouched='true'/, `${marker} must mark itemsTouched before serializing`);
  assert.match(branch, /serializeItems\(f\)/, `${marker} must refresh hidden items input`);
  assert.match(branch, /dispatchEvent\(new Event\('input'\)\)/, `${marker} must notify dirty state`);
}
assert.match(fixedBlockHtml, /data-move-block="up" class="secondary" disabled/);
const freeRoleHtml = blockForm({ id: 502, page_id: 20, block_key: 'manual:free', type: 'cta', title: 'Manual', body: '', items: [{ role: 'unknown-custom-role', label: 'A', extra: 'keep' }], status: 'published', sort_order: 20 });
assert.doesNotMatch(freeRoleHtml, /data-fixed-presentation="true"/);
assert.doesNotMatch(freeRoleHtml, /data-move-block="up" class="secondary" disabled/);
assert.match(pageEditorJs(1), /!isFixedBlock\(sib\)/);
assert.match(pageEditorJs(1), /if\(isFixedBlock\(f\)\)return/);
const duplicateSource = {
  fields: [],
  cloneNode() {
    const clone = { fields: this.fields.map((field) => ({ ...field, options: field.options?.map((option) => ({ ...option })) })), querySelectorAll() { return this.fields; } };
    clone.after = () => {};
    return clone;
  },
  querySelectorAll() { return this.fields; },
  after(clone) { this.duplicated = clone; },
};
duplicateSource.fields = [
  { tagName: 'SELECT', value: 'risk', options: [{ value: 'risk', selected: true }, { value: 'info', selected: false }] },
  { tagName: 'INPUT', type: 'text', value: 'Aktuális cím' },
  { tagName: 'INPUT', type: 'text', value: 'Aktuális részlet' },
  { tagName: 'INPUT', type: 'text', value: '42%' },
  { tagName: 'INPUT', type: 'text', value: '/risk/' },
  { tagName: 'INPUT', type: 'text', value: '7' },
];
const duplicated = duplicateItemRow(duplicateSource);
assert.equal(duplicated.fields[0].value, 'risk');
assert.equal(duplicated.fields[0].options[0].selected, true);
assert.equal(duplicated.fields[1].value, 'Aktuális cím');
assert.equal(duplicated.fields[2].value, 'Aktuális részlet');
assert.equal(duplicated.fields[3].value, '42%');
assert.equal(duplicated.fields[4].value, '/risk/');
assert.equal(duplicated.fields[5].value, '7');

const sessionSecret = 'test-session-secret-long-enough';
const state = {
  user: { id: 1, email: 'admin@example.com', password_hash: hashPassword('correct-password'), display_name: 'Admin', role: 'admin', status: 'active' },
  pages: [
    { id: 1, route: '/arak/', slug: 'arak', type: 'pricing', title: 'Árak', status: 'published', sort_order: 1, seo_title: 'Árak', seo_description: 'Desc', hero_eyebrow: 'Árak', hero_title: 'Hero', hero_description: 'Hero desc', hero_asset: '/asset.webp' },
    { id: 10, route: '/', slug: 'home', type: 'home', title: 'Kezdőlap', status: 'published', sort_order: 0, seo_title: 'Home SEO', seo_description: 'Home desc', hero_eyebrow: 'Home', hero_title: 'Home hero', hero_description: 'Home hero desc', hero_asset: '/home.webp' },
    { id: 20, route: '/megoldasaink/', slug: 'megoldasaink', type: 'solutions_index', title: 'Megoldásaink', status: 'published', sort_order: 10, seo_title: 'Megoldásaink', seo_description: 'Desc', hero_eyebrow: 'Megoldásaink', hero_title: 'Hero', hero_description: 'Hero desc', hero_asset: '/asset.webp' },
    { id: 22, route: '/megoldasaink-fallback/', slug: 'megoldasaink-fallback', type: 'solutions_index', title: 'Megoldásaink fallback', status: 'published', sort_order: 11, seo_title: 'Megoldásaink fallback', seo_description: 'Desc', hero_eyebrow: 'Megoldásaink', hero_title: 'Hero', hero_description: 'Hero desc', hero_asset: '/asset.webp' },
    { id: 23, route: '/integraciok-fallback/', slug: 'integraciok-fallback', type: 'integrations', title: 'Integrációk fallback', status: 'published', sort_order: 12, seo_title: 'Integrációk fallback', seo_description: 'Desc', hero_eyebrow: 'Integrációk', hero_title: 'Hero', hero_description: 'Hero desc', hero_asset: '/asset.webp' },
  ],
  blocks: [{ id: 1, page_id: 1, block_key: 'seed:/arak/:text:0', type: 'text', title: 'Block', body: 'Body', items: '[]', status: 'published', sort_order: 1 },
    { id: 20, page_id: 20, block_key: 'seed:/megoldasaink/:cards:0', type: 'cards', title: 'Megoldás lista', body: 'Body', items: '[{"title":"Pénzügy","text":"Szöveg","url":"/megoldasaink/penzugy-szamlazas/","linkLabel":"Részletek →","order":1}]', status: 'published', sort_order: 1 },
    { id: 21, page_id: 20, block_key: 'seed:/megoldasaink/:text:1', type: 'text', title: 'Nem renderelt', body: 'Body', items: '[]', status: 'published', sort_order: 2 },
    { id: 22, page_id: 22, block_key: 'seed:/megoldasaink-fallback/:feature-list:0', type: 'feature-list', title: 'Régi nem renderelt feature', body: 'Body', items: '["Régi"]', status: 'published', sort_order: 1 },
    { id: 23, page_id: 23, block_key: 'seed:/integraciok-fallback/:text:0', type: 'text', title: 'Régi nem renderelt integráció szöveg', body: 'Body', items: '[]', status: 'published', sort_order: 1 },
    { id: 70, page_id: 70, block_key: 'fixed:a', type: 'text', title: 'fixed A', body: 'Fixed A', items: '[]', status: 'published', sort_order: 10 },
    { id: 71, page_id: 70, block_key: 'free:a', type: 'text', title: 'free A', body: 'Free A', items: '[]', status: 'published', sort_order: 20 },
    { id: 72, page_id: 70, block_key: 'free:b', type: 'text', title: 'free B', body: 'Free B', items: '[]', status: 'published', sort_order: 30 },
    { id: 73, page_id: 70, block_key: 'fixed:b', type: 'text', title: 'fixed B', body: 'Fixed B', items: '[]', status: 'published', sort_order: 900 }],

  snapshots: [],
  imported: null,
  publishCalls: 0,
  media: [],
  nextMediaId: 1,
  settings: normalizeSiteSettings({}),
  nav: [
    { id: 1, title: 'Árak', href: '/arak/', sort_order: 1, status: 'published' },
    { id: 2, title: 'Kapcsolat', href: '/kapcsolat/', sort_order: 2, status: 'published' },
    { id: 3, title: 'Archív', href: '/archiv/', sort_order: 3, status: 'draft' },
  ],
};
const normalizeRoute = (route) => { const withStart = String(route || '').startsWith('/') ? String(route || '') : `/${route}`; return withStart.endsWith('/') ? withStart : `${withStart}/`; };
const validateHeroPayload = (payload) => {
  const enumFields = { hero_height: ['compact','normal','tall','xlarge'], hero_image_fit: ['cover','contain','stretch'], hero_overlay_strength: ['weak','normal','strong'] };
  for (const [field, allowed] of Object.entries(enumFields)) if (payload[field] !== undefined && payload[field] !== '' && payload[field] !== null && !allowed.includes(payload[field])) throw validationError('Hibás hero beállítás');
  for (const field of ['hero_image_position_x','hero_image_position_y','hero_image_position_mobile_x','hero_image_position_mobile_y']) if (payload[field] !== undefined && payload[field] !== '' && payload[field] !== null) { const n = Number(payload[field]); if (!Number.isInteger(n) || n < 0 || n > 100) throw validationError('Hibás hero pozíció'); }
  if (payload.hero_image_scale !== undefined && payload.hero_image_scale !== '' && payload.hero_image_scale !== null) { const n = Number(payload.hero_image_scale); if (!Number.isInteger(n) || n < 50 || n > 200) throw validationError('Hibás hero kép méret'); }
};
const validationError = (message) => Object.assign(new Error(message), { status: 400, code: 'VALIDATION_ERROR' });
const repo = {
  async findAdminUserByEmail(email) { return email === state.user.email ? state.user : null; },
  async markAdminLogin() {},
  async pages() { return state.pages; },
  async createPage(payload) { const route = normalizeRoute(payload.route); if (route === '/') throw validationError('Adj meg érvényes URL-t.'); if (state.pages.find((p) => p.route === route)) throw validationError('Ez az URL már létezik.'); const page = { id: Math.max(...state.pages.map((p) => p.id)) + 1, route, slug: route.replace(/^\//, '').replace(/\/$/, ''), type: payload.type || 'content_page', title: payload.title, status: payload.status || 'draft', sort_order: state.pages.length + 1, seo_title: payload.title, seo_description: '', hero_eyebrow: '', hero_title: payload.title, hero_description: '', hero_asset: '' }; state.pages.push(page); return { id: page.id, route: page.route, slug: page.slug }; },
  async page(id) { const page = state.pages.find((p) => String(p.id) === String(id)); return page ? { page, blocks: state.blocks.filter((b) => String(b.page_id) === String(id)) } : null; },
  async updatePage(id, payload) { validateHeroPayload(payload); const page = state.pages.find((p) => String(p.id) === String(id)); const route = payload.route ? normalizeRoute(payload.route) : page.route; const isExistingHome = page.route === '/' || page.type === 'home'; if (route === '/' && !isExistingHome) throw validationError('Adj meg érvényes URL-t.'); if (state.pages.find((p) => p.route === route && String(p.id) !== String(id))) throw validationError('Ez az URL már létezik.'); Object.assign(page, payload, { route, slug: route === '/' ? 'home' : (payload.slug || page.slug) }); },
  async upsertBlock(payload) { JSON.parse(payload.items || 'null'); if (payload.id) { Object.assign(state.blocks.find((b) => String(b.id) === String(payload.id)), payload); return { id: payload.id }; } const block = { ...payload, id: state.blocks.length + 1, block_key: `manual:test-${state.blocks.length + 1}` }; state.blocks.push(block); return { id: block.id, block_key: block.block_key }; },
  async deleteBlock(id) { state.blocks.find((b) => String(b.id) === String(id)).status = 'archived'; },
  async listMedia({ includeArchived = false } = {}) { return state.media.filter((m) => includeArchived || m.status !== 'archived').sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))||b.id-a.id); },
  async getMedia(id) { return state.media.find((m) => String(m.id) === String(id)) || null; },
  async createMedia(payload) { const media = { id: state.nextMediaId++, processing_status: 'ready', ...payload, path: payload.path, alt: payload.alt || '', type: payload.type || '', status: payload.status || 'active', created_at: new Date().toISOString() }; state.media.push(media); return media; },
  async updateMedia(id, payload) { const media = state.media.find((m) => String(m.id) === String(id)); if (!media) return null; if (payload.status && !['active','archived'].includes(payload.status)) throw validationError('Hibás média státusz.'); const nextStatus = payload.status || media.status; if (nextStatus === 'archived' && media.status !== 'archived' && media.type === 'application/pdf' && Object.values(state.settings.legalDocuments || {}).includes(media.path)) throw validationError('A dokumentum jelenleg jogi dokumentumként van használatban. Előbb távolítsd el az Alapadatok oldalon.'); media.alt = payload.alt ?? media.alt; media.status = nextStatus; return media; },
  async archiveMedia(id) { const media = state.media.find((m) => String(m.id) === String(id)); if (!media) return null; if (media.type === 'application/pdf' && Object.values(state.settings.legalDocuments || {}).includes(media.path)) throw validationError('A dokumentum jelenleg jogi dokumentumként van használatban. Előbb távolítsd el az Alapadatok oldalon.'); media.status = 'archived'; return media; },
  async getSiteSettings() { return state.settings; },
  async updateSiteSettings(payload) { const settings = normalizeSiteSettings(payload); for (const path of [settings.legalDocuments?.termsPdfPath, settings.legalDocuments?.privacyPdfPath, settings.legalDocuments?.cookiePdfPath, ...(settings.legalDocuments?.items || []).map((d) => d.pdfPath)]) { if (!path) continue; if (!String(path).startsWith('/assets/site-media/')) throw validationError('Csak feltöltött PDF dokumentum választható.'); const media = state.media.find((m) => m.path === path); if (!media || media.status === 'archived' || media.processing_status !== 'ready' || media.type !== 'application/pdf') throw validationError('Csak aktív, kész PDF dokumentum választható.'); } state.settings = settings; return settings; },
  async nav() { return state.nav; },
  async updateNav(items) { for (const item of items) { if (item.id) { const nav = state.nav.find((n) => String(n.id) === String(item.id)); if (!nav) throw new Error(`Navigation item not found: ${item.id}`); Object.assign(nav, { title: item.title, href: item.href, sort_order: Number(item.sort_order), status: item.status }); } else { state.nav.push({ id: Math.max(...state.nav.map((n) => n.id)) + 1, title: item.title, href: item.href, sort_order: Number(item.sort_order), status: item.status }); } } state.nav.sort((a,b)=>a.sort_order-b.sort_order||a.id-b.id); },

  async exportContentSnapshot() { return { pages: structuredClone(state.pages), blocks: structuredClone(state.blocks), navigation: structuredClone(state.nav), settings: [{ key: 'analytics', value: JSON.stringify(state.settings.analytics) }, { key: 'legalDocuments', value: JSON.stringify(state.settings.legalDocuments) }], media: structuredClone(state.media) }; },
  async importContentSnapshot(content) { state.imported = content; state.pages = structuredClone(content.pages || []); state.blocks = structuredClone(content.blocks || []); state.nav = structuredClone(content.navigation || []); },
  async publishSnapshots(limit = 20) { return state.snapshots.filter((s) => s.status === 'success').slice(0, limit); },
  async publishStatus() { return { lastSuccess: state.snapshots.find((s) => s.status === 'success') || null, lastError: state.snapshots.find((s) => s.status === 'failed') || null }; },
  async publishSnapshot(id) { return state.snapshots.find((s) => String(s.id) === String(id) && s.status === 'success') || null; },
};

let publishMode = 'success';
const publishService = { isRunning: () => publishMode === 'running', async publish() { state.publishCalls += 1; if (publishMode === 'running') return { ok: false, status: 'publish_in_progress', contentSaved: true, published: false }; if (publishMode === 'failed') return { ok: false, status: 'failed', contentSaved: true, liveUnchanged: true, error: 'publish failed' }; return { ok: true, status: 'success', contentSaved: true, published: true }; } };
const mediaStorageDir = await mkdtemp(join(tmpdir(), 'easylink-admin-media-'));
const server = createAdminServer({ repo, publishService, env: { SITE_ADMIN_SESSION_SECRET: sessionSecret, NODE_ENV: 'test', SITE_MEDIA_STORAGE_DIR: mediaStorageDir, SITE_MEDIA_MAX_BYTES: '80', SITE_MEDIA_DOCUMENT_MAX_BYTES: '10485760' } });
server.listen(0);
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
try {
  let response = await fetch(`${base}/admin/login`);
  assert.equal(response.status, 200);
  const loginPageHtml = await response.text();
  assert.match(loginPageHtml, /Belépés/);
  assert.doesNotMatch(loginPageHtml, /Dashboard/);
  assert.doesNotMatch(loginPageHtml, /Oldalak/);
  assert.doesNotMatch(loginPageHtml, /Kilépés/);

  response = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'text/html' }, body: new URLSearchParams({ email: 'admin@example.com', password: 'correct-password' }), redirect: 'manual' });
  assert.equal(response.status, 303);
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.equal(response.headers.get('location'), '/admin/pages');


  const orderBlocks = () => state.blocks.filter((b) => b.page_id === 70).sort((a,b)=>Number(a.sort_order)-Number(b.sort_order)||a.id-b.id);
  const orderTitles = () => orderBlocks().map((b) => b.title);
  const orderEntries = () => orderBlocks().map((b) => ({ id: b.id, fixed: b.title.startsWith('fixed'), sortOrder: Number(b.sort_order) }));
  assert.deepEqual(orderTitles(), ['fixed A', 'free A', 'free B', 'fixed B']);
  const downMove = movedBlockOrder(orderEntries(), 1, 'down');
  assert.equal(downMove.moved.id, 71);
  assert.equal(downMove.sortOrder, 465);
  const freeA = state.blocks.find((b) => b.id === 71);
  response = await fetch(`${base}/api/admin/blocks`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ ...freeA, sort_order: downMove.sortOrder }) });
  assert.equal(response.status, 200);
  assert.deepEqual(orderTitles(), ['fixed A', 'free B', 'free A', 'fixed B']);
  assert.equal(state.blocks.find((b) => b.id === 72).sort_order, 30);
  assert.equal(state.blocks.find((b) => b.id === 70).sort_order, 10);
  assert.equal(state.blocks.find((b) => b.id === 73).sort_order, 900);
  const beforeContentSaveOrders = orderBlocks().map((b) => [b.id, b.sort_order]);
  response = await fetch(`${base}/api/admin/blocks`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ ...freeA, body: 'Free A content edit', sort_order: downMove.sortOrder }) });
  assert.equal(response.status, 200);
  assert.deepEqual(orderBlocks().map((b) => [b.id, b.sort_order]), beforeContentSaveOrders, 'plain content save must not renumber sibling blocks');
  const upMove = movedBlockOrder(orderEntries(), 2, 'up');
  assert.equal(upMove.moved.id, 71);
  assert.equal(upMove.sortOrder, 20);
  response = await fetch(`${base}/api/admin/blocks`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ ...state.blocks.find((b) => b.id === 71), sort_order: upMove.sortOrder }) });
  assert.equal(response.status, 200);
  assert.deepEqual(orderTitles(), ['fixed A', 'free A', 'free B', 'fixed B']);
  assert.throws(() => movedBlockOrder(orderEntries(), 1, 'up'), /Nincs elegendő sorrendi hely/);
  const beforeGapFailure = JSON.stringify(orderBlocks());
  assert.throws(() => movedBlockOrder([{ id: 1, fixed: true, sortOrder: 10 }, { id: 2, fixed: false, sortOrder: 11 }, { id: 3, fixed: false, sortOrder: 12 }, { id: 4, fixed: true, sortOrder: 13 }], 1, 'down'), /Nincs elegendő sorrendi hely/);
  assert.equal(JSON.stringify(orderBlocks()), beforeGapFailure, 'gap failure must not mutate mock DB');

  response = await fetch(`${base}/admin/pages`, { headers: { cookie } });
  assert.equal(response.status, 200);
  const pagesHtml = await response.text();
  assert.match(pagesHtml, /admin-nav/);
  assert.match(pagesHtml, /Oldalak/);
  assert.match(pagesHtml, /Oldal neve/);
  assert.match(pagesHtml, /Típus/);
  assert.match(pagesHtml, /Új oldal létrehozása/);
  assert.match(pagesHtml, /Általános tartalmi oldal/);
  assert.match(pagesHtml, /Kilépés/);
  assert.doesNotMatch(pagesHtml, />Dashboard</);
  assert.match(pagesHtml, /button,\.btn\{[^}]*cursor:pointer/);
  assert.match(pagesHtml, /button:hover,\.btn:hover/);
  assert.match(pagesHtml, /button:focus-visible,\.btn:focus-visible/);
  assert.match(pagesHtml, /button:disabled/);
  assert.match(pagesHtml, /button:active,\.btn:active,\.admin-nav a:active/);
  assert.match(pagesHtml, /transform:translateY\(1px\) scale\(\.99\)/);
  assert.match(pagesHtml, /\.admin-header\{position:sticky;top:0;z-index:30/);
  assert.match(pagesHtml, /#msg\{position:sticky;top:118px;z-index:25/);

  response = await fetch(`${base}/admin/dashboard`, { headers: { cookie }, redirect: 'manual' });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/admin/pages');

  response = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bad', password: 'short' }) });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).ok, false);

  response = await fetch(`${base}/api/admin/pages`);
  assert.equal(response.status, 401);
  response = await fetch(`${base}/api/admin/pages`, { headers: { cookie: 'easylink_site_admin=bad.cookie' } });
  assert.equal(response.status, 401);

  response = await fetch(`${base}/api/admin/pages`, { headers: { cookie } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data[0].route, '/arak/');

  response = await fetch(`${base}/api/admin/settings`);
  assert.equal(response.status, 401);
  response = await fetch(`${base}/api/admin/settings`, { headers: { cookie } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.analytics.provider, 'none');
  response = await fetch(`${base}/admin/settings`, { headers: { cookie } });
  assert.equal(response.status, 200);
  const settingsHtmlInitial = await response.text();
  assert.match(settingsHtmlInitial, /Alapadatok/);
  assert.match(settingsHtmlInitial, /Általános Szerződési Feltételek/);
  assert.match(settingsHtmlInitial, /Adatkezelési Tájékoztató/);
  assert.match(settingsHtmlInitial, /Cookie Tájékoztató/);
  assert.match(settingsHtmlInitial, /settingsSaveOutcome/);
  assert.equal(settingsSaveOutcome({ ok: true, publish: { ok: true } }).ok, true);
  assert.equal(settingsSaveOutcome({ ok: true, publish: { status: 'publish_in_progress' } }).ok, false);
  assert.equal(settingsSaveOutcome({ ok: true, publish: { ok: false, status: 'failed' } }).ok, false);

  response = await fetch(`${base}/admin/media`, { redirect: 'manual' });
  assert.equal(response.status, 303);
  response = await fetch(`${base}/api/admin/media`);
  assert.equal(response.status, 401);
  response = await fetch(`${base}/admin/media`, { headers: { cookie } });
  assert.equal(response.status, 200);
  const mediaHtml = await response.text();
  assert.match(mediaHtml, /Média könyvtár/);
  assert.match(mediaHtml, /type="file"/);
  assert.match(mediaHtml, /Feltöltés/);
  assert.match(mediaHtml, /URL másolása/);
  assert.match(mediaHtml, /data-media-alt/);
  assert.match(mediaHtml, /Alt mentése/);
  assert.doesNotMatch(mediaHtml, /MVP skeleton/);
  response = await fetch(`${base}/api/admin/media`, { headers: { cookie } });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).data, []);
  const png = new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,0]);
  let fd = new FormData();
  fd.set('alt', 'Teszt kép');
  fd.set('file', new Blob([png], { type: 'image/png' }), 'Teszt Kép.png');
  response = await fetch(`${base}/api/admin/media`, { method: 'POST', headers: { cookie }, body: fd });
  assert.equal(response.status, 200);
  let mediaSaved = await response.json();
  assert.match(mediaSaved.data.path, /^\/assets\/site-media\/\d{4}\/\d{2}\/teszt-k[a-z-]*p-[a-f0-9]{8}\.png$/);
  assert.equal(mediaSaved.data.type, 'image/png');
  assert.equal(existsSync(join(mediaStorageDir, mediaSaved.data.path.replace('/assets/site-media/', ''))), true);
  response = await fetch(`${base}/api/admin/media/${mediaSaved.data.id}/file`, { headers: { cookie } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  response = await fetch(`${base}/api/admin/media/${mediaSaved.data.id}`, { method: 'PATCH', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ alt: 'Javított alt' }) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.alt, 'Javított alt');
  response = await fetch(`${base}/api/admin/media`, { headers: { cookie } });
  assert.equal((await response.json()).data[0].alt, 'Javított alt');
  response = await fetch(`${base}/api/admin/media/999`, { method: 'PATCH', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ alt: 'Hiányzó' }) });
  assert.equal(response.status, 404);
  response = await fetch(`${base}/api/admin/media/${mediaSaved.data.id}`, { method: 'PATCH', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ status: 'bad' }) });
  assert.equal(response.status, 400);
  fd = new FormData();
  fd.set('file', new Blob(['<svg></svg>'], { type: 'image/svg+xml' }), 'bad.svg');
  response = await fetch(`${base}/api/admin/media`, { method: 'POST', headers: { cookie }, body: fd });
  assert.equal(response.status, 400);
  fd = new FormData();
  fd.set('file', new Blob([png], { type: 'image/jpeg' }), 'bad.jpg');
  response = await fetch(`${base}/api/admin/media`, { method: 'POST', headers: { cookie }, body: fd });
  assert.equal(response.status, 400);
  fd = new FormData();
  fd.set('file', new Blob([new Uint8Array(100)], { type: 'image/png' }), 'too-big.png');
  response = await fetch(`${base}/api/admin/media`, { method: 'POST', headers: { cookie }, body: fd });
  assert.equal(response.status, 400);

  const mp4 = new Uint8Array([...Buffer.from([0,0,0,24]), ...Buffer.from('ftypisom'), ...new Uint8Array(32)]);
  fd = new FormData();
  fd.set('file', new Blob([mp4], { type: 'video/mp4' }), 'Teszt Video.mp4');
  response = await fetch(`${base}/api/admin/media`, { method: 'POST', headers: { cookie }, body: fd });
  assert.equal(response.status, 200);
  const videoQueued = await response.json();
  assert.equal(videoQueued.data.type, 'video/mp4');
  assert.equal(videoQueued.data.processing_status, 'queued');
  assert.equal(existsSync(videoQueued.data.staging_path), true);
  response = await fetch(`${base}/admin/media`, { headers: { cookie } });
  const videoHtml = await response.text();
  assert.match(videoHtml, /accept="image\/webp,image\/jpeg,image\/png,video\/mp4,application\/pdf"/);
  assert.match(videoHtml, /Videó queued|processing_status/);
  assert.match(videoHtml, /Csak aktív, kész (MP4 videók|WebP\/JPG\/PNG képek) választhatók|Válassz egy aktív, kész média elemet/);
  const readyPath = '/assets/site-media/2026/07/ready-a1b2c3d4.mp4';
  await mkdir(join(mediaStorageDir, '2026', '07'), { recursive: true });
  await writeFile(join(mediaStorageDir, '2026', '07', 'ready-a1b2c3d4.mp4'), Buffer.from('0123456789'));
  state.media.push({ id: state.nextMediaId++, path: readyPath, alt: 'Ready video', type: 'video/mp4', status: 'active', processing_status: 'ready', original_size_bytes: 100, final_size_bytes: 25, created_at: new Date().toISOString() });
  response = await fetch(`${base}/admin/media`, { headers: { cookie } });
  assert.match(await response.text(), /<video controls preload="metadata"/);
  response = await fetch(`${base}/api/admin/media/${state.nextMediaId - 1}/file`, { headers: { cookie, range: 'bytes=2-5' } });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('accept-ranges'), 'bytes');
  assert.equal(response.headers.get('content-range'), 'bytes 2-5/10');
  assert.equal(await response.text(), '2345');
  response = await fetch(`${base}/api/admin/media/${state.nextMediaId - 1}/file`, { headers: { cookie, range: 'bytes=20-30' } });
  assert.equal(response.status, 416);

  const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(6 * 1024 * 1024)]);
  fd = new FormData();
  fd.set('alt', 'ÁSZF PDF');
  fd.set('file', new Blob([pdf], { type: 'application/pdf' }), 'aszf.pdf');
  response = await fetch(`${base}/api/admin/media`, { method: 'POST', headers: { cookie }, body: fd });
  assert.equal(response.status, 200);
  const pdfSaved = await response.json();
  assert.equal(pdfSaved.data.type, 'application/pdf');
  assert.equal(pdfSaved.data.processing_status, 'ready');
  response = await fetch(`${base}/admin/media`, { headers: { cookie } });
  const pdfMediaHtml = await response.text();
  assert.match(pdfMediaHtml, /PDF max: 10 MB/);
  assert.match(pdfMediaHtml, /PDF dokumentum/);
  assert.match(pdfMediaHtml, /documentMaxBytes=10485760/);
  assert.match(pdfMediaHtml, /function isPdfFile/);
  assert.match(pdfMediaHtml, /kind === 'document'|kind==='document'/);

  const validSettings = { analytics: { enabled: true, provider: 'ga4', ga4MeasurementId: 'G-ABC1234', consentMode: 'basic', consentConfigurationVersion: 1 }, legalDocuments: { termsPdfPath: pdfSaved.data.path, privacyPdfPath: '', cookiePdfPath: '' } };
  publishMode = 'success';
  for (const field of ['termsPdfPath','privacyPdfPath','cookiePdfPath']) {
    const payload = { ...validSettings, legalDocuments: { termsPdfPath: '', privacyPdfPath: '', cookiePdfPath: '', [field]: pdfSaved.data.path } };
    response = await fetch(`${base}/api/admin/settings`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
    assert.equal(response.status, 200);
    response = await fetch(`${base}/api/admin/media/${pdfSaved.data.id}`, { method: 'DELETE', headers: { cookie } });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error.message, /A dokumentum jelenleg jogi dokumentumként van használatban\. Előbb távolítsd el az Alapadatok oldalon\./);
    assert.equal(state.media.find((m) => m.id === pdfSaved.data.id).status, 'active');
    response = await fetch(`${base}/api/admin/media/${pdfSaved.data.id}`, { method: 'PATCH', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ status: 'archived' }) });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error.message, /A dokumentum jelenleg jogi dokumentumként van használatban\. Előbb távolítsd el az Alapadatok oldalon\./);
    assert.equal(state.media.find((m) => m.id === pdfSaved.data.id).status, 'active');
    response = await fetch(`${base}/api/admin/media/${pdfSaved.data.id}`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ status: 'archived' }) });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error.message, /A dokumentum jelenleg jogi dokumentumként van használatban\. Előbb távolítsd el az Alapadatok oldalon\./);
    assert.equal(state.media.find((m) => m.id === pdfSaved.data.id).status, 'active');
    response = await fetch(`${base}/api/admin/media/${pdfSaved.data.id}`, { method: 'PATCH', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ alt: 'Jogi PDF alt frissítve' }) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.alt, 'Jogi PDF alt frissítve');
    response = await fetch(`${base}/api/admin/media/${pdfSaved.data.id}`, { method: 'PATCH', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ status: 'active' }) });
    assert.equal(response.status, 200);
  }
  response = await fetch(`${base}/api/admin/settings`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(validSettings) });
  assert.equal(response.status, 200);
  let settingsSaved = await response.json();
  assert.equal(settingsSaved.ok, true);
  assert.equal(settingsSaved.publish.ok, true);
  assert.equal(state.settings.legalDocuments.termsPdfPath, pdfSaved.data.path);
  response = await fetch(`${base}/api/admin/settings`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ ...validSettings, analytics: { ...validSettings.analytics, ga4MeasurementId: 'UA-1' } }) });
  assert.equal(response.status, 400);
  response = await fetch(`${base}/api/admin/settings`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ ...validSettings, analytics: { ...validSettings.analytics, consentMode: 'advanced' } }) });
  assert.equal(response.status, 400);
  publishMode = 'running';
  response = await fetch(`${base}/api/admin/settings`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ ...validSettings, legalDocuments: { ...validSettings.legalDocuments, privacyPdfPath: '' } }) });
  settingsSaved = await response.json();
  assert.equal(settingsSaved.ok, true);
  assert.equal(settingsSaved.publish.status, 'publish_in_progress');
  assert.equal(settingsSaveOutcome(settingsSaved).ok, false);
  publishMode = 'failed';
  response = await fetch(`${base}/api/admin/settings`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(validSettings) });
  settingsSaved = await response.json();
  assert.equal(settingsSaved.ok, true);
  assert.equal(settingsSaved.publish.status, 'failed');
  assert.equal(settingsSaveOutcome(settingsSaved).ok, false);
  publishMode = 'success';
  const freePdf = { id: state.nextMediaId++, path: '/assets/site-media/2026/07/free-a1b2c3d4.pdf', alt: 'Free PDF', type: 'application/pdf', status: 'active', processing_status: 'ready', created_at: new Date().toISOString() };
  state.media.push(freePdf);
  response = await fetch(`${base}/api/admin/media/${freePdf.id}`, { method: 'PATCH', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ status: 'archived' }) });
  assert.equal(response.status, 200);
  assert.equal(freePdf.status, 'archived');
  const freePdfDelete = { id: state.nextMediaId++, path: '/assets/site-media/2026/07/free-delete-a1b2c3d4.pdf', alt: 'Free PDF delete', type: 'application/pdf', status: 'active', processing_status: 'ready', created_at: new Date().toISOString() };
  state.media.push(freePdfDelete);
  response = await fetch(`${base}/api/admin/media/${freePdfDelete.id}`, { method: 'DELETE', headers: { cookie } });
  assert.equal(response.status, 200);
  assert.equal(freePdfDelete.status, 'archived');
  response = await fetch(`${base}/api/admin/settings`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ ...validSettings, legalDocuments: { termsPdfPath: '', privacyPdfPath: '', cookiePdfPath: '' } }) });
  assert.equal(response.status, 200);

  for (const m of state.media.filter((x)=>String(x.id)!==String(mediaSaved.data.id))) m.status = 'archived';
  response = await fetch(`${base}/api/admin/media/${mediaSaved.data.id}`, { method: 'DELETE', headers: { cookie } });
  assert.equal(response.status, 200);
  assert.equal(state.media[0].status, 'archived');
  response = await fetch(`${base}/api/admin/media`, { headers: { cookie } });
  assert.deepEqual((await response.json()).data, []);

  response = await fetch(`${base}/api/admin/pages`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Rólunk', route: '/rolunk/', type: 'content_page', status: 'draft' }) });
  assert.equal(response.status, 200);
  let saved = await response.json();
  assert.equal(saved.data.id, 24);
  assert.equal(state.pages.find((p) => p.id === 24).type, 'content_page');

  response = await fetch(`${base}/api/admin/pages`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Dupla', route: '/arak/', type: 'content_page', status: 'draft' }) });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error.message, /Ez az URL már létezik/);

  response = await fetch(`${base}/api/admin/pages/24`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ route: '/arak/' }) });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error.message, /Ez az URL már létezik/);

  response = await fetch(`${base}/api/admin/pages`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Root', route: '/', type: 'content_page', status: 'draft' }) });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error.message, /Adj meg érvényes URL-t/);

  response = await fetch(`${base}/api/admin/pages/1`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ route: '/' }) });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error.message, /Adj meg érvényes URL-t/);

  response = await fetch(`${base}/api/admin/pages/10`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ route: '/', title: 'Kezdőlap módosítva', seo_title: 'Home SEO módosítva', hero_title: 'Home hero módosítva', status: 'draft' }) });
  assert.equal(response.status, 200);
  saved = await response.json();
  assert.equal(saved.publish.ok, true);
  const homePage = state.pages.find((p) => p.id === 10);
  assert.equal(homePage.route, '/');
  assert.equal(homePage.slug, 'home');
  assert.equal(homePage.title, 'Kezdőlap módosítva');
  assert.equal(homePage.seo_title, 'Home SEO módosítva');
  assert.equal(homePage.hero_title, 'Home hero módosítva');
  assert.equal(homePage.status, 'draft');

  response = await fetch(`${base}/api/admin/pages/1`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ ...state.pages[0], title: 'Árak módosítva' }) });
  assert.equal(response.status, 200);
  saved = await response.json();
  assert.equal(saved.publish.ok, true);
  assert.equal(state.pages[0].title, 'Árak módosítva');

  response = await fetch(`${base}/api/admin/pages/1`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ ...state.pages[0], hero_height: 'tall', hero_image_fit: 'contain', hero_image_position_x: '25', hero_image_position_y: '60', hero_image_position_mobile_x: '', hero_image_position_mobile_y: '', hero_overlay_strength: 'strong' }) });
  assert.equal(response.status, 200);
  assert.equal(state.pages[0].hero_height, 'tall');
  assert.equal(state.pages[0].hero_image_fit, 'contain');
  assert.equal(state.pages[0].hero_image_position_x, '25');
  assert.equal(state.pages[0].hero_image_position_mobile_x, '');
  response = await fetch(`${base}/api/admin/pages/1`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ ...state.pages[0], hero_image_scale: '120' }) });
  assert.equal(response.status, 200);
  assert.equal(state.pages[0].hero_image_scale, '120');
  response = await fetch(`${base}/api/admin/pages/1`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ ...state.pages[0], hero_image_scale: '' }) });
  assert.equal(response.status, 200);
  assert.equal(state.pages[0].hero_image_scale, '');
  for (const bad of [{ hero_image_fit: 'bad' }, { hero_height: 'huge' }, { hero_overlay_strength: 'dark' }, { hero_image_position_x: '-1' }, { hero_image_position_y: '101' }, { hero_image_position_mobile_x: 'abc' }, { hero_image_scale: '49' }, { hero_image_scale: '201' }, { hero_image_scale: 'abc' }, { hero_image_scale: '120.5' }]) {
    response = await fetch(`${base}/api/admin/pages/1`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ ...state.pages[0], ...bad }) });
    assert.equal(response.status, 400);
  }

  const beforeBlocks = state.blocks.length;
  response = await fetch(`${base}/api/admin/blocks`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ page_id: 1, type: 'text', title: 'New', body: 'Body', items: '["ok"]', status: 'published', sort_order: 2 }) });
  assert.equal(response.status, 200);
  assert.equal(state.blocks.length, beforeBlocks + 1);
  assert.match(state.blocks.at(-1).block_key, /^manual:/);

  response = await fetch(`${base}/api/admin/blocks`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ page_id: 1, type: 'text', title: 'Bad', items: '{bad', status: 'published' }) });
  assert.equal(response.status, 400);
  assert.equal(state.blocks.length, beforeBlocks + 1);

  response = await fetch(`${base}/api/admin/blocks/1`, { method: 'DELETE', headers: { cookie } });
  assert.equal(response.status, 200);
  assert.equal(state.blocks[0].status, 'archived');

  response = await fetch(`${base}/admin/menu`, { headers: { cookie } });
  assert.equal(response.status, 200);
  const menuHtml = await response.text();
  assert.match(menuHtml, /data-nav-item/);
  assert.match(menuHtml, /data-field=\"title\"/);
  assert.match(menuHtml, /Menüpont felirata/);
  assert.match(menuHtml, /Külső URL/);
  assert.match(menuHtml, /Sorrend/);
  assert.match(menuHtml, /Látható/);
  assert.match(menuHtml, /Rejtett piszkozat/);
  assert.match(menuHtml, /Menüpont hozzáadása/);
  { const bodyMenu = menuHtml.slice(menuHtml.indexOf('<form class="admin-form admin-section" id="nav-form"')); assert.ok(bodyMenu.indexOf('id="nav-rows"') < bodyMenu.indexOf('id="add-nav"') && bodyMenu.indexOf('id="add-nav"') < bodyMenu.indexOf('admin-save-bar')); }
  assert.match(menuHtml, /navSerializer/);
  assert.match(menuHtml, /initializeMenuDirtyState\(form,rows,navSerializer,updateRow,setupDirtyForm\)/);
  assert.match(menuHtml, /renumber\(\)/);
  assert.doesNotMatch(menuHtml, /<th>title<\/th>/);
  assert.doesNotMatch(menuHtml, /text-decoration:line-through/);

  response = await fetch(`${base}/api/admin/navigation`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ items: [] }) });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).ok, false);
  assert.equal(state.nav[0].title, 'Árak');

  response = await fetch(`${base}/api/admin/navigation`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ items: [
    { id: 1, title: 'Díjszabás', href: '/arak/', sort_order: 1, status: 'published' },
    { id: 2, title: 'Kapcsolat', href: '/kapcsolat/', sort_order: 2, status: 'published' },
    { id: 3, title: 'Archív', href: '/archiv/', sort_order: 3, status: 'draft' },
  ] }) });
  assert.equal(response.status, 200);
  saved = await response.json();
  assert.equal(saved.publish.ok, true);
  assert.equal(state.nav[0].title, 'Díjszabás');
  assert.equal(state.nav[0].href, '/arak/');
  assert.equal(state.nav[0].sort_order, 1);
  assert.equal(state.nav[1].title, 'Kapcsolat');
  assert.equal(state.nav[2].status, 'draft');

  response = await fetch(`${base}/api/admin/navigation`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ items: [
    { id: '', title: 'Blog', href: '/blog/', sort_order: 4, status: 'draft' },
  ] }) });
  assert.equal(response.status, 200);
  assert.equal(state.nav.at(-1).title, 'Blog');

  response = await fetch(`${base}/api/admin/navigation`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ items: [
    { id: 999, title: 'Hiányzó', href: '/hianyzo/', sort_order: 9, status: 'draft' },
  ] }) });
  assert.equal(response.status, 500);
  assert.equal(state.nav.find((n) => n.id === 999), undefined);

  state.snapshots = [{ id: 7, created_at: '2026-07-08', created_by_admin_id: 1, content_hash: 'abcdef123456', status: 'success', is_current: 1, content_json: { pages: [{ ...state.pages[0], title: 'Rollback' }], blocks: state.blocks, navigation: state.nav, settings: [], media: [] } }];
  response = await fetch(`${base}/admin/publish`, { headers: { cookie } });
  assert.equal(response.status, 200);
  const publishHtml = await response.text();
  assert.match(publishHtml, /Korábbi élesítések \/ Visszaállítás/);
  assert.match(publishHtml, /Visszaállítás erre az állapotra/);
  assert.doesNotMatch(publishHtml, /Utolsó hiba/);
  assert.doesNotMatch(publishHtml, /Újraélesítés/);
  assert.doesNotMatch(publishHtml, /Aktuális publish státusz/);
  response = await fetch(`${base}/api/admin/publish/rollback/7`, { method: 'POST', headers: { cookie } });
  assert.equal(response.status, 200);
  assert.equal(state.pages[0].title, 'Rollback');
  assert.ok(state.publishCalls >= 3);

  response = await fetch(`${base}/admin/pages/1`, { headers: { cookie } });
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Oldal szerkesztése/);
  const fixedPageEditorHtml = await (await fetch(`${base}/admin/pages/1`, { headers: { cookie } })).text();
  assert.doesNotMatch(fixedPageEditorHtml, /nem ebből a blokklistából szerkeszthető|nem aktív szerkesztőfelület|csak a publicban ténylegesen renderelt/);
  for (const label of ['Hero kép megjelenítés', 'Hero magasság', 'Kép illesztése', 'Vízszintes pozíció', 'Függőleges pozíció', 'Mobil vízszintes pozíció', 'Mobil függőleges pozíció', 'Sötét overlay erősség', 'Kép mérete / nagyítás', '100 = alapértelmezett', 'A magasság a hero blokk vizuális magasságát állítja']) assert.match(fixedPageEditorHtml, new RegExp(label));
  assert.match(fixedPageEditorHtml, /Blokk típusa/);
  if (!state.pages.find((p) => p.id === 20)) state.pages.push({ id: 20, route: '/megoldasaink/', slug: 'megoldasaink', type: 'solutions_index', title: 'Megoldásaink', status: 'published', sort_order: 10, seo_title: 'Megoldásaink', seo_description: 'Desc', hero_eyebrow: 'Megoldásaink', hero_title: 'Hero', hero_description: 'Hero desc', hero_asset: '/asset.webp' });
  if (!state.blocks.find((b) => b.id === 20)) state.blocks.push({ id: 20, page_id: 20, block_key: 'seed:/megoldasaink/:cards:0', type: 'cards', title: 'Megoldás lista', body: 'Body', items: '[{"title":"Pénzügy","text":"Szöveg","url":"/megoldasaink/penzugy-szamlazas/","linkLabel":"Részletek →","order":1}]', status: 'published', sort_order: 1 });
  const goldenPageEditorHtml = await (await fetch(`${base}/admin/pages/20`, { headers: { cookie } })).text();
  assert.doesNotMatch(goldenPageEditorHtml, /csak a publicban ténylegesen renderelt Kártyasor komponens szerkeszthető|nem aktív szerkesztőfelület/);
  assert.match(goldenPageEditorHtml, /Kártyasor/);
  assert.match(goldenPageEditorHtml, /Tartalmi blokkok/);
  assert.match(goldenPageEditorHtml, /Rögzített megjelenési hely/);
  assert.match(goldenPageEditorHtml, /data-move-block="up" class="secondary" disabled/);
  assert.match(goldenPageEditorHtml, /Szövegblokk<\/option>/);
  if (!state.pages.find((p) => p.id === 22)) state.pages.push({ id: 22, route: '/megoldasaink-fallback/', slug: 'megoldasaink-fallback', type: 'solutions_index', title: 'Megoldásaink fallback', status: 'published', sort_order: 11, seo_title: 'Megoldásaink fallback', seo_description: 'Desc', hero_eyebrow: 'Megoldásaink', hero_title: 'Hero', hero_description: 'Hero desc', hero_asset: '/asset.webp' });
  if (!state.blocks.find((b) => b.id === 22)) state.blocks.push({ id: 22, page_id: 22, block_key: 'seed:/megoldasaink-fallback/:feature-list:0', type: 'feature-list', title: 'Régi nem renderelt feature', body: 'Body', items: '["Régi"]', status: 'published', sort_order: 1 });
  if (!state.pages.find((p) => p.id === 23)) state.pages.push({ id: 23, route: '/integraciok-fallback/', slug: 'integraciok-fallback', type: 'integrations', title: 'Integrációk fallback', status: 'published', sort_order: 12, seo_title: 'Integrációk fallback', seo_description: 'Desc', hero_eyebrow: 'Integrációk', hero_title: 'Hero', hero_description: 'Hero desc', hero_asset: '/asset.webp' });
  if (!state.blocks.find((b) => b.id === 23)) state.blocks.push({ id: 23, page_id: 23, block_key: 'seed:/integraciok-fallback/:text:0', type: 'text', title: 'Régi nem renderelt integráció szöveg', body: 'Body', items: '[]', status: 'published', sort_order: 1 });
  const fallbackSolutionsHtml = await (await fetch(`${base}/admin/pages/22`, { headers: { cookie } })).text();
  assert.doesNotMatch(fallbackSolutionsHtml, /Pénzügy és számlázás|CRM és ügyfélkezelés/);
  assert.match(fallbackSolutionsHtml, /Régi nem renderelt feature/);
  assert.doesNotMatch(fallbackSolutionsHtml, /Új sor<\/button><\/div><input type="hidden" name="items" value="\[\]"/);
  const fallbackIntegrationsHtml = await (await fetch(`${base}/admin/pages/23`, { headers: { cookie } })).text();
  assert.doesNotMatch(fallbackIntegrationsHtml, /NAV Online Számla|Billingo/);
  assert.match(fallbackIntegrationsHtml, /Régi nem renderelt integráció szöveg/);

  response = await fetch(`${base}/api/admin/pages`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Teszt szerkeszthető', route: '/teszt-szerkesztheto/', type: 'content_page', status: 'draft' }) });
  assert.equal(response.status, 200);
  const editablePageId = (await response.json()).data.id;
  response = await fetch(`${base}/api/admin/blocks`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ page_id: editablePageId, type: 'text', title: 'Text stale runtime', body: 'Body', items: '[{\"label\":\"Régi CTA\",\"url\":\"/stale-cta/\",\"image\":\"/stale.webp\",\"alt\":\"Régi alt\",\"position\":\"left\",\"title\":\"Régi lista\"}]', status: 'published', sort_order: 1 }) });
  assert.equal(response.status, 200);
  response = await fetch(`${base}/api/admin/blocks`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ page_id: editablePageId, type: 'feature-list', title: 'Feature stale runtime', body: 'Body', items: '[{\"title\":\"Lista\",\"text\":\"Régi kártyaszöveg\",\"url\":\"/stale/\",\"linkLabel\":\"Régi\",\"order\":1}]', status: 'published', sort_order: 2 }) });
  assert.equal(response.status, 200);
  const roundTripCases = [
    { type: 'text', title: 'Text items roundtrip', items: '[{"title":"Text item","url":"/kept/","extra":"x"}]' },
    { type: 'list', title: 'List object roundtrip', items: '[{"title":"List item","text":"body","href":"/href","badge":"A","extra":"x"}]' },
    { type: 'card-grid', title: 'Card grid roundtrip', items: '[{"title":"Card","text":"Body","href":"/href","badge":"B","extra":"x"}]' },
    { type: 'ai-preview', title: 'AI raw roundtrip', items: '[{"title":"AI","message":"Szia","extra":{"kept":true}}]' },
    { type: 'future-widget', title: 'Unknown raw roundtrip', items: '[{"title":"Future","extra":"kept"}]' },
  ];
  for (const block of roundTripCases) {
    response = await fetch(`${base}/api/admin/blocks`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ page_id: editablePageId, type: block.type, title: block.title, body: 'Body', items: block.items, status: 'published', sort_order: 50 }) });
    assert.equal(response.status, 200);
    const saved = state.blocks.find((b) => b.title === block.title);
    assert.equal(saved.type, block.type);
    assert.deepEqual(JSON.parse(saved.items), JSON.parse(block.items));
  }
  response = await fetch(`${base}/api/admin/blocks`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ page_id: editablePageId, type: 'ai-preview', title: 'Invalid raw API', body: 'Body', items: '{bad json', status: 'published', sort_order: 60 }) });
  assert.equal(response.status, 400);
  const pageEditorHtml = await (await fetch(`${base}/admin/pages/${editablePageId}`, { headers: { cookie } })).text();
  const renderedBeforeScript = pageEditorHtml.split('<script>')[0];
  const formForTitle = (title) => {
    const marker = `value="${title}"`;
    const pos = renderedBeforeScript.indexOf(marker);
    assert.notEqual(pos, -1, `missing block form for ${title}`);
    const start = renderedBeforeScript.lastIndexOf('<form class="card block-form block-card"', pos);
    const end = renderedBeforeScript.indexOf('</form>', pos);
    assert.notEqual(start, -1, `missing form start for ${title}`);
    assert.notEqual(end, -1, `missing form end for ${title}`);
    return renderedBeforeScript.slice(start, end + '</form>'.length);
  };
  const textBlockHtml = formForTitle('Text stale runtime');
  assert.doesNotMatch(textBlockHtml, /data-panel="cta"/);
  assert.doesNotMatch(textBlockHtml, /data-panel="image-text"/);
  assert.doesNotMatch(textBlockHtml, /data-panel="items"/);
  for (const label of ['Gomb felirat', 'Gomb link', 'Kép URL', 'Alt text', 'Kép pozíció']) assert.doesNotMatch(textBlockHtml, new RegExp(label));
  const featureBlockHtml = formForTitle('Feature stale runtime');
  assert.doesNotMatch(featureBlockHtml, /Rögzített megjelenési hely/);
  assert.match(featureBlockHtml, /data-move-block="up" class="secondary">Blokk fel/);
  assert.match(featureBlockHtml, /data-panel="items"/);
  assert.match(featureBlockHtml, /Listaelem/);
  for (const label of ['Kártya szövege', 'Cél URL \/ slug', 'Link felirat', 'Sorrend \/ badge']) assert.doesNotMatch(featureBlockHtml, new RegExp(label));
  assert.match(pageEditorHtml, /setupDirtyForm/);
  assert.match(pageEditorHtml, /baseline/);
  assert.match(pageEditorHtml, /addEventListener\('input',sync\)/);
  assert.match(pageEditorHtml, /Nem mentett módosítások/);
  assert.match(pageEditorHtml, /data-dirty-message/);
  assert.match(pageEditorHtml, /current\.remove\(\)/);
  assert.doesNotMatch(pageEditorHtml, /querySelector\('\.err'\)/);
  assert.match(pageEditorHtml, /Oldal neve/);
  assert.match(pageEditorHtml, /Főcím/);
  assert.match(pageEditorHtml, /Bevezető szöveg/);
  assert.match(pageEditorHtml, /Haladó beállítások/);
  assert.match(pageEditorHtml, /SEO cím/);
  assert.match(pageEditorHtml, /data-raw-items/);
  assert.doesNotMatch(pageEditorHtml, /Kis címke \/ szekció címe/);
  assert.match(pageEditorHtml, /Blokk típusa/);
  assert.match(pageEditorHtml, /Szövegblokk/);
  assert.match(pageEditorHtml, /Felsorolás \/ lista/);
  assert.match(pageEditorHtml, /Kártyasor/);
  assert.match(pageEditorHtml, /CTA blokk/);
  assert.match(pageEditorHtml, /Kép \+ szöveg blokk/);
  assert.match(pageEditorHtml, /FAQ blokk/);
  assert.match(pageEditorHtml, /Kártya címe/);
  assert.match(pageEditorHtml, /Kérdés/);
  assert.match(pageEditorHtml, /Válasz/);
  assert.doesNotMatch(pageEditorHtml, /Gomb felirat \/ kép URL/);
  assert.match(pageEditorHtml, /blockSerializer/);
  assert.match(pageEditorHtml, /setupDirtyForm\(f,blockSerializer\)/);
  assert.match(pageEditorHtml, /if\(j.ok&&j.publish\?\.ok\)ps.markSaved\(\)/);
  assert.match(pageEditorHtml, /data-item-url/);
  assert.match(pageEditorHtml, /data-cta-label/);
  assert.match(pageEditorHtml, /data-cta-url/);
  assert.match(pageEditorHtml, /data-image-url/);
  assert.match(pageEditorHtml, /Médiából választok/);
  assert.match(pageEditorHtml, /data-media-picker-target/);
  assert.match(pageEditorHtml, /openMediaPicker/);
  assert.match(pageEditorHtml, /dispatchEvent\(new Event\('input'/);
  assert.match(pageEditorHtml, /data-image-position/);
  assert.match(pageEditorHtml, /f.addEventListener\('input'/);
  assert.match(pageEditorHtml, /data-add-item/);
  assert.match(pageEditorHtml, /function syncBlockType/);
  assert.match(pageEditorHtml, /is-runtime-hidden/);
  assert.match(pageEditorHtml, /function setVisible/);
  assert.match(pageEditorHtml, /function ensurePanel/);
  assert.match(pageEditorHtml, /data-panel=\"items\"/);
  assert.match(pageEditorHtml, /data-panel=\"cta\"/);
  assert.match(pageEditorHtml, /data-panel=\"image-text\"/);
  assert.match(pageEditorHtml, /data-panel=\"video\"/);
  assert.match(pageEditorHtml, /data-video-source/);
  assert.match(pageEditorHtml, /data-video-media-path/);
  assert.match(pageEditorHtml, /data-video-youtube-url/);
  assert.match(pageEditorHtml, /function syncVideoSource/);
  assert.match(pageEditorHtml, /const videoValues=getVideoRows\(f\)/);
  assert.match(pageEditorHtml, /let items=\[\]/);
  assert.match(pageEditorHtml, /f\.querySelector\('input\[name=\"items\"\]'\)\.value=JSON\.stringify\(items\)/);
  assert.match(pageEditorHtml, /data-field=\"item-label\"/);
  assert.match(pageEditorHtml, /data-field=\"item-badge\"/);
  assert.match(pageEditorHtml, /i.disabled=!show/);
  assert.match(pageEditorHtml, /serializeEditorItems\(\{type,rows:/);
  assert.match(pageEditorHtml, /type==='video'\?videoValues/);
  assert.match(pageEditorHtml, /type==='cta'\|\|type==='image-text'\?panelValues:rowData/);
  assert.match(pageEditorHtml, /function firstItem\(f\)/);
  assert.match(pageEditorHtml, /first:firstItem\(f\)/);
  assert.match(pageEditorHtml, /data-raw-item="\{\}"/);
  assert.match(pageEditorHtml, /raw=parseItemRowRaw\(r\.dataset\.rawItem/);
  assert.match(pageEditorHtml, /const idInput=f.querySelector\('input\[name=\"id\"\]'\)/);
  assert.match(pageEditorHtml, /idInput\.value=String\(j.data.id\)/);
  assert.match(pageEditorHtml, /st.markSaved\(\)/);
  const menuEditorHtml = await (await fetch(`${base}/admin/menu`, { headers: { cookie } })).text();
  assert.match(menuEditorHtml, /Mentés és élesítés/);
  assert.match(menuEditorHtml, /setupDirtyForm/);
  assert.match(menuEditorHtml, /baseline/);
  assert.match(menuEditorHtml, /state.markSaved\(\)/);
  assert.match(menuEditorHtml, /is-archived-ui/);
  assert.match(menuEditorHtml, /state.markSaving\(\)/);
  assert.match(menuEditorHtml, /if\(j.ok\)state.markSaved\(\)/);
  assert.doesNotMatch(menuEditorHtml, /location\.reload\(\)/);
} finally {
  server.close();
}

assert.equal(verifyPassword('x', 'scrypt:salt:abcd'), false);
assert.equal(verifyPassword('x', 'bad'), false);
assert.equal(readCookie('easylink_site_admin=%E0%A4%A'), undefined);
assert.equal(verifySessionToken('bad.cookie'), null);
assert.equal(shouldTryDbContentForEnv({ SITE_CONTENT_SOURCE: 'static', DB_HOST: 'localhost' }), false);
assert.equal(shouldTryDbContentForEnv({ SITE_CONTENT_SOURCE: 'auto', DB_HOST: 'localhost', DB_NAME: 'site', DB_USER: 'site' }), true);
assert.equal(await pageWithFallback('/arak/', { getPageByRouteAny: async () => ({ ...staticPagesData.find((page) => page.route === '/arak/'), status: 'draft' }) }, staticPagesData), undefined);
assert.equal((await pageWithFallback('/arak/', { getPageByRouteAny: async () => null, getPageByRoute: async () => null }, staticPagesData)).route, '/arak/');
assert.equal((await pageWithFallback('/arak/', { getPageByRoute: async () => { throw new Error('db down'); } }, staticPagesData)).route, '/arak/');
const requiredRoutes = ['/', '/megoldasaink/', '/megoldasaink/penzugy-szamlazas/', '/megoldasaink/hr-munkaugy/', '/megoldasaink/crm-ugyfelkezeles/', '/megoldasaink/dokumentumkezeles-adminisztracio/', '/megoldasaink/kontrolling/', '/megoldasaink/ai-asszisztens/', '/kinek-szol/', '/kinek-szol/hotelek-szallashelyek/', '/kinek-szol/vendeglatohelyek/', '/kinek-szol/szolgaltato-vallalkozasok/', '/integraciok/', '/arak/', '/kapcsolat/'];
for (const route of requiredRoutes) assert.ok(staticPagesData.find((page) => page.route === route), `missing fallback route ${route}`);
assert.equal(new Set(staticPagesData.map((page) => page.route)).size, staticPagesData.length);
assert.equal(new Set(staticPagesData.flatMap((page) => page.blocks.map((block, index) => `${page.route}:${block.type}:${index}`))).size, staticPagesData.reduce((sum, page) => sum + page.blocks.length, 0));
const seededText = JSON.stringify(staticPagesData);
for (const phrase of ['Mitől függhet az ár?', 'Demó alapján pontosítunk', 'Miben tudunk segíteni?', 'Nem még egy táblázat', 'Nem késznek állított ígéretek', 'Megoldás lista', 'Célcsoportok']) assert.ok(seededText.includes(phrase), `missing seeded phrase: ${phrase}`);
const seededTypes = new Set(staticPagesData.flatMap((page) => page.blocks.map((block) => block.type)));
for (const type of ['text', 'feature-list', 'cards', 'cta']) assert.ok(seededTypes.has(type), `missing seeded block type ${type}`);
const dynamicCatchAllSource = readFileSync('src/pages/[...slug].astro', 'utf8');
assert.match(dynamicCatchAllSource, /listPublishedPublicPages/);
assert.match(dynamicCatchAllSource, /PublicPageRenderer/);
assert.doesNotMatch(dynamicCatchAllSource, /getPublicPageRenderer/);
const homeSource = readFileSync('src/pages/index.astro', 'utf8');
assert.match(homeSource, /getPublicPageState/);
assert.match(homeSource, /hiddenByDb/);
assert.match(homeSource, /getPublicRouteIndex/);
assert.match(homeSource, /Astro.response.status = 404/);
assert.doesNotMatch(homeSource, /<ContentBlocks\b/);
const staleKeys = staleSeedKeys([
  { block_key: '/arak/:text:0' },
  { block_key: '/arak/:feature-list:0' },
  { block_key: 'manual:test' },
  { block_key: '/kapcsolat/:text:0' },
], ['/arak/:feature-list:0', '/arak/:cta:1'], '/arak/');
assert.deepEqual(staleKeys, ['/arak/:text:0']);
const dryRunOutput = execFileSync('node', ['scripts/db-seed.mjs', '--dry-run'], { encoding: 'utf8' });
assert.match(dryRunOutput, /15 pages, 31 blocks, 5 navigation items/);
assert.match(dryRunOutput, /Stale seed block cleanup: archive route-prefixed seed blocks/);
assert.match(dryRunOutput, /manual:\* blocks are preserved/);
console.log('Admin HTTP smoke passed: login, auth, malformed cookie, pages, blocks, navigation, fallback and seed checks.');
