import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { serializeEditorItems, sortOrderForMovedBlock, movedBlockOrder, blockForm, pageEditorJs } from '../src/lib/admin/render/blocks.mjs';
import { mediaMatchesKind } from '../src/lib/admin/render/media.mjs';
import { createAdminRepository } from '../src/lib/admin/repository.mjs';
import { buildYouTubeEmbedUrl, normalizeVideoConfig, parseYouTubeUrl } from '../src/lib/content/video.mjs';

const featureObject = serializeEditorItems({ type: 'feature-list', rows: [{ raw: { title: 'Elem', url: '/pelda/', customMeta: 'maradjon' }, title: 'Elem 2' }] });
assert.deepEqual(featureObject, [{ title: 'Elem 2', url: '/pelda/', customMeta: 'maradjon' }]);
assert.deepEqual(serializeEditorItems({ type: 'feature-list', rows: [{ raw: {}, title: 'Első szerk' }] }), ['Első szerk']);
const cardContract = serializeEditorItems({ type: 'cards', rows: [{ raw: { title: 'Kártya', href: '/cel/', badge: 'A', customMeta: 42 }, title: 'Kártya 2', text: '', url: '/cel-2/', linkLabel: '', order: 'B' }] })[0];
assert.equal(cardContract.version, 2);
const card = cardContract.cards[0];
assert.equal(card.href, '/cel-2/');
assert.equal(card.badge, 'B');
assert.ok(!('url' in card));
const numericOrder = serializeEditorItems({ type: 'cards', rows: [{ raw: { title: 'K', url: '/c/', order: 7 }, title: 'K', text: '', url: '/c/', linkLabel: '', order: '' }] })[0].cards[0];
assert.equal(numericOrder.badge, 7);
const faq = serializeEditorItems({ type: 'faq', rows: [{ raw: { question: 'Kérdés', answer: 'Válasz', schemaId: 'faq-1' }, title: 'Kérdés 2', text: 'Válasz 2' }] })[0];
assert.deepEqual(faq, { question: 'Kérdés 2', answer: 'Válasz 2', schemaId: 'faq-1' });
assert.deepEqual(serializeEditorItems({ type: 'raw', rawItemsText: '[{"x":1}]' }), [{ x: 1 }]);
assert.throws(() => serializeEditorItems({ type: 'raw', rawItemsText: '{bad}' }));
const videoMedia = serializeEditorItems({ type: 'video', rows: { sourceType: 'media', mediaPath: '/assets/site-media/2026/07/demo.mp4', youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ', poster: '', autoplay: false, muted: false, loop: true, controls: true, preload: 'metadata', objectFit: 'cover', aspectRatio: '16/9' } })[0];
assert.equal(videoMedia.mediaPath, '/assets/site-media/2026/07/demo.mp4');
assert.equal(videoMedia.youtubeUrl, undefined);
assert.equal(videoMedia.poster, undefined);
assert.equal(typeof videoMedia.controls, 'boolean');
assert.equal(videoMedia.controls, true);
const videoYoutube = serializeEditorItems({ type: 'video', rows: { sourceType: 'youtube', mediaPath: '/assets/site-media/2026/07/demo.mp4', youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ', poster: '/assets/site-media/2026/07/poster.webp', autoplay: true, muted: false, loop: false, controls: false, preload: 'none', objectFit: 'contain', aspectRatio: '9/16' } })[0];
assert.equal(videoYoutube.mediaPath, undefined);
assert.equal(videoYoutube.youtubeUrl, 'https://youtu.be/dQw4w9WgXcQ');
assert.equal(videoYoutube.poster, '/assets/site-media/2026/07/poster.webp');
assert.equal(sortOrderForMovedBlock([{ sortOrder: 10 }, { sortOrder: 30 }, { sortOrder: 50 }], 1), 30);
assert.equal(movedBlockOrder([{ node: 'a', sortOrder: 10 }, { node: 'b', sortOrder: 30 }, { node: 'c', sortOrder: 50 }], 1, 'up').sortOrder, 0);
assert.throws(() => movedBlockOrder([{ fixed: true, sortOrder: 10 }, { sortOrder: 20 }], 0, 'down'), /Nincs elegendő/);
assert.throws(() => movedBlockOrder([{ sortOrder: 10 }, { fixed: true, sortOrder: 20 }], 0, 'down'), /Nincs elegendő/);
assert.match(blockForm({ page_id: 1, type: 'text', title: '', body: '', items: '[]', status: 'published', sort_order: 1 }), /value="video"/);
const editorJs = pageEditorJs(1);
assert.match(editorJs, /key==='video'/);
assert.match(editorJs, /hydrateVideoPanel/);

const media = [
  { path: '/assets/site-media/ready.mp4', type: 'video/mp4', processing_status: 'ready', status: 'active' },
  { path: '/assets/site-media/queued.mp4', type: 'video/mp4', processing_status: 'queued', status: 'active' },
  { path: '/assets/site-media/failed.mp4', type: 'video/mp4', processing_status: 'failed', status: 'active' },
  { path: '/assets/site-media/image.webp', type: 'image/webp', processing_status: 'ready', status: 'active' },
  { path: '/assets/site-media/archived.mp4', type: 'video/mp4', processing_status: 'ready', status: 'archived' },
];
assert.deepEqual(media.filter((m) => mediaMatchesKind(m, 'video')).map((m) => m.path), ['/assets/site-media/ready.mp4']);
assert.deepEqual(media.filter((m) => mediaMatchesKind(m, 'image')).map((m) => m.path), ['/assets/site-media/image.webp']);
assert.deepEqual(media.filter((m) => mediaMatchesKind(m, 'any')).map((m) => m.path), ['/assets/site-media/ready.mp4', '/assets/site-media/image.webp']);

assert.equal(parseYouTubeUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ').id, 'dQw4w9WgXcQ');
const ytEmbed = buildYouTubeEmbedUrl({ youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ', autoplay: true, muted: true, loop: true, controls: false });
assert.match(ytEmbed, /youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?.*playlist=dQw4w9WgXcQ/);
assert.doesNotMatch(ytEmbed, /cc_load_policy=1/);
assert.match(ytEmbed, /[?&]cc_load_policy=0(?:&|$)/);
assert.equal(normalizeVideoConfig({ sourceType: 'youtube', youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ', autoplay: true, muted: false }, { context: 'block' }).muted, false);
assert.equal(normalizeVideoConfig({ sourceType: 'media', mediaPath: '/assets/site-media/2026/07/demo.mp4', autoplay: false, controls: false }, { context: 'hero' }).controls, true);

function makePool() {
  const state = {
    pages: [{ id: 1, route: '/p/', slug: 'p', type: 'content_page', title: 'P', seo_title: 'P', seo_description: '', hero_eyebrow: '', hero_title: 'P', hero_description: '', hero_asset: '/assets/site-media/2026/07/poster.webp', hero_video: null, status: 'published', sort_order: 1 }],
    blocks: [],
    media: [
      { path: '/assets/site-media/2026/07/ready.mp4', type: 'video/mp4', status: 'active', processing_status: 'ready' },
      { path: '/assets/site-media/2026/07/queued.mp4', type: 'video/mp4', status: 'active', processing_status: 'queued' },
      { path: '/assets/site-media/2026/07/processing.mp4', type: 'video/mp4', status: 'active', processing_status: 'processing' },
      { path: '/assets/site-media/2026/07/failed.mp4', type: 'video/mp4', status: 'active', processing_status: 'failed' },
      { path: '/assets/site-media/2026/07/archived.mp4', type: 'video/mp4', status: 'archived', processing_status: 'ready' },
      { path: '/assets/site-media/2026/07/poster.webp', type: 'image/webp', status: 'active', processing_status: 'ready' },
      { path: '/assets/site-media/2026/07/image.webp', type: 'image/webp', status: 'active', processing_status: 'ready' },
    ],
  };
  return {
    state,
    async query(sql, params = []) {
      if (sql.includes('FROM site_media_assets WHERE path=')) return [state.media.filter((m) => m.path === params[0]), null];
      if (sql.includes('FROM site_pages WHERE id=')) return [state.pages.filter((p) => p.id === Number(params[0])), null];
      if (sql.includes('FROM site_content_blocks WHERE page_id=')) return [state.blocks.filter((b) => b.page_id === Number(params[0])), null];
      if (sql.includes('FROM site_pages WHERE route=? AND id<>?')) return [[], null];
      if (sql.includes('FROM site_pages WHERE route=? LIMIT')) return [state.pages.filter((p) => p.route === params[0]), null];
      if (sql.includes('ORDER BY id')) return [[], null];
      return [[], null];
    },
    async execute(sql, params = []) {
      if (sql.startsWith('INSERT INTO site_content_blocks')) { const row = { id: state.blocks.length + 1, page_id: params[0], block_key: params[1], type: params[2], title: params[3], body: params[4], items: params[5], sort_order: params[6], status: params[7] }; state.blocks.push(row); return [{ insertId: row.id, affectedRows: 1 }, null]; }
      if (sql.startsWith('UPDATE site_pages SET')) { state.pages[0].hero_video = params[10]; return [{ affectedRows: 1 }, null]; }
      return [{ affectedRows: 1, insertId: 2 }, null];
    },
    async getConnection() {
      return {
        query: (...args) => this.query(...args),
        execute: (...args) => this.execute(...args),
        beginTransaction: async () => {},
        commit: async () => {},
        rollback: async () => {},
        release: () => {},
      };
    },
  };
}
const pool = makePool();
const repo = createAdminRepository(pool);
await repo.upsertBlock({ page_id: 1, type: 'video', title: 'MP4', body: '', items: JSON.stringify([{ sourceType: 'media', mediaPath: '/assets/site-media/2026/07/ready.mp4', poster: '/assets/site-media/2026/07/poster.webp', controls: true }]), sort_order: 1, status: 'published' });
assert.equal(JSON.parse(pool.state.blocks[0].items)[0].mediaPath, '/assets/site-media/2026/07/ready.mp4');
for (const pth of ['queued.mp4','processing.mp4','failed.mp4','archived.mp4']) await assert.rejects(() => repo.upsertBlock({ page_id: 1, type: 'video', title: 'Bad', body: '', items: JSON.stringify([{ sourceType: 'media', mediaPath: `/assets/site-media/2026/07/${pth}`, controls: true }]), sort_order: 1, status: 'published' }));
await assert.rejects(() => repo.upsertBlock({ page_id: 1, type: 'video', title: 'Img', body: '', items: JSON.stringify([{ sourceType: 'media', mediaPath: '/assets/site-media/2026/07/image.webp', controls: true }]), sort_order: 1, status: 'published' }));
await assert.rejects(() => repo.upsertBlock({ page_id: 1, type: 'video', title: 'Missing', body: '', items: JSON.stringify([{ sourceType: 'media', mediaPath: '/assets/site-media/2026/07/missing.mp4', controls: true }]), sort_order: 1, status: 'published' }));
await assert.rejects(() => repo.upsertBlock({ page_id: 1, type: 'video', title: 'Host', body: '', items: JSON.stringify([{ sourceType: 'youtube', youtubeUrl: 'https://evil.test/watch?v=dQw4w9WgXcQ', controls: true }]), sort_order: 1, status: 'published' }));
await assert.rejects(() => repo.upsertBlock({ page_id: 1, type: 'video', title: 'Traversal', body: '', items: JSON.stringify([{ sourceType: 'media', mediaPath: '/assets/site-media/../x.mp4', controls: true }]), sort_order: 1, status: 'published' }));
await assert.rejects(() => repo.upsertBlock({ page_id: 1, type: 'video', title: 'Query', body: '', items: JSON.stringify([{ sourceType: 'media', mediaPath: '/assets/site-media/2026/07/ready.mp4?x=1', controls: true }]), sort_order: 1, status: 'published' }));
await repo.upsertBlock({ page_id: 1, type: 'video', title: 'YT', body: '', items: JSON.stringify([{ sourceType: 'youtube', youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ', controls: true }]), sort_order: 1, status: 'published' });
await repo.updatePage(1, { hero_video: JSON.stringify({ sourceType: 'media', mediaPath: '/assets/site-media/2026/07/ready.mp4', poster: '/assets/site-media/2026/07/poster.webp' }) });
assert.match(pool.state.pages[0].hero_video, /ready\.mp4/);
await repo.updatePage(1, { title: 'P2' });
assert.match(pool.state.pages[0].hero_video, /ready\.mp4/);
await repo.updatePage(1, { hero_video: '' });
assert.equal(pool.state.pages[0].hero_video, null);

async function files(dir) { const out = []; for (const ent of await readdir(dir, { withFileTypes: true })) { const full = path.join(dir, ent.name); if (ent.isDirectory()) out.push(...await files(full)); else if (full.endsWith('.astro')) out.push(full); } return out; }
const pageSources = await Promise.all((await files('src/pages')).map(async (file) => [file, await readFile(file, 'utf8')]));
assert.equal(pageSources.some(([file, src]) => file === 'src/pages/[...slug].astro' && src.includes('PublicPageRenderer')), true, 'catch-all must dispatch through the public Astro renderer dispatcher');
assert.equal(pageSources.some(([file, src]) => file === 'src/pages/[...slug].astro' && src.includes('getPublicPageRenderer')), false, 'catch-all must not use the TypeScript renderer registry for Astro components');
assert.equal(pageSources.some(([, src]) => src.includes('<PageHero')), false, 'route entry points must not render PageHero directly');
const rendererHeroFiles = [];
for (const file of await files('src/components/page-renderers')) { const src = await readFile(file, 'utf8'); if (src.includes('<PageHero')) rendererHeroFiles.push(file); }
assert.deepEqual(rendererHeroFiles.sort(), ['src/components/page-renderers/ContentPageRenderer.astro','src/components/page-renderers/SolutionsIndexRenderer.astro','src/components/page-renderers/SolutionDetailRenderer.astro','src/components/page-renderers/AudiencesIndexRenderer.astro','src/components/page-renderers/AudienceDetailRenderer.astro','src/components/page-renderers/IntegrationsRenderer.astro','src/components/page-renderers/PricingRenderer.astro','src/components/page-renderers/ContactRenderer.astro'].sort());
for (const file of rendererHeroFiles) { const src = await readFile(file, 'utf8'); assert.match(src, /video=\{page\??\.heroVideo\}/, `${file} must pass heroVideo`); }
const videoMediaSource = await readFile('src/components/VideoMedia.astro', 'utf8');
assert.match(await readFile('src/lib/content/video-client.mjs', 'utf8'), /prefers-reduced-motion: reduce/);
assert.match(videoMediaSource, /src=\{youtubeState.initialSrc\}/);
assert.match(videoMediaSource, /data-autoplay-src=\{youtubeState.autoplaySrc/);
assert.match(videoMediaSource, /tabindex=\{isDecorative \? '-1'/);
assert.match(videoMediaSource, /\.video-media__element:fullscreen/);
assert.match(videoMediaSource, /:-webkit-full-screen/);
assert.match(await readFile('src/lib/content/video-client.mjs', 'utf8'), /computeYouTubeFrameSize/);
const heroSource = await readFile('src/components/PageHero.astro', 'utf8');
assert.match(heroSource, /\{video && <div class="page-hero-overlay"/);
assert.match(heroSource, /\.page-hero-detail:not\(\.has-hero-video\)::before \{ opacity: var\(--page-hero-detail-overlay-opacity\); \}/);
assert.match(heroSource, /\.page-hero-detail\.has-hero-video \.page-hero-overlay \{ opacity: var\(--page-hero-detail-overlay-opacity\); \}/);
assert.match(heroSource, /\.has-hero-video::before \{[^}]*background-size: var\(--page-hero-bg-size\)/);
assert.match(heroSource, /--video-poster-fit: \$\{allowedFit === 'stretch' \? 'fill' : allowedFit\}/);
assert.match(heroSource, /--video-poster-position: \$\{x\}% \$\{y\}%/);
assert.match(heroSource, /--page-hero-bg-position-mobile: \$\{mx\}% \$\{my\}%/);
console.log('Video regressions smoke passed: serializers, movement, media filters, repository validation, hero DB roundtrip, call sites, reduced motion, accessibility, fullscreen and YouTube fit contracts.');

import { computeYouTubeFrameSize, initialYouTubePlaybackState, initializeVideoMediaRoot } from '../src/lib/content/video-client.mjs';
import { serializeVideoEditorValues, videoPanelVisibility } from '../src/lib/admin/render/blocks.mjs';

class FakeClassList {
  constructor(values = []) { this.values = new Set(values); }
  contains(name) { return this.values.has(name); }
  toggle(name, force) { force ? this.values.add(name) : this.values.delete(name); }
}
class FakeEl {
  constructor({ tag = 'div', attrs = {}, dataset = {}, classes = [], width = 800, height = 450, log = null } = {}) { this.tag = tag; this.attrs = { ...attrs }; this.dataset = { ...dataset }; this.classList = new FakeClassList(classes); this.listeners = {}; this.style = {}; this.clientWidth = width; this.clientHeight = height; this.playCalls = 0; this.log = log; }
  querySelector(sel) { if (sel.startsWith('iframe')) return this.iframe || null; if (sel === '[data-video-element]' || sel === 'video.video-media__element') return this.mainVideo || this.video || null; if (sel.startsWith('video')) return this.video || null; return null; }
  addEventListener(type, fn) { this.log?.push('listen:'+type); (this.listeners[type] ||= []).push(fn); }
  dispatch(type) { for (const fn of this.listeners[type] || []) fn({ type }); }
  setAttribute(name, value) { this.log?.push('set:'+name+':'+String(value)); this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] || ''; }
  play() { this.playCalls += 1; return Promise.resolve(); }
  getBoundingClientRect() { return { width: this.clientWidth, height: this.clientHeight }; }
}
const winReduce = { matchMedia: () => ({ matches: true }) };
const resizeObservers = [];
const winMotion = { matchMedia: () => ({ matches: false }), ResizeObserver: class { constructor() { resizeObservers.push(this); } observe() {} } };
const decorativeRoot = new FakeEl({ dataset: { autoplay: 'true', videoObjectFit: 'cover' }, classes: ['video-media--background', 'is-decorative'], width: 1600, height: 400 });
decorativeRoot.iframe = new FakeEl({ tag: 'iframe', attrs: { src: 'about:blank' }, dataset: { autoplaySrc: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&controls=0', manualSrc: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=0&controls=0', youtubeFrame: 'true' } });
initializeVideoMediaRoot(decorativeRoot, { window: winReduce });
assert.equal(decorativeRoot.iframe.getAttribute('src'), 'about:blank');
assert.equal(decorativeRoot.classList.contains('is-media-loaded'), false);
decorativeRoot.iframe.dispatch('load');
assert.equal(decorativeRoot.classList.contains('is-media-loaded'), false);

const interactiveRoot = new FakeEl({ dataset: { autoplay: 'true', videoObjectFit: 'cover' }, classes: ['video-media--background', 'is-interactive'], width: 1600, height: 400 });
interactiveRoot.iframe = new FakeEl({ tag: 'iframe', attrs: { src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=0&controls=1' }, dataset: { autoplaySrc: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&controls=1', manualSrc: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=0&controls=1', youtubeFrame: 'true' } });
initializeVideoMediaRoot(interactiveRoot, { window: winReduce });
assert.match(interactiveRoot.iframe.getAttribute('src'), /autoplay=0/);
assert.match(interactiveRoot.iframe.getAttribute('src'), /controls=1/);
interactiveRoot.iframe.dispatch('load');
assert.equal(interactiveRoot.classList.contains('is-media-loaded'), true);
interactiveRoot.iframe.dispatch('error');
assert.equal(interactiveRoot.classList.contains('is-media-loaded'), false);
const interactiveAutoplay = new FakeEl({ dataset: { autoplay: 'true', videoObjectFit: 'cover' }, classes: ['video-media--background', 'is-interactive'] });
interactiveAutoplay.iframe = new FakeEl({ tag: 'iframe', attrs: { src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=0&controls=1' }, dataset: { autoplaySrc: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&controls=1', manualSrc: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=0&controls=1', youtubeFrame: 'true' } });
initializeVideoMediaRoot(interactiveAutoplay, { window: winMotion });
assert.match(interactiveAutoplay.iframe.getAttribute('src'), /autoplay=1/);
const observerCount = resizeObservers.length;
initializeVideoMediaRoot(interactiveAutoplay, { window: winMotion });
assert.equal(resizeObservers.length, observerCount);


const raceLog = [];
const raceRoot = new FakeEl({ dataset: { autoplay: 'true', videoObjectFit: 'cover' }, classes: ['video-media--inline', 'is-interactive', 'has-poster'], log: raceLog });
raceRoot.iframe = new FakeEl({ tag: 'iframe', attrs: { src: 'about:blank' }, dataset: { autoplaySrc: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&mute=1&controls=1', manualSrc: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=0&controls=1', youtubeFrame: 'true' }, log: raceLog });
assert.equal(raceRoot.iframe.getAttribute('src'), 'about:blank');
initializeVideoMediaRoot(raceRoot, { window: winMotion });
assert.deepEqual(raceLog.slice(0, 3), ['listen:load', 'listen:error', 'set:src:https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&mute=1&controls=1']);
raceRoot.iframe.setAttribute('src', 'about:blank');
raceRoot.iframe.dispatch('load');
assert.equal(raceRoot.classList.contains('is-media-loaded'), false);
raceRoot.iframe.setAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&mute=1&controls=1');
raceRoot.iframe.dispatch('load');
assert.equal(raceRoot.classList.contains('is-media-loaded'), true);
raceRoot.iframe.dispatch('error');
assert.equal(raceRoot.classList.contains('is-media-loaded'), false);
initializeVideoMediaRoot(raceRoot, { window: winMotion });
assert.equal((raceRoot.iframe.listeners.load || []).length, 1);
assert.equal((raceRoot.iframe.listeners.error || []).length, 1);

const inlineReduce = new FakeEl({ dataset: { autoplay: 'true', videoObjectFit: 'cover' }, classes: ['video-media--inline', 'is-interactive'] });
inlineReduce.iframe = new FakeEl({ tag: 'iframe', attrs: { src: 'about:blank' }, dataset: { autoplaySrc: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&mute=1&controls=1', manualSrc: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=0&controls=1', youtubeFrame: 'true' } });
initializeVideoMediaRoot(inlineReduce, { window: winReduce });
assert.match(inlineReduce.iframe.getAttribute('src'), /autoplay=0/);
assert.doesNotMatch(inlineReduce.iframe.getAttribute('src'), /about:blank/);

const mp4Decorative = new FakeEl({ dataset: { autoplay: 'true' }, classes: ['video-media--background', 'is-decorative'] });
mp4Decorative.video = new FakeEl({ tag: 'video' });
initializeVideoMediaRoot(mp4Decorative, { window: winReduce });
assert.equal(mp4Decorative.video.playCalls, 0);

const mp4WithBackdrop = new FakeEl({ dataset: { autoplay: 'true' }, classes: ['video-media--background', 'is-interactive'] });
mp4WithBackdrop.video = new FakeEl({ tag: 'video', log: [] });
mp4WithBackdrop.mainVideo = new FakeEl({ tag: 'video', attrs: { src: '/assets/site-media/2026/07/main.mp4' } });
initializeVideoMediaRoot(mp4WithBackdrop, { window: winMotion });
assert.equal(mp4WithBackdrop.video.playCalls, 0);
assert.equal(mp4WithBackdrop.mainVideo.playCalls, 1);
mp4WithBackdrop.video.dispatch('loadeddata');
assert.equal(mp4WithBackdrop.classList.contains('is-media-loaded'), false);
mp4WithBackdrop.mainVideo.dispatch('loadeddata');
assert.equal(mp4WithBackdrop.classList.contains('is-media-loaded'), true);


const mp4RejectRoot = new FakeEl({ dataset: { autoplay: 'true' }, classes: ['video-media--background', 'is-interactive'] });
mp4RejectRoot.video = new FakeEl({ tag: 'video', attrs: { src: '/assets/site-media/2026/07/backdrop.mp4' } });
mp4RejectRoot.mainVideo = new FakeEl({ tag: 'video', attrs: { src: '/assets/site-media/2026/07/main.mp4' } });
mp4RejectRoot.mainVideo.muted = false;
mp4RejectRoot.mainVideo.play = function play() { this.playCalls += 1; return this.playCalls === 1 ? Promise.reject(new Error('autoplay blocked')) : Promise.resolve(); };
initializeVideoMediaRoot(mp4RejectRoot, { window: winMotion });
await Promise.resolve();
await Promise.resolve();
assert.equal(mp4RejectRoot.video.playCalls, 0);
assert.equal(mp4RejectRoot.mainVideo.playCalls, 2);
assert.equal(mp4RejectRoot.mainVideo.muted, true);
assert.equal(mp4RejectRoot.mainVideo.controls, undefined);
assert.equal(normalizeVideoConfig({ sourceType: 'media', mediaPath: '/assets/site-media/2026/07/main.mp4', autoplay: true, muted: false, controls: false }, { context: 'hero' }).muted, false);

const mp4Interactive = new FakeEl({ dataset: { autoplay: 'true' }, classes: ['video-media--background', 'is-interactive'] });
mp4Interactive.video = new FakeEl({ tag: 'video', attrs: { src: '/assets/site-media/2026/07/ready.mp4', controls: '' } });
initializeVideoMediaRoot(mp4Interactive, { window: winReduce });
assert.equal(mp4Interactive.video.getAttribute('src'), '/assets/site-media/2026/07/ready.mp4');
assert.equal(mp4Interactive.video.playCalls, 0);
mp4Interactive.video.dispatch('loadeddata');
assert.equal(mp4Interactive.classList.contains('is-media-loaded'), true);
mp4Interactive.video.dispatch('error');
assert.equal(mp4Interactive.classList.contains('is-media-loaded'), false);
initializeVideoMediaRoot(mp4Interactive, { window: winReduce });
assert.equal((mp4Interactive.video.listeners.loadeddata || []).length, 1);

assert.deepEqual(computeYouTubeFrameSize({ containerWidth: 1600, containerHeight: 400, fit: 'cover' }), { width: 1600, height: 900 });
assert.deepEqual(computeYouTubeFrameSize({ containerWidth: 400, containerHeight: 800, fit: 'cover' }), { width: 800 * 16 / 9, height: 800 });
assert.deepEqual(computeYouTubeFrameSize({ containerWidth: 1600, containerHeight: 900, fit: 'cover' }), { width: 1600, height: 900 });
assert.deepEqual(computeYouTubeFrameSize({ containerWidth: 1600, containerHeight: 400, fit: 'contain' }), { width: 400 * 16 / 9, height: 400 });
assert.deepEqual(computeYouTubeFrameSize({ containerWidth: 400, containerHeight: 800, fit: 'contain' }), { width: 400, height: 225 });
assert.deepEqual(computeYouTubeFrameSize({ containerWidth: 0, containerHeight: 0, fit: 'cover' }), { width: 0, height: 0 });
assert.deepEqual(initialYouTubePlaybackState({ isBackground: false, autoplay: false, controls: true, manualSrc: 'manual?autoplay=0', autoplaySrc: 'auto?autoplay=1' }), { initialSrc: 'manual?autoplay=0', manualSrc: 'manual?autoplay=0', autoplaySrc: '', deferred: false });
assert.deepEqual(initialYouTubePlaybackState({ isBackground: false, autoplay: true, controls: true, manualSrc: 'manual?autoplay=0', autoplaySrc: 'auto?autoplay=1&mute=1' }), { initialSrc: 'manual?autoplay=0', manualSrc: 'manual?autoplay=0', autoplaySrc: 'auto?autoplay=1&mute=1', deferred: true });
assert.deepEqual(initialYouTubePlaybackState({ isBackground: false, autoplay: true, controls: true, hasPoster: true, manualSrc: 'manual?autoplay=0', autoplaySrc: 'auto?autoplay=1&mute=1' }), { initialSrc: 'about:blank', manualSrc: 'manual?autoplay=0', autoplaySrc: 'auto?autoplay=1&mute=1', deferred: true });
assert.deepEqual(initialYouTubePlaybackState({ isBackground: true, autoplay: true, controls: true, manualSrc: 'manual', autoplaySrc: 'auto' }), { initialSrc: 'manual', manualSrc: 'manual', autoplaySrc: 'auto', deferred: true });
assert.deepEqual(initialYouTubePlaybackState({ isBackground: true, autoplay: true, controls: false, manualSrc: 'manual', autoplaySrc: 'auto' }), { initialSrc: 'about:blank', manualSrc: 'manual', autoplaySrc: 'auto', deferred: true });

assert.deepEqual(videoPanelVisibility('media'), { sourceType: 'media', mediaVisible: true, youtubeVisible: false });
assert.deepEqual(videoPanelVisibility('youtube'), { sourceType: 'youtube', mediaVisible: false, youtubeVisible: true });
assert.deepEqual(serializeVideoEditorValues({ sourceType: 'youtube', youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ', mediaPath: '/assets/site-media/x.mp4', controls: false }), { sourceType: 'youtube', autoplay: false, muted: false, loop: false, controls: true, preload: 'metadata', objectFit: 'cover', aspectRatio: '16/9', youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' });
assert.deepEqual(serializeVideoEditorValues({ sourceType: 'media', mediaPath: '/assets/site-media/2026/07/demo.mp4', autoplay: true, controls: false }), { sourceType: 'media', autoplay: true, muted: false, loop: false, controls: false, preload: 'metadata', objectFit: 'cover', aspectRatio: '16/9', mediaPath: '/assets/site-media/2026/07/demo.mp4' });
assert.deepEqual(serializeVideoEditorValues({ controls: false }), { sourceType: 'media', autoplay: false, muted: false, loop: false, controls: true, preload: 'metadata', objectFit: 'cover', aspectRatio: '16/9', mediaPath: '' });


const mediaPickerSource = await readFile('src/lib/admin/render/media.mjs', 'utf8');
assert.match(mediaPickerSource, /<article class=\"media-item\" tabindex=\"0\" data-pick-media-path=/);
assert.doesNotMatch(mediaPickerSource, /<article class=\"media-item\" role=\"button\"[\s\S]*<button/);
assert.match(mediaPickerSource, /e\.target\.closest\('\[data-pick-media-path\]'\)/);
assert.match(mediaPickerSource, /e\.target\.matches\('\[data-pick-media-path\]'\)/);

const vmSource = await readFile('src/components/VideoMedia.astro', 'utf8');
const helperSource = await readFile('src/lib/content/video-client.mjs', 'utf8');
assert.doesNotMatch(vmSource.replace(/:fullscreen[^}]+}|:-webkit-full-screen[^}]+}/g, ''), /100vw|100vh/);
assert.match(vmSource, /\.video-media\{[^}]*background:#080a34/);
assert.match(vmSource, /\.video-media--background\{[^}]*background:transparent/);
assert.doesNotMatch(vmSource, /\.video-media--background\s+\.video-media__element\{[^}]*min-width:100%;[^}]*min-height:100%/);
assert.match(vmSource, /\.video-media--background\.video-media--fit-cover \.video-media__element\{[^}]*min-width:100%;[^}]*min-height:100%/);
assert.match(vmSource, /\.video-media--background\.video-media--fit-contain \.video-media__element\{[^}]*min-width:0;[^}]*min-height:0/);
assert.match(vmSource, /\.video-media--background\.has-poster \.video-media__poster\{opacity:0\}/);
assert.match(vmSource, /\.video-media--background \.video-media__backdrop\{opacity:0\}/);
assert.match(vmSource, /poster=\{isBg \? undefined : \(poster \|\| undefined\)\}/);
assert.doesNotMatch(helperSource, /100vw|100vh/);
const mediaSource = await readFile('src/lib/admin/render/media.mjs', 'utf8');
assert.match(mediaSource, /mediaMatchesKind=\$\{mediaMatchesKind\.toString\(\)\}/);

console.log('Video client regression additions passed: reduced motion, poster lifecycle, idempotency, admin helpers and container geometry.');
