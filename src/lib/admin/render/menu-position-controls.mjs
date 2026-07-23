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

  function rowTitle(row) {
    return row.querySelector('[data-header-title]')?.textContent?.trim() || 'Új menüpont';
  }

  function findRow(key) {
    if (!key) return null;
    return [...rows.querySelectorAll('[data-nav-item]')].find((row) => rowKey(row) === key) || null;
  }

  function directChildren(row) {
    const key = rowKey(row);
    return [...rows.querySelectorAll('[data-nav-item]')].filter((candidate) => parentKey(candidate) === key);
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

  function showDeleteMessage(text, ok = false) {
    const box = document.getElementById('msg');
    if (!box) return;
    box.querySelector('[data-message-kind="menu-delete"]')?.remove();
    const message = document.createElement('p');
    message.className = 'msg ' + (ok ? 'ok' : 'err');
    message.dataset.messageKind = 'menu-delete';
    message.textContent = String(text || '');
    box.appendChild(message);
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

  function syncRowButtons() {
    for (const row of rows.querySelectorAll('[data-nav-item]')) {
      const groupMode = row.querySelector('[data-mode="group"]');
      if (groupMode) {
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
        const childButton = holder.querySelector('[data-add-child]');
        if (childButton) {
          childButton.disabled = archived;
          childButton.title = archived ? 'Archivált csoporthoz nem hozható létre új gyermek.' : '';
        }
      }
      const actions = row.querySelector(':scope > .admin-field-actions');
      if (actions && !actions.querySelector('[data-delete-navigation]')) {
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'danger';
        deleteButton.dataset.deleteNavigation = '1';
        deleteButton.textContent = 'Törlés';
        actions.appendChild(deleteButton);
      }
    }
  }

  function showParentMoveFeedback(row) {
    const parentRef = parentKey(row);
    const parentRow = findRow(parentRef);
    const box = document.getElementById('msg');
    if (!box) return;
    box.querySelector('[data-message-kind="menu-parent-move"]')?.remove();
    const message = document.createElement('p');
    message.className = 'msg';
    message.dataset.messageKind = 'menu-parent-move';
    message.setAttribute('role', 'status');
    message.setAttribute('aria-live', 'polite');
    message.style.background = '#fff4cc';
    message.style.color = '#5d4300';
    message.style.border = '1px solid #d8b85a';
    message.textContent = parentRow
      ? 'A(z) „' + rowTitle(row) + '” menüpont átkerült a(z) „' + rowTitle(parentRow) + '” csoport alá.'
      : 'A(z) „' + rowTitle(row) + '” menüpont átkerült a legfelső szintre.';
    box.appendChild(message);
    queueMicrotask(() => {
      row.scrollIntoView({ block: 'center', behavior: 'smooth' });
      row.querySelector('[data-role="parent-select"]')?.focus({ preventScroll: true });
      row.animate?.([
        { outline: '3px solid #d8b85a', outlineOffset: '3px' },
        { outline: '0 solid transparent', outlineOffset: '0' },
      ], { duration: 1600, easing: 'ease-out' });
    });
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
    newRow.dataset.suppressParentMoveFeedback = '1';
    parentSelect?.dispatchEvent(new Event('change', { bubbles: true }));
    syncRowButtons();
    newRow.scrollIntoView({ block: 'center' });
    newRow.querySelector('[data-role="target-type"]')?.focus();
  }

  function removeUnsavedRow(row) {
    const parentRef = parentKey(row);
    row.remove();
    setSiblingOrder(siblingRows(parentRef));
    form.dispatchEvent(new Event('input', { bubbles: true }));
    syncRowButtons();
    showDeleteMessage('A még nem mentett menüpont eltávolítva.', true);
  }

  async function deleteSavedRow(row, button) {
    const id = row.querySelector('[data-field="id"]')?.value || '';
    const submit = form.querySelector('button[type="submit"]');
    if (submit && !submit.disabled) {
      showDeleteMessage('A törlés előtt mentsd el vagy vond vissza a többi módosítást.');
      return;
    }
    button.disabled = true;
    try {
      const response = await fetch('/api/admin/navigation/' + encodeURIComponent(id), { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        showDeleteMessage(result.error?.message || 'A menüpont törlése sikertelen.');
        return;
      }
      row.remove();
      const publishOk = result.publish?.ok !== false;
      showDeleteMessage(publishOk ? 'A menüpont véglegesen törölve.' : 'A menüpont törölve, de az élesítés nem fejeződött be.', publishOk);
      setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      showDeleteMessage(error?.message || 'A menüpont törlése sikertelen.');
    } finally {
      button.disabled = false;
    }
  }

  topButton.onclick = () => addRow('', 'start');
  bottomButton.onclick = () => addRow('', 'end');

  rows.addEventListener('click', async (event) => {
    const deleteButton = event.target.closest('[data-delete-navigation]');
    if (deleteButton) {
      const row = deleteButton.closest('[data-nav-item]');
      if (!row) return;
      if (directChildren(row).length) {
        showDeleteMessage('A menüpont nem törölhető, amíg gyermek menüpont tartozik alá.');
        return;
      }
      if (!window.confirm('Biztosan véglegesen törlöd a(z) „' + rowTitle(row) + '” menüpontot? Korábbi élesítés visszaállításával később újra létrehozható.')) return;
      const id = row.querySelector('[data-field="id"]')?.value || '';
      if (!id) removeUnsavedRow(row);
      else await deleteSavedRow(row, deleteButton);
      return;
    }
    const addButton = event.target.closest('[data-add-child]');
    if (!addButton || addButton.disabled) return;
    const parentRow = addButton.closest('[data-nav-item]');
    if (!parentRow) return;
    addRow(rowKey(parentRow), 'end');
  });

  rows.addEventListener('change', (event) => {
    const row = event.target.closest('[data-nav-item]');
    if (!row) return;
    if (event.target.matches('[data-role="target-type"]')) normalizeGroupTarget(row);
    if (event.target.matches('[data-role="parent-select"]')) {
      if (row.dataset.suppressParentMoveFeedback === '1') delete row.dataset.suppressParentMoveFeedback;
      else showParentMoveFeedback(row);
    }
    queueMicrotask(syncRowButtons);
  });

  for (const row of rows.querySelectorAll('[data-nav-item]')) normalizeGroupTarget(row);
  syncRowButtons();
})();`;

export function navHtml(items, pages = []) {
  return `${baseNavHtml(items, pages)}<script>${menuPositionControlsScript}</script>`;
}
