export function readVideoDraft(form) {
  const sourceType = form?.querySelector?.('[data-video-source]')?.value === 'youtube' ? 'youtube' : 'media';
  const draft = {
    sourceType,
    autoplay: !!form?.querySelector?.('[data-video-autoplay]')?.checked,
    muted: !!form?.querySelector?.('[data-video-muted]')?.checked,
    loop: !!form?.querySelector?.('[data-video-loop]')?.checked,
    controls: !!form?.querySelector?.('[data-video-controls]')?.checked,
    preload: form?.querySelector?.('[data-video-preload]')?.value || 'metadata',
    objectFit: form?.querySelector?.('[data-video-object-fit]')?.value || 'cover',
    aspectRatio: form?.querySelector?.('[data-video-aspect-ratio]')?.value || '16/9',
  };
  const poster = form?.querySelector?.('[data-video-poster]')?.value || '';
  if (poster) draft.poster = poster;
  if (sourceType === 'youtube') draft.youtubeUrl = form?.querySelector?.('[data-video-youtube-url]')?.value || '';
  else draft.mediaPath = form?.querySelector?.('[data-video-media-path]')?.value || '';
  return draft;
}

function setValue(form, selector, value) {
  const element = form?.querySelector?.(selector);
  if (element && value !== undefined && value !== null) element.value = value;
}

export function restoreVideoDraft(form, draft, EventCtor = globalThis.Event) {
  if (!form || !draft || typeof draft !== 'object' || Array.isArray(draft)) return false;
  const sourceType = draft.sourceType === 'youtube' ? 'youtube' : 'media';
  setValue(form, '[data-video-source]', sourceType);
  setValue(form, '[data-video-media-path]', draft.mediaPath || '');
  setValue(form, '[data-video-youtube-url]', draft.youtubeUrl || '');
  setValue(form, '[data-video-poster]', draft.poster || '');
  setValue(form, '[data-video-preload]', draft.preload || 'metadata');
  setValue(form, '[data-video-object-fit]', draft.objectFit || 'cover');
  setValue(form, '[data-video-aspect-ratio]', draft.aspectRatio || '16/9');
  for (const key of ['autoplay', 'muted', 'loop', 'controls']) {
    const element = form.querySelector?.(`[data-video-${key}]`);
    if (element) element.checked = key === 'controls' ? draft[key] !== false : !!draft[key];
  }
  const itemsInput = form.querySelector?.('input[name="items"]');
  if (itemsInput) itemsInput.value = JSON.stringify([draft]);
  const source = form.querySelector?.('[data-video-source]');
  if (source?.dispatchEvent && EventCtor) source.dispatchEvent(new EventCtor('change', { bubbles: true }));
  return true;
}

export function installVideoDraftGuard(doc = globalThis.document, options = {}) {
  if (!doc?.addEventListener || doc.__videoDraftGuardInstalled) return false;
  doc.__videoDraftGuardInstalled = true;
  const EventCtor = options.EventCtor || globalThis.Event;
  const enqueue = options.queue || globalThis.queueMicrotask || ((callback) => Promise.resolve().then(callback));
  doc.addEventListener('change', (event) => {
    const target = event?.target;
    if (!target?.matches?.('[data-block-type]')) return;
    const form = target.closest?.('[data-block-form]');
    if (!form) return;
    const previousType = form.dataset?.currentBlockType || form.dataset?.initialBlockType || '';
    const nextType = target.value || '';
    if (previousType === 'video' && nextType !== 'video') {
      const draft = readVideoDraft(form);
      if (form.dataset) form.dataset.videoDraft = JSON.stringify(draft);
      form.__videoDraft = draft;
      return;
    }
    if (previousType !== 'video' && nextType === 'video') {
      let draft = form.__videoDraft || null;
      if (!draft && form.dataset?.videoDraft) {
        try { draft = JSON.parse(form.dataset.videoDraft); } catch { draft = null; }
      }
      if (draft) enqueue(() => restoreVideoDraft(form, draft, EventCtor));
    }
  }, true);
  return true;
}

export function videoDraftGuardJs() {
  return `const readVideoDraft=${readVideoDraft.toString()};const setVideoDraftValue=${setValue.toString()};const restoreVideoDraft=${restoreVideoDraft.toString().replaceAll('setValue(', 'setVideoDraftValue(')};const installVideoDraftGuard=${installVideoDraftGuard.toString()};installVideoDraftGuard(document,{EventCtor:Event,queue:queueMicrotask});`;
}
