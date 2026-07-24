import assert from 'node:assert/strict';
import vm from 'node:vm';
import { dirtyStateJs, publishMessageJs } from '../src/lib/admin/render/client-js.mjs';

function fakeNode(tag = 'div') {
  const node = {
    tagName: String(tag).toUpperCase(),
    children: [],
    attributes: {},
    dataset: {},
    style: {},
    id: '',
    className: '',
    parentNode: null,
    _text: '',
    setAttribute(name, value = '') {
      this.attributes[name] = String(value);
      if (name === 'data-dirty-message') this.dataset.dirtyMessage = '';
    },
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    querySelector(selector) {
      if (selector === 'p') return this.children.find((child) => child.tagName === 'P') || null;
      if (selector === '[data-dirty-message]') return this.children.find((child) => 'dirtyMessage' in child.dataset) || null;
      return null;
    },
    remove() {
      if (!this.parentNode) return;
      this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
      this.parentNode = null;
    },
  };
  Object.defineProperty(node, 'textContent', {
    get() { return this.children.length ? this.children.map((child) => child.textContent).join('') : this._text; },
    set(value) { this._text = String(value); this.children = []; },
  });
  return node;
}

let serialized = 'title=Megoldás lista';
const listeners = {};
const saveButton = { disabled: false };
const form = {
  matches(selector) { return selector === '[data-block-form]'; },
  querySelector(selector) {
    if (selector === 'button[type="submit"]') return saveButton;
    return null;
  },
  addEventListener(type, listener) { listeners[type] = listener; },
  prepend() { throw new Error('Fixed status must be attached to document.body'); },
};
const body = fakeNode('body');
const globalStatus = fakeNode('div');
const sandbox = {
  window: {},
  document: {
    body,
    getElementById(id) {
      if (id === 'msg') return globalStatus;
      return body.children.find((child) => child.id === id) || null;
    },
    createElement(tag) { return fakeNode(tag); },
  },
  URLSearchParams,
  FormData: class {},
  Set,
};

vm.runInNewContext(`${dirtyStateJs};${publishMessageJs};this.runSetup=setupDirtyForm;this.runMsg=msg;`, sandbox);
const dirty = sandbox.runSetup(form, () => serialized);
const status = body.children.find((child) => child.id === 'block-save-status');

assert.ok(status, 'A blokk státuszdoboznak a document.body alatt kell létrejönnie.');
assert.equal(status.style.position, 'fixed');
assert.equal(status.style.right, '24px');
assert.equal(status.style.bottom, '24px');
assert.equal(status.style.zIndex, '120');
assert.equal(status.style.maxWidth, 'calc(100vw - 48px)');
assert.equal(status.style.pointerEvents, 'none');
assert.equal(saveButton.disabled, true);

serialized = 'title=Listák';
listeners.input();
assert.equal(status.textContent, 'Nem mentett módosítások.');
assert.match(status.querySelector('p').className, /err/);

dirty.markSaving();
assert.equal(status.textContent, 'Mentés folyamatban…');

dirty.markSaved();
assert.equal(status.textContent, 'Mentés sikeres.');
assert.match(status.querySelector('p').className, /ok/);

sandbox.runMsg('Tartalom mentve, élesítés sikeres.', true);
assert.equal(status.textContent, 'Tartalom mentve, élesítés sikeres.');
assert.equal(globalStatus.textContent, '');

const secondForm = {
  ...form,
  addEventListener() {},
};
sandbox.runSetup(secondForm, () => 'unchanged');
assert.equal(body.children.filter((child) => child.id === 'block-save-status').length, 1);

console.log('Admin block save status fixed viewport smoke passed.');
