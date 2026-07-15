import assert from 'node:assert/strict';
import {
  ensureVideoPanel,
  hydrateVideoPanel,
  readVideoEditorValues,
  serializeVideoEditorValues,
  setVideoEditorVisible,
  syncVideoSource,
  writeVideoItemsInput,
} from '../src/lib/admin/render/blocks.mjs';

class FakeClassList {
  constructor(values = []) { this.values = new Set(values); }
  toggle(name, force) { force ? this.values.add(name) : this.values.delete(name); }
  contains(name) { return this.values.has(name); }
}
class FakeEl {
  constructor({ selector = '', dataset = {}, value = '', checked = false, name = '', type = 'input' } = {}) {
    this.selector = selector;
    this.dataset = { ...dataset };
    this.value = value;
    this.checked = checked;
    this.name = name;
    this.type = type;
    this.hidden = false;
    this.disabled = false;
    this.attrs = new Set();
    this.classList = new FakeClassList();
    this.children = [];
    this.listeners = {};
  }
  setAttribute(name) { this.attrs.add(name); }
  removeAttribute(name) { this.attrs.delete(name); }
  hasAttribute(name) { return this.attrs.has(name); }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  dispatchEvent(event) { for (const fn of this.listeners[event.type] || []) fn(event); }
  querySelectorAll(selector) { return this.children.filter((child) => child.matches(selector)); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  matches(selector) { return this.selector === selector || (selector === 'input,textarea,select,button' && ['input','select','button','textarea'].includes(this.type)); }
}
class FakeForm extends FakeEl {
  constructor() {
    super({ selector: 'form', type: 'form' });
    this.dataset = { initialBlockType: 'text', itemsTouched: 'false' };
    this.elements = [];
    this.videoPanels = [];
    this.typeSelect = new FakeEl({ selector: '[data-block-type]', value: 'text', name: 'type', type: 'select' });
    this.itemsInput = new FakeEl({ selector: 'input[name="items"]', value: '[]', name: 'items' });
    this.itemsInput.insertAdjacentHTML = () => this.addVideoPanel();
    this.elements.push(this.typeSelect, this.itemsInput);
  }
  addVideoPanel() {
    if (this.videoPanel) return;
    const panel = new FakeEl({ selector: '[data-panel="video"]', dataset: { panel: 'video' }, type: 'section' });
    panel.hidden = true;
    panel.setAttribute('inert');
    const add = (el, parent = panel) => { parent.children.push(el); this.elements.push(el); return el; };
    const mediaLabel = add(new FakeEl({ selector: '[data-video-media]', dataset: { videoMedia: '' }, type: 'label' }));
    const mediaInput = add(new FakeEl({ selector: '[data-video-media-path]', value: '/assets/site-media/2026/07/ready.mp4' }), mediaLabel);
    const mediaButton = add(new FakeEl({ selector: '[data-video-media]', dataset: { videoMedia: '' }, type: 'button' }));
    const youtubeLabel = add(new FakeEl({ selector: '[data-video-youtube]', dataset: { videoYoutube: '' }, type: 'label' }));
    const youtubeInput = add(new FakeEl({ selector: '[data-video-youtube-url]', value: 'https://youtu.be/dQw4w9WgXcQ' }), youtubeLabel);
    const controls = add(new FakeEl({ selector: '[data-video-controls]', checked: true }));
    add(new FakeEl({ selector: '[data-video-source]', value: 'media', type: 'select' }));
    add(mediaInput);
    add(mediaButton);
    add(youtubeInput);
    add(new FakeEl({ selector: '[data-video-poster]', value: '' }));
    add(new FakeEl({ selector: '[data-video-autoplay]', checked: false }));
    add(new FakeEl({ selector: '[data-video-muted]', checked: false }));
    add(new FakeEl({ selector: '[data-video-loop]', checked: false }));
    add(controls);
    add(new FakeEl({ selector: '[data-video-preload]', value: 'metadata', type: 'select' }));
    add(new FakeEl({ selector: '[data-video-object-fit]', value: 'cover', type: 'select' }));
    add(new FakeEl({ selector: '[data-video-aspect-ratio]', value: '16/9', type: 'select' }));
    this.videoPanel = panel;
    this.videoPanels.push(panel);
    this.elements.push(panel);
  }
  querySelector(selector) { return this.elements.find((el) => el.matches(selector)) || null; }
  querySelectorAll(selector) { return this.elements.filter((el) => el.matches(selector)); }
}
function activateType(form, type) {
  form.typeSelect.value = type;
  form.dataset.itemsTouched = 'true';
  const panel = ensureVideoPanel(form, form.itemsInput);
  setVideoEditorVisible(panel, type === 'video');
  if (type === 'video') hydrateVideoPanel(form, {}, setVideoEditorVisible);
  if (type === 'video') writeVideoItemsInput(form);
}
function changeSource(form, source) {
  form.querySelector('[data-video-source]').value = source;
  syncVideoSource(form, setVideoEditorVisible);
  form.dataset.itemsTouched = 'true';
  writeVideoItemsInput(form);
}

const form = new FakeForm();
assert.equal(form.videoPanels.length, 0);
activateType(form, 'video');
assert.equal(form.videoPanels.length, 1);
const firstPanel = form.videoPanel;
assert.equal(firstPanel.hidden, false);
assert.equal(firstPanel.hasAttribute('inert'), false);
assert.equal(form.querySelector('[data-video-source]').value, 'media');
assert.equal(form.querySelector('[data-video-youtube]').hidden, true);
assert.equal(form.querySelector('[data-video-youtube-url]').disabled, true);
assert.equal(form.querySelector('[data-video-controls]').checked, true);
assert.equal(form.querySelector('[data-video-preload]').value, 'metadata');
assert.equal(form.querySelector('[data-video-object-fit]').value, 'cover');
assert.equal(form.querySelector('[data-video-aspect-ratio]').value, '16/9');

activateType(form, 'text');
assert.equal(form.videoPanels.length, 1);
assert.equal(firstPanel.hidden, true);
assert.equal(firstPanel.hasAttribute('inert'), true);
for (const el of firstPanel.querySelectorAll('input,textarea,select,button')) assert.equal(el.disabled, true);
activateType(form, 'video');
assert.equal(form.videoPanels.length, 1);
assert.equal(form.videoPanel, firstPanel);
assert.equal(firstPanel.hidden, false);

form.querySelector('[data-video-youtube-url]').value = 'https://youtu.be/dQw4w9WgXcQ';
changeSource(form, 'youtube');
assert.equal(form.querySelector('[data-video-media]').hidden, true);
assert.equal(form.querySelector('[data-video-media-path]').disabled, true);
assert.equal(form.querySelector('[data-video-youtube]').hidden, false);
assert.equal(form.querySelector('[data-video-youtube-url]').disabled, false);
let items = JSON.parse(form.itemsInput.value);
assert.equal(items.length, 1);
assert.equal(items[0].sourceType, 'youtube');
assert.equal(items[0].youtubeUrl, 'https://youtu.be/dQw4w9WgXcQ');
assert.equal('mediaPath' in items[0], false);

form.querySelector('[data-video-media-path]').value = '/assets/site-media/2026/07/ready.mp4';
changeSource(form, 'media');
assert.equal(form.querySelector('[data-video-youtube]').hidden, true);
assert.equal(form.querySelector('[data-video-youtube-url]').disabled, true);
assert.equal(form.querySelector('[data-video-media]').hidden, false);
assert.equal(form.querySelector('[data-video-media-path]').disabled, false);
items = JSON.parse(form.itemsInput.value);
assert.equal(items[0].sourceType, 'media');
assert.equal(items[0].mediaPath, '/assets/site-media/2026/07/ready.mp4');
assert.equal('youtubeUrl' in items[0], false);
assert.equal(form.dataset.itemsTouched, 'true');
assert.equal(typeof items[0].autoplay, 'boolean');
assert.equal(typeof items[0].controls, 'boolean');
assert.equal('poster' in items[0], false);
assert.deepEqual(serializeVideoEditorValues(readVideoEditorValues(form)), items[0]);

const payload = new URLSearchParams([['type', form.typeSelect.value], ['items', form.itemsInput.value]]);
assert.equal(payload.get('type'), 'video');
assert.doesNotThrow(() => JSON.parse(payload.get('items')));
assert.equal(JSON.parse(payload.get('items')).length, 1);

console.log('Video admin runtime smoke passed: text/video switching, source switching, visibility, dirty state and payload.');
