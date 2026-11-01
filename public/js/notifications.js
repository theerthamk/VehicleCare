// Notifications list: read one, open its link, or mark everything read.
(function () {
  'use strict';

  const { esc, fmtDateTime, emptyState } = App;
  const list = document.getElementById('list');
  let items = [];
  let unreadOnly = '';

  // Only follow links that point inside the app.
  const safeLink = (link) => (typeof link === 'string' && link.startsWith('/pages/') ? link : null);

  function render() {
    if (!items.length) {
      list.innerHTML = emptyState('bell', unreadOnly ? 'You are all caught up.' : 'No notifications yet.');
      return;
    }
    list.innerHTML = items.map((n) => {
      const link = safeLink(n.link);
      return `<div class="notice-item${n.read_at ? '' : ' unread'}"><span class="pin" aria-hidden="true"></span>` +
        `<div style="flex:1;min-width:0"><div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">` +
        `<strong>${esc(n.title)}</strong><span class="small muted">${esc(fmtDateTime(n.created_at))}</span></div>` +
        `<div class="small" style="margin-top:2px">${esc(n.message)}</div>` +
        '<div class="actions" style="margin-top:8px">' +
        (link ? `<button type="button" class="btn btn-secondary btn-sm" data-action="open" data-id="${n.id}">View</button>` : '') +
        (n.read_at ? '' : `<button type="button" class="btn btn-ghost btn-sm" data-action="read" data-id="${n.id}">Mark as read</button>`) +
        '</div></div></div>';
    }).join('');
  }

  async function load() {
    try {
      const data = await api.get(api.url('/api/notifications', { unread: unreadOnly }));
      items = data.notifications;
      App.setUnread(data.unread);
      document.getElementById('readAllBtn').disabled = !data.unread;
      render();
    } catch (error) {
      list.innerHTML = emptyState('alert', error.message);
    }
  }

  list.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const n = items.find((x) => String(x.id) === button.dataset.id);
    if (!n) return;
    try {
      if (!n.read_at) await api.patch(`/api/notifications/${n.id}/read`);
      if (button.dataset.action === 'open') {
        window.location.href = safeLink(n.link);
        return;
      }
      await load();
    } catch (error) {
      App.toast(error.message, 'error');
    }
  });

  document.getElementById('readAllBtn').addEventListener('click', async () => {
    try {
      await api.patch('/api/notifications/read-all');
      App.toast('All notifications marked as read.', 'success');
      await load();
    } catch (error) {
      App.toast(error.message, 'error');
    }
  });

  document.getElementById('filterTabs').addEventListener('click', (event) => {
    const tab = event.target.closest('.tab');
    if (!tab) return;
    document.querySelectorAll('#filterTabs .tab').forEach((t) => t.classList.toggle('active', t === tab));
    unreadOnly = tab.dataset.unread;
    load();
  });

  (async function start() {
    await App.init({ page: 'notifications', title: 'Notifications', roles: ['owner', 'caretaker'] });
    await load();
  })();
})();
