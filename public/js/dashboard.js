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

  function insightBar(items) {
    const shown = items.filter(Boolean);
    if (!shown.length) return '';
    return shown.join('');
  }

  function insight(iconName, title, text, actionsHtml) {
    return `<div class="insight"><div class="stat-icon">${icon(iconName)}</div>` +
      `<div class="grow"><div class="title" style="font-weight:650">${title}</div><div class="small muted">${text}</div></div>` +
      `<div class="actions">${actionsHtml}</div></div>`;
  }

  function renderOwner(data) {
    const s = data.stats;
    const avg = s.avg_health;
    document.getElementById('stats').innerHTML =
      stat('car', '', 'Vehicles', s.vehicles, `${s.parked} parked or stored`) +
      stat('heart', avg === null ? '' : avg >= 80 ? 'good' : avg >= 55 ? 'warn' : 'bad', 'Average health',
        avg === null ? '—' : `${avg}/100`, avg === null ? 'Add a vehicle to see it' : avg >= 80 ? 'Fleet in good shape' : 'Some vehicles need care') +
      stat('alert', s.overdue ? 'bad' : 'warn', 'Open tasks', s.open_tasks,
        s.overdue ? `${s.overdue} overdue · ${s.due_this_week} due this week` : `${s.due_this_week} due in the next 7 days`) +
      stat('wallet', 'good', 'Spent this year', money(s.spend_this_year), s.pending_requests ? `${s.pending_requests} service request(s) awaiting reply` : 'Recorded maintenance costs');

    const worst = data.health[0];
    document.getElementById('insights').innerHTML = insightBar([
      worst && worst.health.score < 80
        ? insight('sparkles', `${esc(worst.make)} ${esc(worst.model)} needs attention (health ${esc(worst.health.score)}/100)`,
          esc(worst.health.reasons.join(' · ')),
          `<button type="button" class="btn btn-primary btn-sm" data-plan="${worst.id}">AI care plan</button>` +
          `<a class="btn btn-secondary btn-sm" href="/pages/assistant.html?vehicle_id=${worst.id}&ask=${encodeURIComponent(`What should I do first for my ${worst.make} ${worst.model}?`)}">Ask the assistant</a>`)
        : insight('sparkles', 'Your AI assistant', 'Ask what to do for a parked vehicle, or generate a care plan in one click.',
          '<a class="btn btn-secondary btn-sm" href="/pages/assistant.html">Open assistant</a>'),
      Number(s.pending_bids)
        ? insight('briefcase', `${esc(s.pending_bids)} bid${Number(s.pending_bids) === 1 ? '' : 's'} waiting on your jobs`,
          'Caretakers sent prices for your job posts. Compare them by rating, distance and price.',
          '<a class="btn btn-primary btn-sm" href="/pages/jobs.html">Compare bids</a>')
        : '',
      Number(s.tasks_to_rate)
        ? insight('star', `Rate ${esc(s.tasks_to_rate)} completed job${Number(s.tasks_to_rate) === 1 ? '' : 's'}`,
          'Your ratings help other owners pick a good caretaker.',
          '<a class="btn btn-secondary btn-sm" href="/pages/maintenance.html?status=completed">Rate now</a>')
        : ''
    ]);

    document.getElementById('upcoming').innerHTML = data.upcoming.length
      ? taskList(data.upcoming, false)
      : emptyState('check', 'No open maintenance tasks.',
        '<a class="btn btn-primary btn-sm" href="/pages/maintenance.html?new=1">Plan a task</a>');

    document.getElementById('parked').innerHTML = data.health.length
      ? '<ul class="list">' + data.health.map((v) =>
        `<li class="list-item"><div class="grow"><div class="title">${esc(v.make)} ${esc(v.model)}</div>` +
        `<div class="small muted">${esc(v.registration_number)}${v.health.reasons.length ? ` · ${esc(v.health.reasons.slice(0, 2).join(' · '))}` : ' · No problems found'}</div>` +
        `<div class="meter"><div style="width:${v.health.score}%;background:${v.health.score >= 80 ? 'var(--green)' : v.health.score >= 55 ? '#c27a00' : 'var(--red)'}"></div></div></div>` +
        `<div style="text-align:right">${App.healthBadge(v.health)}` +
        `${v.health.score < 80 ? `<div style="margin-top:6px"><button type="button" class="btn btn-ghost btn-sm" data-plan="${v.id}">AI plan</button></div>` : ''}</div></li>`).join('') + '</ul>'
      : emptyState('car', 'No vehicles yet.',
        '<a class="btn btn-primary btn-sm" href="/pages/vehicles.html?new=1">Add a vehicle</a>');
  }

  function renderCaretaker(data) {
    const s = data.stats;
    document.getElementById('stats').innerHTML =
      stat('clipboard', '', 'Open tasks', s.open_tasks, `${s.in_progress} in progress`) +
      stat('calendar', 'warn', 'Due this week', s.due_this_week, s.overdue ? `${s.overdue} overdue` : 'Next 7 days') +
      stat('check', 'good', 'Completed', s.completed_this_month, 'This month') +
      `<div class="card stat"><div class="stat-icon warn">${icon('star')}</div><div><div class="stat-label">Your rating</div>` +
      `<div class="stat-value" style="font-size:1.3rem">${s.avg_rating === null ? 'No reviews' : `${esc(s.avg_rating.toFixed(1))} ★`}</div>` +
      `<div class="stat-sub">${esc(s.review_count)} review${Number(s.review_count) === 1 ? '' : 's'}${s.review_count >= 3 && s.avg_rating >= 4.5 ? ' · Top rated' : ''}</div></div></div>`;

    document.getElementById('insights').innerHTML = s.has_location
      ? (Number(s.nearby_jobs)
        ? insight('briefcase', `${esc(s.nearby_jobs)} open job${Number(s.nearby_jobs) === 1 ? '' : 's'} near you`,
          'Owners in your service area are looking for a caretaker. Send your price.',
          '<a class="btn btn-primary btn-sm" href="/pages/jobs.html">Find jobs</a>')
        : '')
      : insight('pin', 'Set your service area to get jobs', 'Pick your base on the map and how far you travel. Owners and job posts nearby will then find you.',
        '<a class="btn btn-primary btn-sm" href="/pages/profile.html">Set service area</a>');

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
      `<li class="list-item"><div class="stat-icon" style="background:#ece7ff;color:#5b3fc4">${icon('sparkles')}</div><div class="grow">` +
      '<div class="title">AI assistant</div>' +
      '<div class="small muted">Plan your week or get inspection tips.</div></div>' +
      '<a class="btn btn-secondary btn-sm" href="/pages/assistant.html">Ask</a></li>' +
      '</ul>';
  }

  // "AI plan" buttons on the owner dashboard.
  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-plan]');
    if (!button || !window.CarePlan) return;
    try {
      const { vehicles } = await api.get('/api/vehicles');
      CarePlan.open({ vehicles, vehicleId: Number(button.dataset.plan), onCreated: () => load() });
    } catch (error) {
      App.toast(error.message, 'error');
    }
  });

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
