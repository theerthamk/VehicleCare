// Dashboard for both roles (owner.html and caretaker.html).
(function () {
  'use strict';

  const { esc, icon, money, fmtDate, badge, dateChip, relativeDue, emptyState } = App;
  const pageRole = document.body.dataset.rolePage; // "owner" or "caretaker"

  function greeting(name) {
    const h = new Date().getHours();
    const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    return `${part}, ${String(name).split(' ')[0]}`;
  }

  function stat(iconName, tone, label, value, sub) {
    return `<div class="card stat"><div class="stat-icon ${tone}">${icon(iconName)}</div>` +
      `<div><div class="stat-label">${esc(label)}</div><div class="stat-value">${esc(value)}</div>` +
      `${sub ? `<div class="stat-sub">${esc(sub)}</div>` : ''}</div></div>`;
  }

  function taskList(tasks, showOwner) {
    if (!tasks.length) {
      return emptyState('check', 'No open maintenance tasks. Everything is up to date.');
    }
    return '<ul class="list">' + tasks.map((t) => {
      const late = Number(t.is_overdue) === 1;
      const who = showOwner
        ? `Owner: ${esc(t.owner_name)}${t.location ? ` · ${esc(t.location)}` : ''}`
        : (t.assignee_name ? `Caretaker: ${esc(t.assignee_name)}` : 'Not assigned');
      return `<li class="list-item">${dateChip(t.due_date, late)}` +
        `<div class="grow"><div class="title">${esc(t.title)}</div>` +
        `<div class="small muted">${esc(t.make)} ${esc(t.model)} · ${esc(t.registration_number)}</div>` +
        `<div class="small muted">${who}</div></div>` +
        `<div style="text-align:right">${badge(t.priority)}<div class="small ${late ? '' : 'muted'}" style="${late ? 'color:var(--red)' : ''}">${esc(relativeDue(t.due_date))}</div></div></li>`;
    }).join('') + '</ul>';
  }

  function renderOwner(data) {
    const s = data.stats;
    document.getElementById('stats').innerHTML =
      stat('car', '', 'Vehicles', s.vehicles, `${s.parked} parked or stored`) +
      stat('wrench', 'warn', 'Open tasks', s.open_tasks, `${s.due_this_week} due in the next 7 days`) +
      stat('alert', s.overdue ? 'bad' : 'good', 'Overdue', s.overdue, s.overdue ? 'Needs attention' : 'Nothing overdue') +
      stat('wallet', 'good', 'Spent this year', money(s.spend_this_year), s.pending_requests ? `${s.pending_requests} service request(s) awaiting reply` : 'Recorded maintenance costs');

    document.getElementById('upcoming').innerHTML = data.upcoming.length
      ? taskList(data.upcoming, false)
      : emptyState('check', 'No open maintenance tasks.',
        '<a class="btn btn-primary btn-sm" href="/pages/maintenance.html?new=1">Plan a task</a>');

    const parked = data.longest_parked;
    document.getElementById('parked').innerHTML = parked.length
      ? '<ul class="list">' + parked.map((v) =>
        `<li class="list-item"><div class="stat-icon">${icon('parking')}</div>` +
        `<div class="grow"><div class="title">${esc(v.make)} ${esc(v.model)}</div>` +
        `<div class="small muted">${esc(v.registration_number)}${v.location ? ` · ${esc(v.location)}` : ''}</div></div>` +
        `<div style="text-align:right"><strong>${esc(v.days_parked)} days</strong>` +
        `<div class="small muted">since ${esc(fmtDate(v.parked_since))}</div></div></li>`).join('') + '</ul>'
      : emptyState('car', 'No parked vehicles yet.',
        '<a class="btn btn-primary btn-sm" href="/pages/vehicles.html?new=1">Add a vehicle</a>');
  }

  function renderCaretaker(data) {
    const s = data.stats;
    document.getElementById('stats').innerHTML =
      stat('clipboard', '', 'Open tasks', s.open_tasks, `${s.in_progress} in progress`) +
      stat('calendar', 'warn', 'Due this week', s.due_this_week, 'Next 7 days') +
      stat('alert', s.overdue ? 'bad' : 'good', 'Overdue', s.overdue, s.overdue ? 'Needs attention' : 'Nothing overdue') +
      stat('check', 'good', 'Completed', s.completed_this_month, 'This month');

    document.getElementById('upcoming').innerHTML = taskList(data.upcoming, true);

    document.getElementById('glance').innerHTML =
      '<ul class="list">' +
      `<li class="list-item"><div class="stat-icon warn">${icon('inbox')}</div><div class="grow">` +
      `<div class="title">${esc(s.pending_requests)} new service request(s)</div>` +
      '<div class="small muted">Accept or decline requests from owners.</div></div>' +
      '<a class="btn btn-secondary btn-sm" href="/pages/services.html">Review</a></li>' +
      `<li class="list-item"><div class="stat-icon">${icon('car')}</div><div class="grow">` +
      `<div class="title">${esc(s.vehicles)} vehicle(s) with open work</div>` +
      '<div class="small muted">Vehicles you are currently looking after.</div></div>' +
      '<a class="btn btn-secondary btn-sm" href="/pages/vehicles.html">View</a></li>' +
      `<li class="list-item"><div class="stat-icon good">${icon('wallet')}</div><div class="grow">` +
      `<div class="title">${esc(money(s.billed_this_month))} billed this month</div>` +
      '<div class="small muted">Total cost of the work you recorded.</div></div>' +
      '<a class="btn btn-secondary btn-sm" href="/pages/history.html">Details</a></li>' +
      '</ul>';
  }

  async function load() {
    const user = await App.init({ page: 'dashboard', title: 'Dashboard', roles: [pageRole] });
    document.getElementById('greeting').textContent = greeting(user.full_name);
    try {
      const data = await api.get('/api/dashboard');
      if (data.role === 'owner') renderOwner(data);
      else renderCaretaker(data);
    } catch (error) {
      document.getElementById('stats').innerHTML = `<div class="card card-body" style="grid-column:1/-1">${emptyState('alert', error.message)}</div>`;
      document.getElementById('upcoming').innerHTML = '';
      const other = document.getElementById('parked') || document.getElementById('glance');
      other.innerHTML = '';
    }
  }

  load();
})();
