import { navHtml as positionControlsNavHtml } from './menu-position-controls.mjs';

export const menuVisibleDefaultScript = String.raw`(() => {
  const rows = document.getElementById('nav-rows');
  if (!rows) return;

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('#add-nav-bottom, [data-menu-add-position="top"] button, [data-add-child]');
    if (!trigger || trigger.disabled) return;
    const before = new Set(rows.querySelectorAll('[data-nav-item]'));
    queueMicrotask(() => {
      const newRow = [...rows.querySelectorAll('[data-nav-item]')].find((row) => !before.has(row));
      if (!newRow) return;
      const status = newRow.querySelector('[data-field="status"]');
      if (!status || status.value === 'published') return;
      status.value = 'published';
      status.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }, true);
})();`;

export function navHtml(items, pages = []) {
  return `${positionControlsNavHtml(items, pages)}<script>${menuVisibleDefaultScript}</script>`;
}
