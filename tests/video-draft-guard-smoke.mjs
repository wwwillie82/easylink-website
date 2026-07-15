import assert from 'node:assert/strict';
import {
  installVideoDraftGuard,
  readVideoDraft,
  restoreVideoDraft,
  videoDraftGuardJs,
} from '../src/lib/admin/render/video-draft.mjs';

class FakeEvent {
  constructor(type, options = {}) { this.type = type; this.bubbles = !!options.bubbles; }
}

class FakeControl {
  constructor(selector, { value = '', checked = false } = {}) {
    this.selector = selector;
    this.value = value;
    this.checked = checked;
    this.events = [];
    this.form = null;
  }
  matches(selector) { return this.selector === selector; }
  closest(selector) { return selector === '[data-block-form]' ? this.form : null; }
  dispatchEvent(event) { this.events.push(event); return true; }
}

class FakeForm {
  constructor() {
    this.dataset = { initialBlockType: 'video', currentBlockType: 'video', itemsTouched: 'true' };
    this.controls = new Map();
  }
  add(selector, values = {}) {
    const control = new FakeControl(selector, values);
    control.form = this;
    this.controls.set(selector, control);
    return control;
  }
  querySelector(selector) { return this.controls.get(selector) || null; }
}

const form = new FakeForm();
const type = form.add('[data-block-type]', { value: 'video' });
const source = form.add('[data-video-source]', { value: 'youtube' });
form.add('[data-video-media-path]', { value: '' });
form.add('[data-video-youtube-url]', { value: 'https://youtu.be/dQw4w9WgXcQ' });
form.add('[data-video-poster]', { value: '/assets/site-media/2026/07/poster.webp' });
form.add('[data-video-autoplay]', { checked: true });
form.add('[data-video-muted]', { checked: true });
form.add('[data-video-loop]', { checked: true });
form.add('[data-video-controls]', { checked: false });
form.add('[data-video-preload]', { value: 'auto' });
form.add('[data-video-object-fit]', { value: 'contain' });
form.add('[data-video-aspect-ratio]', { value: '9/16' });
const items = form.add('input[name="items"]', { value: '[]' });

const expectedDraft = {
  sourceType: 'youtube',
  autoplay: true,
  muted: true,
  loop: true,
  controls: false,
  preload: 'auto',
  objectFit: 'contain',
  aspectRatio: '9/16',
  poster: '/assets/site-media/2026/07/poster.webp',
  youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
};
assert.deepEqual(readVideoDraft(form), expectedDraft);

const queued = [];
const doc = {
  handler: null,
  capture: null,
  addEventListener(eventName, handler, capture) {
    assert.equal(eventName, 'change');
    this.handler = handler;
    this.capture = capture;
  },
};
assert.equal(installVideoDraftGuard(doc, { EventCtor: FakeEvent, queue: (callback) => queued.push(callback) }), true);
assert.equal(installVideoDraftGuard(doc, { EventCtor: FakeEvent, queue: (callback) => queued.push(callback) }), false);
assert.equal(doc.capture, true);

// Capture runs before the existing pageEditorJs bubble listener clears text-block items.
type.value = 'text';
doc.handler({ target: type });
assert.deepEqual(JSON.parse(form.dataset.videoDraft), expectedDraft);

// Simulate the existing runtime after switching away from video.
form.dataset.currentBlockType = 'text';
items.value = '[]';
source.value = 'media';
form.querySelector('[data-video-youtube-url]').value = '';
form.querySelector('[data-video-poster]').value = '';
form.querySelector('[data-video-autoplay]').checked = false;
form.querySelector('[data-video-muted]').checked = false;
form.querySelector('[data-video-loop]').checked = false;
form.querySelector('[data-video-controls]').checked = true;
form.querySelector('[data-video-preload]').value = 'metadata';
form.querySelector('[data-video-object-fit]').value = 'cover';
form.querySelector('[data-video-aspect-ratio]').value = '16/9';

// Capture schedules restoration after the existing type-change listener has hydrated defaults.
type.value = 'video';
doc.handler({ target: type });
assert.equal(queued.length, 1);
items.value = JSON.stringify([{ sourceType: 'media', mediaPath: '', controls: true }]);
queued.shift()();

assert.equal(source.value, 'youtube');
assert.equal(form.querySelector('[data-video-youtube-url]').value, expectedDraft.youtubeUrl);
assert.equal(form.querySelector('[data-video-poster]').value, expectedDraft.poster);
assert.equal(form.querySelector('[data-video-autoplay]').checked, true);
assert.equal(form.querySelector('[data-video-muted]').checked, true);
assert.equal(form.querySelector('[data-video-loop]').checked, true);
assert.equal(form.querySelector('[data-video-controls]').checked, false);
assert.equal(form.querySelector('[data-video-preload]').value, 'auto');
assert.equal(form.querySelector('[data-video-object-fit]').value, 'contain');
assert.equal(form.querySelector('[data-video-aspect-ratio]').value, '9/16');
assert.deepEqual(JSON.parse(items.value), [expectedDraft]);
assert.deepEqual(source.events.map((event) => [event.type, event.bubbles]), [['change', true]]);

const mediaDraft = { sourceType: 'media', mediaPath: '/assets/site-media/2026/07/demo.mp4', autoplay: false, muted: false, loop: false, controls: true, preload: 'metadata', objectFit: 'cover', aspectRatio: '16/9' };
assert.equal(restoreVideoDraft(form, mediaDraft, FakeEvent), true);
assert.equal(source.value, 'media');
assert.deepEqual(JSON.parse(items.value), [mediaDraft]);
assert.match(videoDraftGuardJs(), /installVideoDraftGuard\(document/);

console.log('Video draft guard smoke passed: capture-before-runtime preservation and deferred restoration.');
