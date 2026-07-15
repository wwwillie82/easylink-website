export function computeYouTubeFrameSize({ containerWidth, containerHeight, fit = 'cover', aspectWidth = 16, aspectHeight = 9 } = {}) {
  const cw = Number(containerWidth);
  const ch = Number(containerHeight);
  const aw = Number(aspectWidth) || 16;
  const ah = Number(aspectHeight) || 9;
  if (!Number.isFinite(cw) || !Number.isFinite(ch) || cw <= 0 || ch <= 0 || aw <= 0 || ah <= 0) return { width: 0, height: 0 };
  const ratio = aw / ah;
  const byWidth = { width: cw, height: cw / ratio };
  const byHeight = { width: ch * ratio, height: ch };
  if (fit === 'contain') return byWidth.height <= ch ? byWidth : byHeight;
  return byWidth.height >= ch ? byWidth : byHeight;
}

export function initialYouTubePlaybackState({ isBackground = false, autoplay = false, controls = true, hasPoster = false, manualSrc = '', autoplaySrc = '' } = {}) {
  const manual = manualSrc || autoplaySrc || '';
  const auto = autoplaySrc || manualSrc || '';
  const blankForPoster = hasPoster ? 'about:blank' : manual;
  if (!autoplay) return { initialSrc: blankForPoster, manualSrc: manual, autoplaySrc: '', deferred: hasPoster };
  if (isBackground && !controls) return { initialSrc: 'about:blank', manualSrc: manual, autoplaySrc: auto, deferred: true };
  return { initialSrc: blankForPoster, manualSrc: manual, autoplaySrc: auto, deferred: true };
}

export function shouldAutoplayVideo({ win = globalThis.window, autoplay = false } = {}) {
  if (!autoplay) return false;
  return win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches !== true;
}

function setLoaded(root, loaded) {
  root?.classList?.toggle?.('is-media-loaded', Boolean(loaded));
}

function realYouTubeSrc(src = '') {
  return /^https:\/\/www\.youtube-nocookie\.com\/embed\//.test(String(src || ''));
}

export function updateYouTubeFrame(root) {
  const iframe = root?.querySelector?.('iframe[data-youtube-frame="true"]');
  if (!iframe) return { width: 0, height: 0 };
  const fit = root.dataset.videoObjectFit || 'cover';
  const width = root.clientWidth || root.getBoundingClientRect?.().width || 0;
  const height = root.clientHeight || root.getBoundingClientRect?.().height || 0;
  const size = computeYouTubeFrameSize({ containerWidth: width, containerHeight: height, fit });
  if (size.width > 0 && size.height > 0) {
    iframe.style.width = `${size.width}px`;
    iframe.style.height = `${size.height}px`;
  }
  return size;
}

export function initializeVideoMediaRoot(root, options = {}) {
  if (!root || root.dataset?.videoInitialized === 'true') return { initialized: false };
  if (root.dataset) root.dataset.videoInitialized = 'true';
  const win = options.window || globalThis.window;
  const autoplay = root.dataset?.autoplay === 'true';
  const decorative = root.classList?.contains?.('is-decorative') === true;
  const iframe = root.querySelector?.('iframe');
  const video = root.querySelector?.('[data-video-element]') || root.querySelector?.('video.video-media__element');
  const canAutoplay = shouldAutoplayVideo({ win, autoplay });

  if (iframe) {
    const autoplaySrc = iframe.dataset?.autoplaySrc || iframe.dataset?.src || '';
    const manualSrc = iframe.dataset?.manualSrc || iframe.getAttribute?.('src') || '';
    iframe.addEventListener?.('load', () => {
      if (realYouTubeSrc(iframe.getAttribute?.('src'))) setLoaded(root, true);
    });
    iframe.addEventListener?.('error', () => setLoaded(root, false));
    const desiredSrc = autoplay && canAutoplay && autoplaySrc ? autoplaySrc : (!decorative && manualSrc ? manualSrc : '');
    if (desiredSrc && iframe.getAttribute?.('src') !== desiredSrc) iframe.setAttribute('src', desiredSrc);
    updateYouTubeFrame(root);
  }

  if (video) {
    video.addEventListener?.('loadeddata', () => setLoaded(root, true));
    video.addEventListener?.('canplay', () => setLoaded(root, true));
    video.addEventListener?.('error', () => setLoaded(root, false));
    if (!autoplay) setLoaded(root, true);
    if (autoplay && canAutoplay) {
      video.autoplay = true;
      const result = video.play?.();
      if (result?.catch) result.catch(() => {});
    }
  }

  let observer = null;
  let resizeHandler = null;
  if (iframe && win?.ResizeObserver) {
    observer = new win.ResizeObserver(() => updateYouTubeFrame(root));
    observer.observe(root);
    root.__videoResizeObserver = observer;
  } else if (iframe && win?.addEventListener) {
    resizeHandler = () => updateYouTubeFrame(root);
    win.addEventListener('resize', resizeHandler);
    root.__videoResizeHandler = resizeHandler;
  }
  return { initialized: true, canAutoplay, observer, resizeHandler };
}

export function initializeVideoMedia(doc = globalThis.document, win = globalThis.window) {
  const roots = [...(doc?.querySelectorAll?.('[data-video-media-root]') || [])];
  return roots.map((root) => initializeVideoMediaRoot(root, { window: win }));
}
