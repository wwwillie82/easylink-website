import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeVideoConfig, parseYouTubeUrl } from '../src/lib/content/video.mjs';
import { initializeVideoMediaRoot } from '../src/lib/content/video-client.mjs';

for (const url of [
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://youtu.be/dQw4w9WgXcQ',
  'https://www.youtube.com/embed/dQw4w9WgXcQ',
  'https://www.youtube.com/shorts/dQw4w9WgXcQ',
  'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
]) assert.equal(parseYouTubeUrl(url).id, 'dQw4w9WgXcQ');

for (const url of [
  'https://www.youtube.com/nem-video-utvonal?v=dQw4w9WgXcQ',
  'https://www.youtube.com/watch/extra?v=dQw4w9WgXcQ',
  'https://youtu.be/dQw4w9WgXcQ/extra',
  'https://www.youtube-nocookie.com/watch?v=dQw4w9WgXcQ',
]) assert.throws(() => parseYouTubeUrl(url), /Nem támogatott YouTube link formátum/);

const heroManual = normalizeVideoConfig({
  sourceType: 'youtube',
  youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
  autoplay: false,
  controls: false,
}, { context: 'hero' });
assert.equal(heroManual.autoplay, false);
assert.equal(heroManual.controls, true);

class FakeClassList {
  constructor(values = []) { this.values = new Set(values); }
  contains(name) { return this.values.has(name); }
  toggle(name, force) { force ? this.values.add(name) : this.values.delete(name); }
}
class FakeIframe {
  constructor() {
    this.dataset = {
      manualSrc: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=0&controls=1',
      autoplaySrc: '',
      youtubeFrame: 'true',
    };
    this.attrs = { src: this.dataset.manualSrc };
    this.listeners = {};
    this.style = {};
  }
  addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
  getAttribute(name) { return this.attrs[name] || ''; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
}
class FakeRoot {
  constructor() {
    this.dataset = { autoplay: 'false', videoObjectFit: 'contain' };
    this.classList = new FakeClassList(['video-media--inline', 'is-interactive']);
    this.clientWidth = 400;
    this.clientHeight = 800;
    this.iframe = new FakeIframe();
  }
  querySelector(selector) { return selector.startsWith('iframe') ? this.iframe : null; }
  getBoundingClientRect() { return { width: this.clientWidth, height: this.clientHeight }; }
}

const observed = [];
class FakeResizeObserver {
  constructor(callback) { this.callback = callback; }
  observe(root) { observed.push(root); }
}
const root = new FakeRoot();
const result = initializeVideoMediaRoot(root, {
  window: {
    matchMedia: () => ({ matches: false }),
    ResizeObserver: FakeResizeObserver,
  },
});
assert.equal(result.initialized, true);
assert.equal(observed[0], root);
assert.equal(root.iframe.style.width, '400px');
assert.equal(root.iframe.style.height, '225px');
root.clientWidth = 1600;
root.clientHeight = 400;
result.observer.callback();
assert.equal(root.iframe.style.width, `${400 * 16 / 9}px`);
assert.equal(root.iframe.style.height, '400px');
assert.equal(initializeVideoMediaRoot(root, { window: { ResizeObserver: FakeResizeObserver } }).initialized, false);

const resizeListeners = [];
const fallbackRoot = new FakeRoot();
const fallback = initializeVideoMediaRoot(fallbackRoot, {
  window: {
    matchMedia: () => ({ matches: false }),
    addEventListener: (type, callback) => resizeListeners.push([type, callback]),
  },
});
assert.equal(fallback.observer, null);
assert.equal(resizeListeners[0][0], 'resize');
fallbackRoot.clientWidth = 800;
fallbackRoot.clientHeight = 450;
resizeListeners[0][1]();
assert.equal(fallbackRoot.iframe.style.width, '800px');
assert.equal(fallbackRoot.iframe.style.height, '450px');


class FakeVideo {
  constructor() {
    this.listeners = {};
    this.playCount = 0;
    this.autoplay = false;
    this.muted = false;
  }
  addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
  play() { this.playCount += 1; return { catch: () => {} }; }
}
class FakeVideoRoot {
  constructor({ autoplay = true, decorative = false } = {}) {
    this.dataset = { autoplay: autoplay ? 'true' : 'false' };
    this.classList = new FakeClassList(decorative ? ['video-media--background', 'is-decorative'] : ['video-media--background', 'is-interactive']);
    this.video = new FakeVideo();
  }
  querySelector(selector) {
    if (selector === 'video') return this.video;
    if (selector.startsWith('iframe')) return null;
    return null;
  }
}
const videoMotionOk = new FakeVideoRoot({ autoplay: true });
const videoMotionOkResult = initializeVideoMediaRoot(videoMotionOk, { window: { matchMedia: () => ({ matches: false }) } });
assert.equal(videoMotionOkResult.canAutoplay, true);
assert.equal(videoMotionOk.video.playCount, 1);
assert.equal(videoMotionOk.video.muted, true);
assert.equal(videoMotionOk.video.autoplay, true);

const videoReduced = new FakeVideoRoot({ autoplay: true });
const videoReducedResult = initializeVideoMediaRoot(videoReduced, { window: { matchMedia: () => ({ matches: true }) } });
assert.equal(videoReducedResult.canAutoplay, false);
assert.equal(videoReduced.video.playCount, 0);
assert.equal(videoReduced.video.autoplay, false);

const videoManual = new FakeVideoRoot({ autoplay: false });
const videoManualResult = initializeVideoMediaRoot(videoManual, { window: { matchMedia: () => ({ matches: false }) } });
assert.equal(videoManualResult.canAutoplay, false);
assert.equal(videoManual.video.playCount, 0);
assert.equal(videoManual.classList.contains('is-media-loaded'), true);

const componentSource = await readFile('src/components/VideoMedia.astro', 'utf8');
assert.match(componentSource, /\.video-media iframe\.video-media__element\{left:50%;top:50%;transform:translate\(-50%,-50%\)\}/);
assert.doesNotMatch(componentSource, /\.video-media--background iframe\.video-media__element/);
assert.match(componentSource, /const videoAutoplay = config\?\.sourceType === 'media' && config\.autoplay && !isBg;/);
assert.match(componentSource, /\.video-media--background\{[^}]*z-index:0;pointer-events:auto/);
assert.doesNotMatch(componentSource, /\.video-media--background\.is-interactive \.video-media__element\{[^}]*z-index/);
assert.match(componentSource, /\.video-media__element\{[^}]*z-index:1/);
assert.match(componentSource, /\.video-media__poster\{[^}]*z-index:2[^}]*pointer-events:none/);
const heroSource = await readFile('src/components/PageHero.astro', 'utf8');
assert.match(heroSource, /\.page-hero-overlay \{[^}]*z-index: 0;[^}]*pointer-events: none;/);
assert.match(heroSource, /\.has-hero-video \.video-media \{ z-index: 0; \}/);
assert.doesNotMatch(heroSource, /\.has-hero-video \.video-media--background\.is-decorative \{ z-index: 0; \}/);
assert.match(heroSource, /\.page-hero-grid \{[^}]*z-index: 1;/);
const layoutSource = await readFile('src/lib/admin/render/layout.mjs', 'utf8');
assert.match(layoutSource, /videoDraftGuardJs/);
assert.match(layoutSource, /kész média választható/i);

console.log('Video final smoke passed: strict YouTube URLs, usable hero controls, inline resize and centering.');
