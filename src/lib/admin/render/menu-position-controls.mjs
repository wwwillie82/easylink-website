import { navHtml as baseNavHtml } from './menu.mjs';

export const menuPositionControlsScript = String.raw`(() => {
  const form = document.getElementById('nav-form');
  const rows = document.getElementById('nav-rows');
  const bottomButton = document.getElementById('add-nav');
  if (!form || !rows || !bottomButton || typeof bottomButton.onclick !== 'function') return;

  const originalAdd = bottomButton.onclick;
  bottomButton.textContent = 'Új root menüpont legalul';
  bottomButton.id = 'add-nav-bottom';

  const topActions = document.createElement('div');
  topActions.className = 'nav-list-actions';
  topActions.dataset.menuAddPosition = 'top';
  const topButton = document.createElement('button');
  topButton.type = 'button';
  topButton.textContent = 'Új root menüpont legfelül';
  topActions.appendChild(topButton);
  form.querySelector('.admin-section-header')?.insertAdjacentElement('afterend', topActions);

  function rowKey(row) {
    const id = row.querySelector('[data-field="id"]')?.value || '';
    if (id) return 'id:' + id;
    if (!row.dataset.clientKey) row.dataset.clientKey = 'nav-' + Date.now() + '-' + Math.random().toString(16).slice(2);
    return 'client:' + row.dataset.clientKey;
  }

  function parentKey(row) {
    return row.querySelector('[data-role="parent-select"]')?.value || '';
  }

  function siblingRows(parentRef) {
    return [...rows.querySelectorAll('[data-nav-item]')]
      .filter((row) => parentKey(row) === parentRef)
      .sort((a, b) => Number(a.querySelector('[data-field="sort_order"]')?.value || 0) - Number(b.querySelector('[data-field="sort_order"]')?.value || 0));
  }

  function setSiblingOrder(ordered) {
    ordered.forEach((row, index) => {
      const value = String(index + 1);
      const input = row.querySelector('[data-field="sort_order"]');
      const label = row.querySelector('[data-order]');
      if (input) input.value = value;
      if (label) label.textContent = value;
    });
  }

  function normalizeGroupTarget(row) {
    if (row.querySelector('[data-role="target-type"]')?.value !== 'group') return;
    const page = row.querySelector('[data-role="page-select"]');
    const override = row.querySelector('[data-role="title-override"]');
    const titleMode = row.querySelector('[data-role="title-mode"]');
    if (page) page.value = '';
    if (override) override.value = '';
    if (titleMode) titleMode.value = 'inherit';
  }

  function syncGroupButtons() {
    for (const row of rows.querySelectorAll('[data-nav-item]')) {
      const groupMode = row.querySelector('[data-mode="group"]');
      if (!groupMode) continue;
      let holder = groupMode.querySelector('[data-add-child-holder]');
      if (!holder) {
        holder = document.createElement('div');
        holder.className = 'admin-field-actions';
        holder.dataset.addChildHolder = '1';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'secondary';
        button.dataset.addChild = '1';
        button.textContent = 'Gyermek menüpont hozzáadása';
        holder.appendChild(button);
        groupMode.appendChild(holder);
      }
      const isGroup = row.querySelector('[data-role="target-type"]')?.value === 'group';
      const archived = row.querySelector('[data-field="status"]')?.value === 'archived';
      holder.hidden = !isGroup;
      const button = holder.querySelector('[data-add-child]');
      if (button) {
        button.disabled = archived;
        button.title = archived ? 'Archivált csoporthoz nem hozható létre új gyermek.' : '';
      }
    }
  }

  function addRow(parentRef, position) {
    const before = new Set(rows.querySelectorAll('[data-nav-item]'));
    const existingSiblings = siblingRows(parentRef);
    originalAdd.call(bottomButton);
    const newRow = [...rows.querySelectorAll('[data-nav-item]')].find((row) => !before.has(row));
    if (!newRow) return;

    const parentSelect = newRow.querySelector('[data-role="parent-select"]');
    if (parentSelect) parentSelect.value = parentRef;
    const ordered = position === 'start' ? [newRow, ...existingSiblings] : [...existingSiblings, newRow];
    setSiblingOrder(ordered);
    parentSelect?.dispatchEvent(new Event('change', { bubbles: true }));
    syncGroupButtons();
    newRow.scrollIntoView({ block: 'center' });
    newRow.querySelector('[data-role="target-type"]')?.focus();
  }

  topButton.onclick = () => addRow('', 'start');
  bottomButton.onclick = () => addRow('', 'end');

  rows.addEventListener('click', (event) => {
    const button = event.target.closest('[data-add-child]');
    if (!button || button.disabled) return;
    const parentRow = button.closest('[data-nav-item]');
    if (!parentRow) return;
    addRow(rowKey(parentRow), 'end');
  });

  rows.addEventListener('change', (event) => {
    const row = event.target.closest('[data-nav-item]');
    if (!row) return;
    if (event.target.matches('[data-role="target-type"]')) normalizeGroupTarget(row);
    queueMicrotask(syncGroupButtons);
  });

  for (const row of rows.querySelectorAll('[data-nav-item]')) normalizeGroupTarget(row);
  syncGroupButtons();
})();`;

export function navHtml(items, pages = []) {
  return `${baseNavHtml(items, pages)}<script>${menuPositionControlsScript}</script>`;
}
