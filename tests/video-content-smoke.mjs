import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildYouTubeEmbedUrl, normalizeVideoConfig, parseYouTubeUrl, assertMediaPath } from '../src/lib/content/video.mjs';

for (const url of [
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://youtube.com/watch?v=dQw4w9WgXcQ',
  'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://youtu.be/dQw4w9WgXcQ',
  'https://www.youtube.com/embed/dQw4w9WgXcQ',
  'https://www.youtube.com/shorts/dQw4w9WgXcQ',
  'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
]) assert.equal(parseYouTubeUrl(url).id, 'dQw4w9WgXcQ');
for (const bad of ['https://evil.test/watch?v=dQw4w9WgXcQ','javascript:alert(1)','data:text/html,x','https://youtube.com/watch?v=bad','https://youtube.com/playlist?list=PL123','<iframe src="https://youtube.com/embed/dQw4w9WgXcQ"></iframe>']) assert.throws(() => parseYouTubeUrl(bad));
const embed = buildYouTubeEmbedUrl({ youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ', autoplay: true, muted: true, loop: true, controls: false });
assert.match(embed, /^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/);
assert.match(embed, /playlist=dQw4w9WgXcQ/);
const cfg = normalizeVideoConfig({ sourceType: 'media', mediaPath: '/assets/site-media/2026/07/demo.mp4', autoplay: true, muted: false, controls: false, preload: 'bad', objectFit: 'bad', aspectRatio: '9/16' });
assert.equal(cfg.muted, true);
assert.equal(cfg.preload, 'metadata');
assert.equal(cfg.objectFit, 'cover');
for (const bad of ['../x.mp4','/assets/site-media/../x.mp4','/assets/site-media/x.mp4?x=1','https://cdn/x.mp4']) assert.throws(() => assertMediaPath(bad));

const blocks = await readFile('src/lib/admin/render/blocks.mjs','utf8');
assert.match(blocks, /\['video','Videó blokk'\]/);
assert.match(blocks, /data-media-picker-kind="video"/);
assert.match(blocks, /data-media-picker-kind="image"/);
assert.match(blocks, /getVideoRows/);
const pages = await readFile('src/lib/admin/render/pages.mjs','utf8');
assert.match(pages, /Hero háttérvideó/);
assert.match(pages, /name="hero_video_source"/);
const repo = await readFile('src/lib/admin/repository.mjs','utf8');
assert.match(repo, /requireReadyMedia/);
assert.match(repo, /processing_status !== 'ready'/);
assert.match(repo, /type\)\) throw validationError/);
const schema = await readFile('src/lib/db/schema.sql','utf8');
assert.match(schema, /hero_video JSON NULL/);
const contentBlocks = await readFile('src/components/ContentBlocks.astro','utf8');
assert.match(contentBlocks, /<VideoMedia config=\{video\}/);
const hero = await readFile('src/components/PageHero.astro','utf8');
assert.match(hero, /video && <div class="page-hero-overlay"/);
assert.match(hero, /mode="background"/);
const videoMedia = await readFile('src/components/VideoMedia.astro','utf8');
assert.match(await readFile('src/lib/content/video.mjs','utf8'), /youtube-nocookie/);
assert.match(videoMedia, /prefers-reduced-motion: reduce/);
assert.doesNotMatch(videoMedia, /innerHTML/);
console.log('Video content smoke passed: contract, admin editor, media filtering, hero DB, and public render contracts.');
