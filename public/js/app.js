// Shared app shell: session check, navigation, and UI helpers used by every page.
(function () {
  'use strict';

  // ---------- Icons (24x24 stroke icons) ----------
  const ICON_PATHS = {
    logo: '<path d="M5 16h14M5.5 16 7 10.5A2 2 0 0 1 8.9 9h6.2a2 2 0 0 1 1.9 1.5L18.5 16"/><path d="M3 16v2a1 1 0 0 0 1 1h1M21 16v2a1 1 0 0 1-1 1h-1"/><circle cx="7.5" cy="16.5" r="1.5"/><circle cx="16.5" cy="16.5" r="1.5"/><path d="m9.5 4.5 2 2 3.5-3.5"/>',
    dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    car: '<path d="M5 16h14M5.5 16 7 10.5A2 2 0 0 1 8.9 9h6.2a2 2 0 0 1 1.9 1.5L18.5 16"/><path d="M3 16v2a1 1 0 0 0 1 1h1M21 16v2a1 1 0 0 1-1 1h-1"/><circle cx="7.5" cy="16.5" r="1.5"/><circle cx="16.5" cy="16.5" r="1.5"/>',
    wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3.5 17.3a1.8 1.8 0 0 0 2.5 2.5l5.8-5.8a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.3-.4-.4-2.3 2.6-2.6Z"/>',
    handshake: '<path d="M8 12h.01M12 12h.01M16 12h.01"/><path d="M21 12a9 9 0 1 1-3.4-7"/><path d="M21 4v5h-5"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    wallet: '<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-4a2 2 0 0 0 0 4h4v3a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1Z"/>',
    parking: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/>',
    clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>'
  };

  function icon(name, extraClass) {
    return `<svg class="${extraClass || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ` +
      `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name] || ''}</svg>`;
  }

  // ---------- Navigation per role ----------
  const NAV = {
    owner: [
      { key: 'dashboard', href: '/pages/owner.html', label: 'Dashboard', icon: 'dashboard' },
      { key: 'vehicles', href: '/pages/vehicles.html', label: 'My Vehicles', icon: 'car' },
      { key: 'maintenance', href: '/pages/maintenance.html', label: 'Maintenance', icon: 'wrench' },
      { key: 'services', href: '/pages/services.html', label: 'Service Providers', icon: 'handshake' },
      { key: 'history', href: '/pages/history.html', label: 'History & Expenses', icon: 'history' },
      { key: 'notifications', href: '/pages/notifications.html', label: 'Notifications', icon: 'bell' },
      { key: 'profile', href: '/pages/profile.html', label: 'Profile', icon: 'user' }
    ],
    caretaker: [
      { key: 'dashboard', href: '/pages/caretaker.html', label: 'Dashboard', icon: 'dashboard' },
      { key: 'maintenance', href: '/pages/maintenance.html', label: 'My Tasks', icon: 'clipboard' },
      { key: 'vehicles', href: '/pages/vehicles.html', label: 'Assigned Vehicles', icon: 'car' },
      { key: 'services', href: '/pages/services.html', label: 'Service Requests', icon: 'handshake' },
      { key: 'history', href: '/pages/history.html', label: 'Completed Work', icon: 'history' },
      { key: 'notifications', href: '/pages/notifications.html', label: 'Notifications', icon: 'bell' },
      { key: 'profile', href: '/pages/profile.html', label: 'Provider Profile', icon: 'user' }
    ]
  };

  const HOME = { owner: '/pages/owner.html', caretaker: '/pages/caretaker.html' };

  // ---------- Formatting ----------
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Parses "YYYY-MM-DD" or "YYYY-MM-DD HH:MM:SS" as a local date (no time-zone shift).
  function parseDate(value) {
    if (!value) return null;
    const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
  }

  function fmtDate(value) {
    const d = parseDate(value);
    return d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : '—';
  }

  function fmtDateTime(value) {
    const d = parseDate(value);
    if (!d) return '—';
    const h = d.getHours();
    const time = `${((h + 11) % 12) + 1}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
    return `${fmtDate(value)}, ${time}`;
  }

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function daysUntil(value) {
    const d = parseDate(value);
    if (!d) return null;
    const t = parseDate(today());
    return Math.round((d - t) / 86400000);
  }

  function relativeDue(value) {
    const n = daysUntil(value);
    if (n === null) return '';
    if (n === 0) return 'Due today';
    if (n === 1) return 'Due tomorrow';
    if (n > 1) return `Due in ${n} days`;
    return n === -1 ? '1 day overdue' : `${-n} days overdue`;
  }

  const moneyFormat = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
  function money(value) {
    return moneyFormat.format(Number(value) || 0);
  }

  const BADGE_COLORS = {
    active: 'green', parked: 'blue', stored: 'blue', in_service: 'amber',
    pending: 'amber', in_progress: 'blue', completed: 'green', cancelled: '',
    accepted: 'blue', declined: 'red',
    high: 'red', medium: 'amber', low: '',
    overdue: 'red', inspection: 'blue', maintenance: 'green'
  };
  function badge(value, label) {
    const text = label || String(value).replace(/_/g, ' ');
    return `<span class="badge ${BADGE_COLORS[value] || ''}">${esc(text)}</span>`;
  }

  function dateChip(value, late) {
    const d = parseDate(value);
    if (!d) return '';
    return `<div class="date-chip${late ? ' late' : ''}"><div class="d">${d.getDate()}</div><div class="m">${MONTHS[d.getMonth()]}</div></div>`;
  }

  function vehicleName(v) {
    return `${v.make} ${v.model}`;
  }

  function emptyState(iconName, text, actionHtml) {
    return `<div class="empty">${icon(iconName)}<div>${esc(text)}</div>${actionHtml || ''}</div>`;
  }

  function initials(name) {
    return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
  }

  // ---------- Toasts ----------
  function toast(message, type) {
    let box = document.getElementById('toasts');
    if (!box) {
      box = document.createElement('div');
      box.id = 'toasts';
      box.className = 'toasts';
      box.setAttribute('aria-live', 'polite');
      document.body.appendChild(box);
    }
    const el = document.createElement('div');
    el.className = `toast ${type || ''}`;
    el.textContent = message;
    box.appendChild(el);
    setTimeout(() => el.remove(), type === 'error' ? 6000 : 3500);
  }

  // ---------- Dialogs ----------
  function openDialog(dialog) {
    if (!dialog.open) dialog.showModal();
    const first = dialog.querySelector('input:not([type=hidden]):not([disabled]), select, textarea');
    if (first) first.focus();
  }

  function closeDialog(dialog) {
    if (dialog.open) dialog.close();
  }

  // Every element with data-close inside a dialog closes it.
  document.addEventListener('click', (event) => {
    const closer = event.target.closest('[data-close]');
    if (closer) {
      const dialog = closer.closest('dialog');
      if (dialog) closeDialog(dialog);
    }
  });

  let confirmDialog;
  function confirmAction(message, options) {
    const opts = Object.assign({ title: 'Please confirm', confirmText: 'Confirm', danger: false }, options);
    if (!confirmDialog) {
      confirmDialog = document.createElement('dialog');
      confirmDialog.className = 'small';
      confirmDialog.innerHTML =
        '<div class="dialog-head"><h2 data-role="title"></h2></div>' +
        '<div class="dialog-body"><p data-role="message"></p></div>' +
        '<div class="dialog-foot"><button type="button" class="btn btn-ghost" data-role="cancel">Cancel</button>' +
        '<button type="button" class="btn" data-role="ok"></button></div>';
      document.body.appendChild(confirmDialog);
    }
    confirmDialog.querySelector('[data-role=title]').textContent = opts.title;
    confirmDialog.querySelector('[data-role=message]').textContent = message;
    const ok = confirmDialog.querySelector('[data-role=ok]');
    ok.textContent = opts.confirmText;
    ok.className = `btn ${opts.danger ? 'btn-danger' : 'btn-primary'}`;

    return new Promise((resolve) => {
      const finish = (answer) => {
        ok.removeEventListener('click', onOk);
        cancel.removeEventListener('click', onCancel);
        confirmDialog.removeEventListener('close', onCancel);
        closeDialog(confirmDialog);
        resolve(answer);
      };
      const cancel = confirmDialog.querySelector('[data-role=cancel]');
      const onOk = () => finish(true);
      const onCancel = () => finish(false);
      ok.addEventListener('click', onOk);
      cancel.addEventListener('click', onCancel);
      confirmDialog.addEventListener('close', onCancel);
      confirmDialog.showModal();
      cancel.focus();
    });
  }

  // ---------- Forms ----------
  function formValues(form) {
    const values = {};
    Array.from(form.elements).forEach((el) => {
      if (!el.name || el.disabled) return;
      if (el.type === 'checkbox') values[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) values[el.name] = el.value; }
      else if (el.type === 'password') values[el.name] = el.value; // never alter passwords
      else values[el.name] = el.value.trim();
    });
    return values;
  }

  function fillForm(form, data) {
    Array.from(form.elements).forEach((el) => {
      if (!el.name || !(el.name in data)) return;
      const value = data[el.name];
      if (el.type === 'checkbox') el.checked = Boolean(value);
      else if (el.type === 'radio') el.checked = String(value) === el.value;
      else el.value = value === null || value === undefined ? '' : String(value);
    });
  }

  function clearErrors(form) {
    form.querySelectorAll('.field.invalid').forEach((f) => f.classList.remove('invalid'));
    form.querySelectorAll('.field-error').forEach((e) => { e.textContent = ''; });
    const alertBox = form.querySelector('.form-alert');
    if (alertBox) alertBox.textContent = '';
  }

  // Shows server or client validation errors next to the matching fields.
  function showErrors(form, error) {
    clearErrors(form);
    let shownInline = false;
    const details = error && error.details;
    if (details && typeof details === 'object') {
      Object.entries(details).forEach(([name, message]) => {
        const input = form.elements[name];
        const field = input && (input.closest ? input.closest('.field') : null);
        if (field) {
          field.classList.add('invalid');
          const slot = field.querySelector('.field-error');
          if (slot) slot.textContent = message;
          shownInline = true;
        }
      });
    }
    const alertBox = form.querySelector('.form-alert');
    if (alertBox && (!shownInline || !details)) alertBox.textContent = error.message;
    else if (!alertBox && !shownInline) toast(error.message, 'error');
    const firstBad = form.querySelector('.field.invalid input, .field.invalid select, .field.invalid textarea');
    if (firstBad) firstBad.focus();
  }

  // Runs the browser's own validation, mapping messages into our error slots.
  function checkForm(form) {
    clearErrors(form);
    let ok = true;
    Array.from(form.elements).forEach((el) => {
      if (!el.willValidate || el.checkValidity()) return;
      ok = false;
      const field = el.closest('.field');
      if (field) {
        field.classList.add('invalid');
        const slot = field.querySelector('.field-error');
        if (slot) slot.textContent = el.validationMessage;
      }
    });
    if (!ok) {
      const firstBad = form.querySelector('.field.invalid input, .field.invalid select, .field.invalid textarea');
      if (firstBad) firstBad.focus();
    }
    return ok;
  }

  function setBusy(button, busy, busyText) {
    if (!button) return;
    if (busy) {
      button.dataset.label = button.innerHTML;
      button.disabled = true;
      button.textContent = busyText || 'Saving…';
    } else {
      button.disabled = false;
      if (button.dataset.label) button.innerHTML = button.dataset.label;
    }
  }

  // Wires a form: validation, busy button, error display. onSubmit gets the values.
  function bindForm(form, onSubmit) {
    form.setAttribute('novalidate', '');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!checkForm(form)) return;
      const button = form.querySelector('[type=submit]') ||
        (form.id && document.querySelector(`[type=submit][form="${form.id}"]`));
      setBusy(button, true);
      try {
        await onSubmit(formValues(form));
      } catch (error) {
        showErrors(form, error);
      } finally {
        setBusy(button, false);
      }
    });
  }

  // ---------- Shell ----------
  let currentUser = null;

  // Adds the icon named in data-icon="..." to the start of each element.
  function applyIcons(root) {
    (root || document).querySelectorAll('[data-icon]').forEach((el) => {
      if (!el.querySelector(':scope > svg')) el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon));
    });
  }

  function renderShell(user, pageKey, title) {
    const items = NAV[user.role] || [];
    const sidebar = document.getElementById('sidebar');
    sidebar.innerHTML =
      `<a class="brand" href="${HOME[user.role]}"><span class="brand-mark">${icon('logo')}</span>VehicleCare</a>` +
      '<ul class="nav">' +
      items.map((item) =>
        `<li><a href="${item.href}" class="${item.key === pageKey ? 'active' : ''}"` +
        `${item.key === pageKey ? ' aria-current="page"' : ''}>${icon(item.icon)}<span>${esc(item.label)}</span>` +
        `${item.key === 'notifications' ? '<span class="count hidden" data-unread-count></span>' : ''}</a></li>`
      ).join('') +
      '</ul>' +
      `<div class="sidebar-foot"><div class="who">${esc(user.full_name)}</div>` +
      `<div class="role">${user.role === 'owner' ? 'Vehicle owner' : 'Caretaker / provider'}</div></div>`;

    const topbar = document.getElementById('topbar');
    topbar.innerHTML =
      `<button type="button" class="icon-btn menu-btn" id="menuBtn" aria-label="Open menu">${icon('menu')}</button>` +
      `<div class="page-title">${esc(title)}</div><div class="spacer"></div>` +
      `<a class="icon-btn" href="/pages/notifications.html" aria-label="Notifications">${icon('bell')}` +
      '<span class="dot hidden" data-unread-dot></span></a>' +
      `<button type="button" class="btn btn-ghost" id="logoutBtn">${icon('logout')}<span>Log out</span></button>`;

    document.getElementById('menuBtn').addEventListener('click', () => document.body.classList.toggle('nav-open'));
    document.body.addEventListener('click', (event) => {
      if (document.body.classList.contains('nav-open') &&
          !event.target.closest('#sidebar') && !event.target.closest('#menuBtn')) {
        document.body.classList.remove('nav-open');
      }
    });
    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.title = `${title} · VehicleCare`;
  }

  async function logout() {
    try {
      await api.post('/api/auth/logout');
    } catch (error) {
      // Even if the server is unreachable, leave the app.
    }
    window.location.href = '/index.html';
  }

  function setUnread(count) {
    document.querySelectorAll('[data-unread-count], [data-unread-dot]').forEach((el) => {
      el.textContent = count > 99 ? '99+' : String(count);
      el.classList.toggle('hidden', !count);
    });
  }

  async function refreshUnread() {
    try {
      const data = await api.get('/api/notifications?unread=1');
      setUnread(data.unread);
    } catch (error) {
      // Badge is non-essential; ignore failures.
    }
  }

  /**
   * Call at the top of every app page.
   *   const user = await App.init({ page: 'vehicles', title: 'Vehicles', roles: ['owner', 'caretaker'] });
   * Redirects to login if not signed in, or to the user's dashboard if the role is not allowed.
   */
  async function init({ page, title, roles }) {
    api.onUnauthorized = () => {
      const next = encodeURIComponent(location.pathname + location.search);
      window.location.replace(`/index.html?next=${next}`);
    };

    let user;
    try {
      ({ user } = await api.get('/api/auth/me'));
    } catch (error) {
      if (error.status === 401) return new Promise(() => {}); // redirecting
      document.getElementById('content').hidden = false;
      document.getElementById('content').innerHTML =
        `<div class="card card-body">${emptyState('alert', error.message)}</div>`;
      throw error;
    }

    if (roles && !roles.includes(user.role)) {
      window.location.replace(HOME[user.role]);
      return new Promise(() => {});
    }

    currentUser = user;
    const pageTitle = typeof title === 'function' ? title(user) : title;
    renderShell(user, page, pageTitle);
    applyIcons(document);
    document.getElementById('content').hidden = false;
    refreshUnread();
    setInterval(refreshUnread, 60000);
    return user;
  }

  // ---------- Service worker ----------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('Service worker not registered:', err));
    });
  }

  window.App = {
    init,
    icon,
    applyIcons,
    esc,
    fmtDate,
    fmtDateTime,
    parseDate,
    today,
    daysUntil,
    relativeDue,
    money,
    badge,
    dateChip,
    vehicleName,
    emptyState,
    initials,
    toast,
    openDialog,
    closeDialog,
    confirm: confirmAction,
    formValues,
    fillForm,
    showErrors,
    clearErrors,
    bindForm,
    refreshUnread,
    setUnread,
    HOME,
    get user() { return currentUser; }
  };
})();
