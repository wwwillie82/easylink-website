import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { applySavedNavigationRowState, buildNavigationPayloadItem, initializeMenuDirtyState, isValidHttpExternalUrlForMenu, navHtml, prefillTargetModeFields } from '../src/lib/admin/render/menu.mjs';
import { dirtyStateJs } from '../src/lib/admin/render/client-js.mjs';
import { validateNavPayload } from '../src/lib/admin/server.mjs';
import { createAdminRepository } from '../src/lib/admin/repository.mjs';
import { createAdminServer } from '../src/lib/admin/server.mjs';
import { signSession } from '../src/lib/admin/auth.mjs';
import { isValidHttpExternalUrl } from '../src/lib/content/internal-links.mjs';

const pages = [
  { id: 1, title: 'Árak', route: '/arak/', status: 'published' },
  { id: 2, title: 'Draft oldal', route: '/draft/', status: 'draft' },
  { id: 3, title: 'Archivált oldal', route: '/archivalt/', status: 'archived' },
];
const items = [
  { id: 10, title: 'Árak', href: '/arak/', sort_order: 1, status: 'published', target_type: 'page', target_page_id: 1, title_override: null },
  { id: 11, title: 'Docs', href: 'https://example.com/docs', sort_order: 2, status: 'draft', target_type: 'external', target_page_id: null, title_override: null },
  { id: 12, title: 'Régi', href: '/kezi?x=1', sort_order: 3, status: 'archived', target_type: 'legacy', target_page_id: null, title_override: null },
];

class FakeEl {
  constructor({ value = '', textContent = '', children = [] } = {}) {
    this.value = value;
    this.textContent = textContent;
    this.children = children;
    this.dataset = {};
    this.hidden = false;
    this.removed = false;
    this.disabled = false;
    this._innerHTML = '';
    this.listeners = {};
    for (const child of children) child.parent = this;
  }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(value) { this._innerHTML = String(value); this.children = []; }
  querySelector(selector) {
    if (selector === 'button[type="submit"]') return this.submitButton || null;
    if (selector === '[data-dirty-message]') return this.children.find((child) => child.dataset.dirtyMessage && !child.removed) || null;
    if (selector === 'option[value="legacy"]') return this.children.find((child) => child.value === 'legacy' && !child.removed) || null;
    return this.map?.[selector] || null;
  }
  querySelectorAll(selector) {
    if (selector === '[data-nav-item]') return this.children.filter((child) => !child.removed);
    return [];
  }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  dispatchEvent(event) { this.listeners[event.type]?.(event); }
  insertAdjacentHTML(_position, html) {
    if (html.includes('value="legacy"')) this.children.push(new FakeEl({ value: 'legacy', textContent: 'Régi kézi URL' }));
    if (html.includes('data-dirty-message')) { const child = new FakeEl({ textContent: 'Nem mentett módosítások.' }); child.dataset.dirtyMessage = '1'; this.children.push(child); }
  }
  remove() { this.removed = true; }
}
function fakeRow({ id = '', initialTarget = 'legacy', hasLegacyOption = true, hasLegacyHelp = true } = {}) {
  const legacyOption = hasLegacyOption ? new FakeEl({ value: 'legacy', textContent: 'Régi kézi URL' }) : null;
  const select = new FakeEl({ children: legacyOption ? [legacyOption] : [] });
  const idInput = new FakeEl({ value: id });
  const idLabel = new FakeEl({ textContent: id || 'új' });
  const help = hasLegacyHelp ? new FakeEl({ textContent: 'Régi kézi URL.' }) : null;
  const row = new FakeEl();
  row.dataset = { new: id ? '0' : '1', initialTarget };
  row.map = {
    '[data-field="id"]': idInput,
    '[data-nav-id-label]': idLabel,
    '[data-role="target-type"]': select,
    '[data-legacy-help]': help,
  };
  return { row, select, idInput, idLabel, help };
}


{
  const msg = new FakeEl();
  const setupDirtyForm = Function('document', `${dirtyStateJs};return setupDirtyForm;`)({ getElementById: () => msg });
  const form = new FakeEl();
  form.submitButton = new FakeEl();
  const model = { value: 'baseline' };
  const state = setupDirtyForm(form, () => JSON.stringify(model));
  assert.equal(state.changed(), false);
  assert.equal(form.submitButton.disabled, true);
  assert.equal(msg.querySelector('[data-dirty-message]'), null);
  model.value = 'changed';
  form.dispatchEvent({ type: 'input' });
  assert.equal(state.changed(), true);
  assert.equal(form.submitButton.disabled, false);
  assert.ok(msg.querySelector('[data-dirty-message]'));
  model.value = 'baseline';
  form.dispatchEvent({ type: 'input' });
  assert.equal(state.changed(), false);
  assert.equal(form.submitButton.disabled, true);
  assert.equal(msg.querySelector('[data-dirty-message]'), null);
  const serverError = new FakeEl({ textContent: 'Szerverhiba' });
  serverError.className = 'msg err';
  msg.children.push(serverError);
  form.dispatchEvent({ type: 'change' });
  assert.equal(msg.children.includes(serverError), true);
  model.value = 'changed again';
  form.dispatchEvent({ type: 'input' });
  state.markSaving();
  assert.match(msg.innerHTML, /Mentés folyamatban/);
  assert.equal(msg.querySelector('[data-dirty-message]'), null);
  model.value = 'saved';
  state.markSaved();
  assert.equal(state.changed(), false);
  assert.equal(msg.querySelector('[data-dirty-message]'), null);
}

const html = navHtml(items, pages);
const layoutCss = await readFile('src/lib/admin/render/layout.mjs', 'utf8');

assert.match(html, /data-nav-item/);
assert.match(html, /Árak — \/arak\/ — Publikus/);
assert.match(html, /Draft oldal — \/draft\/ — Piszkozat/);
assert.doesNotMatch(html, /Archivált oldal — \/archivalt\/ — Archivált/);
assert.match(html, /Régi kézi URL/);
assert.match(html, /data-mode="page"/);
assert.match(html, /data-mode="external"/);
assert.match(html, /data-mode="legacy"/);
assert.match(html, /Válassz célt/);
assert.match(html, /admin-save-bar/);
assert.match(html, /admin-grid--compact/);
assert.ok(html.indexOf('id="nav-rows"') < html.indexOf('id="add-nav"') && html.indexOf('id="add-nav"') < html.indexOf('admin-save-bar'));
assert.doesNotMatch(html.slice(html.indexOf('<header class="admin-section-header"'), html.indexOf('id="nav-rows"')), /Menüpont hozzáadása/);
assert.match(html, /nav-list-actions/);
assert.match(layoutCss, /\.admin-form\{padding-bottom:180px\}/);
assert.match(html, /target-page-meta/);
assert.match(html, /data-role="page-status-badge"/);
assert.doesNotMatch(html, /data-role="page-status"/);
assert.match(html, /Menüpont láthatósága/);
assert.doesNotMatch(html, />Státusz<\/span>/);
assert.match(html, /<span>Menüpont felirata<\/span><input data-field="title_override" data-role="title-override"/);
assert.doesNotMatch(html, /Örökölt \/ effektív felirat|Aktuális oldalroute|Oldal státusza|<span>Egyedi menüfelirat<\/span>/);
assert.match(html, /A céloldal állapota az Oldalak felületen módosítható/);
assert.match(html, /<option value="legacy" selected>Régi kézi URL<\/option>/);
assert.doesNotMatch(html.match(/data-new="0"[\s\S]*?target_type[\s\S]*?<\/select>/)[0], /value="legacy"/);
assert.match(html, /data-new=\\"1\\"/);
assert.doesNotMatch(html.match(/const newCardHtml="([\s\S]*?)";/)[1], /value=\\"legacy\\"/);
assert.match(html, /function menuMsg[\s\S]*textContent/);
assert.match(html, /!e\.target\.matches\('\[data-role=\"target-type\"\]'\)/);
assert.match(html, /previousState=\{\.\.\.rawRowState\(row\),target_type:row\.dataset\.targetMode\}/);

assert.match(html, /applySavedNavigationState\(j\.data\?\.navigationIds\|\|\[\],items\);state\.markSaved\(\)/);
assert.match(html, /function applySavedNavigationState\(ids=\[\],submittedItems=\[\]\)/);
{
  const { row, select, idInput, idLabel, help } = fakeRow({ id: '12', initialTarget: 'legacy' });
  assert.ok(select.querySelector('option[value="legacy"]'));
  assert.ok(help && !help.hidden && !help.removed);
  applySavedNavigationRowState(row, 12, { target_type: 'page' });
  assert.equal(row.dataset.new, '0');
  assert.equal(row.dataset.initialTarget, 'page');
  assert.equal(idInput.value, '12');
  assert.equal(idLabel.textContent, '12');
  assert.equal(select.querySelector('option[value="legacy"]'), null);
  assert.equal(help.removed || help.hidden, true);
}
{
  const { row, select, help } = fakeRow({ id: '12', initialTarget: 'legacy' });
  applySavedNavigationRowState(row, 12, { target_type: 'external' });
  assert.equal(row.dataset.initialTarget, 'external');
  assert.equal(select.querySelector('option[value="legacy"]'), null);
  assert.equal(help.removed || help.hidden, true);
}
{
  const { row, select, help } = fakeRow({ id: '12', initialTarget: 'legacy' });
  applySavedNavigationRowState(row, 12, { target_type: 'legacy' });
  assert.equal(row.dataset.initialTarget, 'legacy');
  assert.ok(select.querySelector('option[value="legacy"]'));
  assert.equal(help.hidden, false);
  assert.equal(help.removed, false);
}

{
  const msg = new FakeEl();
  const setupDirtyForm = Function('document', `${dirtyStateJs};return setupDirtyForm;`)({ getElementById: () => msg });
  const pageRow = new FakeEl();
  pageRow.state = { target_type: 'page', title_mode: 'inherit', title_override: '' };
  const rowsContainer = new FakeEl({ children: [pageRow] });
  const form = new FakeEl();
  form.submitButton = new FakeEl();
  const serializer = () => JSON.stringify(rowsContainer.querySelectorAll('[data-nav-item]').map((row) => row.state));
  const state = initializeMenuDirtyState(form, rowsContainer, serializer, (row) => { if (row.state.target_type === 'page' && row.state.title_mode === 'inherit') row.state.title_override = 'Árak'; }, setupDirtyForm);
  assert.equal(pageRow.state.title_override, 'Árak');
  assert.equal(state.changed(), false);
  assert.equal(form.submitButton.disabled, true);
  assert.doesNotMatch(msg.innerHTML, /Nem mentett módosítások/);
  pageRow.state.title_override = 'Áraink';
  form.dispatchEvent({ type: 'input' });
  assert.equal(state.changed(), true);
  assert.equal(form.submitButton.disabled, false);
  pageRow.state.title_override = 'Árak';
  form.dispatchEvent({ type: 'input' });
  assert.equal(state.changed(), false);
  assert.equal(form.submitButton.disabled, true);
}
{
  const setupDirtyForm = Function('document', `${dirtyStateJs};return setupDirtyForm;`)({ getElementById: () => new FakeEl() });
  for (const rowState of [
    { target_type: 'page', title_mode: 'custom', title_override: 'Egyedi' },
    { target_type: 'external', external_title: 'Docs', external_href: 'https://example.com/docs' },
    { target_type: 'legacy', legacy_title: 'Régi', legacy_href: '/kezi?x=1' },
  ]) {
    const row = new FakeEl();
    row.state = structuredClone(rowState);
    const rowsContainer = new FakeEl({ children: [row] });
    const form = new FakeEl();
    form.submitButton = new FakeEl();
    const serializer = () => JSON.stringify(rowsContainer.querySelectorAll('[data-nav-item]').map((item) => item.state));
    const state = initializeMenuDirtyState(form, rowsContainer, serializer, () => {}, setupDirtyForm);
    assert.equal(state.changed(), false);
    assert.equal(form.submitButton.disabled, true);
  }
}
{
  const setupDirtyForm = Function('document', `${dirtyStateJs};return setupDirtyForm;`)({ getElementById: () => new FakeEl() });
  const row = new FakeEl();
  row.state = { target_type: 'external', external_title: 'Docs', external_href: 'https://example.com/docs' };
  const rowsContainer = new FakeEl({ children: [row] });
  const form = new FakeEl();
  form.submitButton = new FakeEl();
  const serializer = () => JSON.stringify(rowsContainer.querySelectorAll('[data-nav-item]').map((item) => item.state));
  const state = initializeMenuDirtyState(form, rowsContainer, serializer, () => {}, setupDirtyForm);
  const added = new FakeEl();
  added.state = { target_type: '', title_override: '' };
  rowsContainer.children.push(added);
  form.dispatchEvent({ type: 'input' });
  assert.equal(state.changed(), true);
  applySavedNavigationRowState(added, 22, { target_type: 'page' });
  added.state = { target_type: 'page', title_override: 'Új oldal' };
  state.markSaved();
  assert.equal(state.changed(), false);
  assert.equal(form.submitButton.disabled, true);
}
{
  const { row, select, help } = fakeRow({ id: '', initialTarget: '', hasLegacyOption: false, hasLegacyHelp: false });
  applySavedNavigationRowState(row, 21, { target_type: 'page' });
  assert.equal(row.dataset.new, '0');
  assert.equal(row.dataset.initialTarget, 'page');
  assert.equal(select.querySelector('option[value="legacy"]'), null);
  assert.equal(help, null);
}


assert.deepEqual(prefillTargetModeFields({ target_type: 'page', target_page_id: '1', title_mode: 'inherit', title_override: '', external_title: '', external_href: '', legacy_title: '', legacy_href: '' }, pages), { title: 'Árak', href: '/arak/' });
assert.deepEqual(prefillTargetModeFields({ target_type: 'page', target_page_id: '1', title_mode: 'custom', title_override: 'Egyedi page cím', external_title: '', external_href: '', legacy_title: '', legacy_href: '' }, pages), { title: 'Egyedi page cím', href: '/arak/' });
assert.deepEqual(prefillTargetModeFields({ target_type: 'legacy', legacy_title: 'Régi cím', legacy_href: '/regi?x=1' }, pages), { title: 'Régi cím', href: '/regi?x=1' });

const inherited = buildNavigationPayloadItem({ is_new: '0', id: '10', target_type: 'page', target_page_id: '1', title_mode: 'inherit', title_override: '', sort_order: '4', status: 'published' }, pages);
assert.deepEqual(inherited, { id: '10', sort_order: '4', status: 'published', target_type: 'page', target_page_id: 1, title_override: null, title: 'Árak', href: '/arak/' });
const custom = buildNavigationPayloadItem({ is_new: '0', id: '10', target_type: 'page', target_page_id: '1', title_mode: 'custom', title_override: 'Egyedi', sort_order: '1', status: 'draft' }, pages);
assert.equal(custom.title_override, 'Egyedi');
assert.equal(custom.title, 'Egyedi');
const pageToLegacy = buildNavigationPayloadItem({ is_new: '0', id: '10', target_type: 'legacy', legacy_title: 'Árak', legacy_href: '/arak/', sort_order: '1', status: 'published' }, pages);
assert.equal(pageToLegacy.target_page_id, null);
assert.equal(pageToLegacy.title_override, null);
assert.throws(() => buildNavigationPayloadItem({ is_new: '1', target_type: 'legacy', legacy_title: 'X', legacy_href: '/x/', sort_order: '1', status: 'draft' }, pages), /Új menüpont/);
assert.throws(() => buildNavigationPayloadItem({ is_new: '1', target_type: '', sort_order: '1', status: 'draft' }, pages), /Válassz célt/);
assert.throws(() => buildNavigationPayloadItem({ is_new: '0', target_type: 'external', external_title: 'X', external_href: 'https://', sort_order: '1', status: 'draft' }, pages), /URL/);
assert.equal(buildNavigationPayloadItem({ is_new: '1', target_type: 'external', external_title: 'X', external_href: 'https://example.com', sort_order: '7', status: 'draft' }, pages).sort_order, '7');
assert.equal(buildNavigationPayloadItem({ is_new: '1', target_type: 'external', external_title: 'Max', external_href: 'https://example.com/max', sort_order: String(Number.MAX_SAFE_INTEGER), status: 'draft' }, pages).sort_order, String(Number.MAX_SAFE_INTEGER));
assert.equal(buildNavigationPayloadItem({ is_new: '0', target_type: 'page', target_page_id: '1', title_mode: 'inherit', title_override: 'Korábbi override', sort_order: '1', status: 'draft' }, pages).title_override, null);
assert.equal(buildNavigationPayloadItem({ is_new: '0', target_type: 'page', target_page_id: '2', title_mode: 'inherit', title_override: 'Árak', sort_order: '1', status: 'draft' }, pages).title, 'Draft oldal');
assert.throws(() => buildNavigationPayloadItem({ is_new: '0', target_type: 'page', target_page_id: '1', title_mode: 'custom', title_override: '', sort_order: '1', status: 'draft' }, pages), /egyedi menüfelirat/i);
assert.throws(() => buildNavigationPayloadItem({ is_new: '0', target_type: 'page', target_page_id: '999', title_mode: 'inherit', sort_order: '1', status: 'draft' }, pages), /belső oldalt/);
for (const sort_order of [0, -1, 1.5, 'abc', '', Number.MAX_SAFE_INTEGER + 1]) {
  assert.throws(() => buildNavigationPayloadItem({ is_new: '1', target_type: 'external', external_title: 'Bad sort', external_href: 'https://example.com/client-bad-sort', sort_order, status: 'draft' }, pages), /sorrend/);
}

for (const value of ['https://example.com', 'http://example.com/path']) {
  assert.equal(isValidHttpExternalUrlForMenu(value), true);
  assert.equal(isValidHttpExternalUrl(value), true);
  assert.equal(validateNavPayload({ items: [{ title: 'X', href: value, sort_order: 1, status: 'draft', target_type: 'external', target_page_id: null, title_override: null }] }, pages).ok, true);
}
for (const value of ['https://', 'http://', 'mailto:x@example.com', '/belso/', 'https://exa mple.com']) {
  assert.equal(isValidHttpExternalUrlForMenu(value), false);
  assert.equal(isValidHttpExternalUrl(value), false);
  assert.equal(validateNavPayload({ items: [{ title: 'X', href: value, sort_order: 1, status: 'draft', target_type: 'external', target_page_id: null, title_override: null }] }, pages).ok, false);
}

assert.equal(validateNavPayload({ items: [{ title: 'Árak', href: '/arak/', sort_order: 1, status: 'published', target_type: 'page', target_page_id: 1, title_override: null }] }, pages).ok, true);
assert.equal(validateNavPayload({ items: [{ title: 'Egyedi', href: '/arak/', sort_order: 1, status: 'published', target_type: 'page', target_page_id: 1, title_override: 'Egyedi' }] }, pages).ok, true);
assert.equal(validateNavPayload({ items: [{ title: 'Árak', href: '/rossz/', sort_order: 1, status: 'published', target_type: 'page', target_page_id: 1, title_override: null }] }, pages).ok, false);
assert.equal(validateNavPayload({ items: [{ title: 'Régi', href: '/kezi?x=1', sort_order: 3, status: 'archived' }] }, pages).ok, true);
assert.equal(validateNavPayload({ items: [{ title: 'A', href: '/dupe/', sort_order: 1, status: 'draft' }, { title: 'B', href: '/dupe/', sort_order: 2, status: 'draft' }] }, pages).error.code, 'DUPLICATE_NAVIGATION_HREF');
for (const sort_order of [0, -1, 1.5, 'abc', '', Number.MAX_SAFE_INTEGER + 1]) {
  assert.equal(validateNavPayload({ items: [{ title: 'Bad sort', href: `https://example.com/sort-${String(sort_order).replace(/\W/g, '-')}`, sort_order, status: 'draft', target_type: 'external', target_page_id: null, title_override: null }] }, pages).error.code, 'INVALID_NAVIGATION_SORT_ORDER');
}

let nextId = 20;
const state = { nav: [] };
const pool = {
  commits: 0,
  rollbacks: 0,
  async beginTransaction() { this.snapshot = structuredClone(state.nav); },
  async commit() { this.commits += 1; this.snapshot = null; },
  async rollback() { this.rollbacks += 1; if (this.snapshot) state.nav = structuredClone(this.snapshot); this.snapshot = null; },
  release() {},
  async getConnection() { return this; },
  async query(sql, params) {
    if (sql.includes('site_navigation_items WHERE id=')) return [[state.nav.find((n) => Number(n.id) === Number(params[0]))].filter(Boolean)];
    if (sql.includes('site_pages WHERE id=')) return [[pages.find((p) => Number(p.id) === Number(params[0]))].filter(Boolean)];
    if (sql.includes('site_navigation_items WHERE href=? AND id<>?')) return [[state.nav.find((n) => n.href.toLowerCase() === String(params[0]).toLowerCase() && Number(n.id) !== Number(params[1]))].filter(Boolean)];
    if (sql.includes('site_navigation_items WHERE href=?')) return [[state.nav.find((n) => n.href.toLowerCase() === String(params[0]).toLowerCase())].filter(Boolean)];
    return [[]];
  },
  async execute(sql, params) {
    if (sql.startsWith('INSERT INTO site_navigation_items')) {
      if (state.nav.some((n) => n.href.toLowerCase() === String(params[1]).toLowerCase())) { const error = new Error('Duplicate entry'); error.code = 'ER_DUP_ENTRY'; throw error; }
      const id = nextId++;
      state.nav.push({ id, title: params[0], href: params[1], target_type: params[2], target_page_id: params[3], title_override: params[4], sort_order: params[5], status: params[6] });
      return [{ insertId: id, affectedRows: 1 }];
    }
    if (sql.startsWith('UPDATE site_navigation_items')) {
      const id = params.at(-1);
      const row = state.nav.find((n) => Number(n.id) === Number(id));
      Object.assign(row, { title: params[0], href: params[1], sort_order: params[2], status: params[3], target_type: params[4], target_page_id: params[5], title_override: params[6] });
      return [{ affectedRows: 1 }];
    }
    return [{ affectedRows: 0 }];
  },
};
const repo = createAdminRepository(pool);
let ids = await repo.updateNav([{ id: '', title: 'Új', href: 'https://example.com/new', sort_order: 1, status: 'draft', target_type: 'external', target_page_id: null, title_override: null }]);
assert.deepEqual(ids, [20]);
assert.equal(state.nav.length, 1);
ids = await repo.updateNav([{ id: '20', title: 'Új 2', href: 'https://example.com/new-2', sort_order: 2, status: 'published', target_type: 'external', target_page_id: null, title_override: null }]);
assert.deepEqual(ids, [20]);
assert.equal(state.nav.length, 1);
assert.equal(state.nav[0].title, 'Új 2');
await assert.rejects(() => repo.updateNav([{ title: 'A', href: 'https://example.com/a', sort_order: 1, status: 'draft', target_type: 'external' }, { title: 'B', href: 'https://example.com/a', sort_order: 2, status: 'draft', target_type: 'external' }]), /Duplikált/);
await assert.rejects(() => repo.updateNav([{ title: 'Más', href: 'https://example.com/new-2', sort_order: 3, status: 'draft', target_type: 'external' }]), /Duplikált/);
await assert.rejects(() => repo.updateNav([{ title: 'Bad sort', href: 'https://example.com/repo-bad-sort', sort_order: '1.5', status: 'draft', target_type: 'external' }]), /sorrend/);

const beforeRollbackTitle = state.nav[0].title;
await assert.rejects(() => repo.updateNav([
  { id: '20', title: 'Rollback candidate', href: 'https://example.com/new-2', sort_order: 2, status: 'published', target_type: 'external', target_page_id: null, title_override: null },
  { id: '999', title: 'Missing', href: 'https://example.com/missing', sort_order: 3, status: 'draft', target_type: 'external', target_page_id: null, title_override: null },
]), /Navigation item not found/);
assert.equal(state.nav[0].title, beforeRollbackTitle);
const beforeCaseInsertCount = state.nav.length;
await assert.rejects(() => repo.updateNav([
  { title: 'Case A', href: 'https://example.com/CaseOnly', sort_order: 4, status: 'draft', target_type: 'external', target_page_id: null, title_override: null },
  { title: 'Case B', href: 'https://example.com/caseonly', sort_order: 5, status: 'draft', target_type: 'external', target_page_id: null, title_override: null },
]), /Duplicate entry/);
assert.equal(state.nav.length, beforeCaseInsertCount);
assert.equal(pool.commits, 2);


let publishCalls = 0;
const httpRepo = {
  async pages() { return pages; },
  async nav() { return []; },
  async updateNav(items) {
    if (items[0]?.title === 'Repo invalid') {
      const error = new Error('Repository validation failed');
      error.code = 'VALIDATION_ERROR';
      error.status = 400;
      throw error;
    }
    if (items[0]?.title === 'DB duplicate') {
      const error = new Error('Duplicate entry');
      error.code = 'ER_DUP_ENTRY';
      throw error;
    }
    return [101];
  },
};
const env = { SITE_ADMIN_SESSION_SECRET: 'menu-a2b-secret' };
const server = createAdminServer({ repo: httpRepo, env, publishService: { publish: async () => { publishCalls += 1; return { ok: true }; } } });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const cookie = `easylink_site_admin=${encodeURIComponent(signSession({ id: 1, email: 'a@b.test', role: 'admin' }, env))}`;
try {
  let response = await fetch(`${base}/api/admin/navigation`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ items: [{ title: 'Repo invalid', href: 'https://example.com/repo-invalid', sort_order: 1, status: 'draft', target_type: 'external', target_page_id: null, title_override: null }] }) });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'INVALID_NAVIGATION_ITEM');
  response = await fetch(`${base}/api/admin/navigation`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ items: [{ title: 'DB duplicate', href: 'https://example.com/db-dupe', sort_order: 1, status: 'draft', target_type: 'external', target_page_id: null, title_override: null }] }) });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'DUPLICATE_NAVIGATION_HREF');
  response = await fetch(`${base}/api/admin/navigation`, { method: 'PUT', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ items: [{ title: 'Bad sort', href: 'https://example.com/bad-sort', sort_order: 0, status: 'draft', target_type: 'external', target_page_id: null, title_override: null }] }) });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'INVALID_NAVIGATION_SORT_ORDER');
  assert.equal(publishCalls, 0);
} finally {
  server.close();
}

const header = await readFile('src/components/Header.astro', 'utf8');
assert.match(header, /listNavigation/);
console.log('PR-A2b menu admin smoke passed.');
