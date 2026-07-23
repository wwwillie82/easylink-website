import { pageForm as basePageForm, pagesTable as basePagesTable } from './pages.mjs';

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function jsonForHtml(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export const pageDeleteClientScript = String.raw`(() => {
  function messageBox() {
    let box = document.getElementById('msg');
    if (box) return box;
    box = document.createElement('div');
    box.id = 'msg';
    const host = document.querySelector('.admin-page') || document.querySelector('main') || document.body;
    host.insertAdjacentElement('afterbegin', box);
    return box;
  }

  function showMessage(text, ok = false) {
    const box = messageBox();
    box.querySelector('[data-message-kind="page-delete"]')?.remove();
    const message = document.createElement('p');
    message.className = 'msg ' + (ok ? 'ok' : 'err');
    message.dataset.messageKind = 'page-delete';
    message.textContent = String(text || '');
    box.appendChild(message);
    message.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function addListButtons() {
    const catalogNode = document.getElementById('page-delete-catalog');
    if (!catalogNode) return;
    let pages = [];
    try { pages = JSON.parse(catalogNode.textContent || '[]'); } catch { return; }
    for (const page of pages) {
      if (!page || page.route === '/' || page.type === 'home') continue;
      const href = '/admin/pages/' + page.id;
      const link = [...document.querySelectorAll('a[href="' + href + '"]')][0];
      if (!link || document.querySelector('[data-page-delete="' + page.id + '"]')) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'danger';
      button.dataset.pageDelete = String(page.id);
      button.dataset.pageTitle = String(page.title || '');
      button.textContent = 'Törlés';
      button.style.marginInlineStart = '.5rem';
      link.insertAdjacentElement('afterend', button);
    }
  }

  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-page-delete]');
    if (!button || button.disabled) return;
    const id = String(button.dataset.pageDelete || '');
    const title = String(button.dataset.pageTitle || '');
    if (!/^\\d+$/.test(id)) return;
    const confirmed = window.confirm(
      'Biztosan véglegesen törlöd a(z) „' + title + '” oldalt? ' +
      'Az oldal és minden hozzá tartozó tartalmi blokk törlődik az aktuális adatbázisból. ' +
      'A törlés után automatikus élesítés indul. Korábbi élesítés visszaállításával az oldal és blokkjai később újra létrehozhatók.'
    );
    if (!confirmed) return;
    button.disabled = true;
    try {
      const response = await fetch('/api/admin/pages/' + encodeURIComponent(id), { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        showMessage(result.error?.message || 'Az oldal törlése sikertelen.');
        return;
      }
      const publishOk = result.publish?.ok !== false;
      showMessage(
        publishOk
          ? 'Az oldal és a hozzá tartozó blokkok véglegesen törölve.'
          : 'Az oldal törölve, de az élesítés nem fejeződött be.',
        publishOk,
      );
      setTimeout(() => { window.location.href = '/admin/pages'; }, 900);
    } catch (error) {
      showMessage(error?.message || 'Az oldal törlése sikertelen.');
    } finally {
      button.disabled = false;
    }
  });

  addListButtons();
})();`;

export function pageForm(data) {
  const page = data?.page || {};
  const protectedHome = String(page.route || '') === '/' || String(page.type || '') === 'home';
  const deleteZone = protectedHome
    ? '<section class="admin-section" data-page-delete-zone><header class="admin-section-header"><h3>Oldal törlése</h3></header><p class="hint">A főoldal nem törölhető.</p></section>'
    : `<section class="admin-section" data-page-delete-zone><header class="admin-section-header"><h3>Oldal törlése</h3></header><p class="hint">A törlés csak akkor engedélyezett, ha egyetlen menüpont vagy más aktív tartalom sem hivatkozik az oldalra, és legfeljebb egy nem archivált saját tartalmi blokk maradt.</p><button type="button" class="danger" data-page-delete="${esc(page.id)}" data-page-title="${esc(page.title)}">Törlés</button></section>`;
  return `${basePageForm(data)}${deleteZone}<script>${pageDeleteClientScript}</script>`;
}

export function pagesTable(pages = []) {
  const catalog = pages.map((page) => ({ id: Number(page.id), title: page.title || '', route: page.route || '', type: page.type || '' }));
  return `${basePagesTable(pages)}<script type="application/json" id="page-delete-catalog">${jsonForHtml(catalog)}</script><script>${pageDeleteClientScript}</script>`;
}
