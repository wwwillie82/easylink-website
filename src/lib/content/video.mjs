const SOURCE_TYPES = new Set(['media', 'youtube']);
const PRELOAD = new Set(['none', 'metadata', 'auto']);
const OBJECT_FIT = new Set(['cover', 'contain']);
const ASPECT = new Set(['auto', '16/9', '4/3', '1/1', '9/16']);
const YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'youtube-nocookie.com', 'www.youtube-nocookie.com']);
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const MEDIA_PATH = /^\/assets\/site-media\/[A-Za-z0-9/_-]+\.[A-Za-z0-9]+$/;

export const imageMimeTypes = new Set(['image/webp', 'image/jpeg', 'image/png']);
export const videoMimeTypes = new Set(['video/mp4']);
export const videoDefaults = Object.freeze({ sourceType: 'media', autoplay: false, muted: true, loop: false, controls: true, preload: 'metadata', objectFit: 'cover', aspectRatio: '16/9' });

export function booleanValue(value, fallback = false) {
  if (value === true || value === 'true' || value === 'on' || value === '1' || value === 1) return true;
  if (value === false || value === 'false' || value === '0' || value === 0 || value === '' || value == null) return false;
  return fallback;
}
export function assertMediaPath(path, label = 'Média útvonal') {
  const value = String(path || '').trim();
  if (!value) throw new Error(`${label} megadása kötelező.`);
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.includes('..') || value.includes('?') || value.includes('#') || !MEDIA_PATH.test(value)) throw new Error(`${label} csak biztonságos /assets/site-media/... útvonal lehet.`);
  return value;
}
export function parseYouTubeUrl(input) {
  const raw = String(input || '').trim();
  if (!raw || /<|>|iframe|javascript:|data:/i.test(raw)) throw new Error('Érvényes YouTube link szükséges.');
  let url;
  try { url = new URL(raw); } catch { throw new Error('Érvényes YouTube link szükséges.'); }
  if (url.protocol !== 'https:') throw new Error('Csak https YouTube link fogadható el.');
  const host = url.hostname.toLowerCase();
  if (!YT_HOSTS.has(host)) throw new Error('Csak valódi YouTube link fogadható el.');
  const parts = url.pathname.split('/').filter(Boolean);
  let id = '';
  if (host === 'youtu.be') {
    if (parts.length !== 1) throw new Error('Nem támogatott YouTube link formátum.');
    id = parts[0] || '';
  } else if (host === 'youtube-nocookie.com' || host === 'www.youtube-nocookie.com') {
    if (parts.length !== 2 || parts[0] !== 'embed') throw new Error('Nem támogatott YouTube link formátum.');
    id = parts[1] || '';
  } else if (parts.length === 1 && parts[0] === 'watch') {
    id = url.searchParams.get('v') || '';
  } else if (parts.length === 2 && (parts[0] === 'embed' || parts[0] === 'shorts')) {
    id = parts[1] || '';
  } else {
    throw new Error('Nem támogatott YouTube link formátum.');
  }
  if (!VIDEO_ID.test(id)) throw new Error('A YouTube videóazonosító hibás vagy hiányzik.');
  return { id, canonicalUrl: `https://www.youtube.com/watch?v=${id}` };
}
export function buildYouTubeEmbedUrl(config = {}) {
  const { id } = parseYouTubeUrl(config.youtubeUrl || config.canonicalUrl || '');
  const params = new URLSearchParams();
  params.set('autoplay', booleanValue(config.autoplay) ? '1' : '0');
  params.set('mute', booleanValue(config.muted) ? '1' : '0');
  params.set('controls', booleanValue(config.controls, true) ? '1' : '0');
  params.set('loop', booleanValue(config.loop) ? '1' : '0');
  params.set('playsinline', '1');
  params.set('cc_load_policy', '0');
  if (booleanValue(config.loop)) params.set('playlist', id);
  return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`;
}
export function normalizeVideoConfig(input, { context = 'block', allowNull = false } = {}) {
  if ((input == null || input === '' || input === false) && allowNull) return null;
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const sourceType = SOURCE_TYPES.has(src.sourceType) ? src.sourceType : videoDefaults.sourceType;
  const config = {
    sourceType,
    autoplay: booleanValue(src.autoplay, context === 'hero'),
    muted: booleanValue(src.muted, videoDefaults.muted),
    loop: booleanValue(src.loop, context === 'hero'),
    controls: booleanValue(src.controls, context === 'block'),
    preload: PRELOAD.has(src.preload) ? src.preload : videoDefaults.preload,
    objectFit: OBJECT_FIT.has(src.objectFit) ? src.objectFit : 'cover',
    aspectRatio: ASPECT.has(src.aspectRatio) ? src.aspectRatio : (context === 'hero' ? 'auto' : '16/9'),
  };
  if (!config.autoplay && !config.controls) config.controls = true;
  if (sourceType === 'media') config.mediaPath = assertMediaPath(src.mediaPath, 'Saját videó');
  if (sourceType === 'youtube') {
    const parsed = parseYouTubeUrl(src.youtubeUrl);
    config.youtubeUrl = parsed.canonicalUrl;
    config.youtubeId = parsed.id;
  }
  if (src.poster) config.poster = assertMediaPath(src.poster, 'Poster / fallback kép');
  return config;
}
export function normalizeVideoItems(items) {
  if (!Array.isArray(items) || items.length !== 1) throw new Error('A videó blokk pontosan egy videó konfigurációt tartalmazhat.');
  return [normalizeVideoConfig(items[0], { context: 'block' })];
}
export function safeParseVideoConfig(value, options = {}) {
  try { return normalizeVideoConfig(typeof value === 'string' ? JSON.parse(value) : value, { ...options, allowNull: true }); } catch { return null; }
}
