// History & expenses (owner) / completed work (caretaker).
(function () {
  'use strict';

  const { esc, badge, fmtDate, money, emptyState, icon } = App;
  const filterForm = document.getElementById('filterForm');
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let user;

  function filters() {
    const v = App.formValues(filterForm);
    return { vehicle_id: v.vehicle_id, from: v.from, to: v.to };
  }

  function renderSummary(exp, records) {
    const owner = user.role === 'owner';
    const vehiclesCount = exp.by_vehicle.length;
    const avg = exp.records ? exp.total / exp.records : 0;
    const last = records[0];
    const box = (iconName, tone, label, value, sub) =>
      `<div class="card stat"><div class="stat-icon ${tone}">${icon(iconName)}</div><div>` +
      `<div class="stat-label">${esc(label)}</div><div class="stat-value">${esc(value)}</div>` +
      `<div class="stat-sub">${esc(sub)}</div></div></div>`;
    document.getElementById('summary').innerHTML =
      box('wallet', 'good', owner ? 'Total spent' : 'Total billed', money(exp.total), `${exp.records} record(s)`) +
      box('car', '', 'Vehicles', vehiclesCount, `Average ${money(avg)} per record`) +
      box('calendar', 'warn', 'Most recent', last ? fmtDate(last.service_date) : '—', last ? `${last.make} ${last.model}` : 'No records yet');
  }

  function renderByVehicle(rows) {
    const el = document.getElementById('byVehicle');
    if (!rows.length) {
      el.innerHTML = emptyState('car', 'No costs recorded for this selection.');
      return;
    }
    el.innerHTML = '<table><thead><tr><th>Vehicle</th><th class="num">Records</th><th>Last service</th><th class="num">Total</th></tr></thead><tbody>' +
      rows.map((r) => `<tr><td><div class="primary">${esc(r.make)} ${esc(r.model)}</div><div class="secondary">${esc(r.registration_number)}</div></td>` +
        `<td data-label="Records" class="num">${esc(r.records)}</td>` +
        `<td data-label="Last service" class="nowrap">${esc(fmtDate(r.last_service))}</td>` +
        `<td data-label="Total" class="num"><strong>${esc(money(r.total))}</strong></td></tr>`).join('') +
      '</tbody></table>';
  }

  function renderByMonth(rows) {
    // Build the last 12 months so empty months still show.
    const totals = Object.fromEntries(rows.map((r) => [r.month, Number(r.total)]));
    const months = [];
    const d = new Date();
    d.setDate(1);
    for (let i = 11; i >= 0; i -= 1) {
      const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
      const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
      months.push({ key, label: `${MONTHS[m.getMonth()]} ${String(m.getFullYear()).slice(2)}`, total: totals[key] || 0 });
    }
    const max = Math.max(...months.map((m) => m.total));
    const el = document.getElementById('byMonth');
    if (!max) {
      el.innerHTML = emptyState('history', 'No costs in the last 12 months.');
      return;
    }
    el.innerHTML = '<div class="bars">' + months.map((m) =>
      `<div class="bar-row"><span class="muted">${esc(m.label)}</span>` +
      `<div class="bar-track" role="img" aria-label="${esc(m.label)}: ${esc(money(m.total))}"><div class="bar-fill" style="width:${(m.total / max) * 100}%"></div></div>` +
      `<span class="num">${esc(money(m.total))}</span></div>`).join('') + '</div>';
  }

  function renderRecords(records) {
    const el = document.getElementById('records');
    if (!records.length) {
      el.innerHTML = emptyState('history', user.role === 'owner'
        ? 'No maintenance has been recorded yet. Completed tasks appear here.'
        : 'You have not recorded any work yet.');
      return;
    }
    el.innerHTML = '<table><thead><tr><th>Date</th><th>Vehicle</th><th>Type</th><th>Work</th><th>By</th><th class="num">Cost</th></tr></thead><tbody>' +
      records.map((r) => `<tr><td class="nowrap"><strong>${esc(fmtDate(r.service_date))}</strong></td>` +
        `<td data-label="Vehicle">${esc(r.make)} ${esc(r.model)}<div class="secondary">${esc(r.registration_number)}</div></td>` +
        `<td data-label="Type">${badge(r.record_type)}</td>` +
        `<td data-label="Work"><div>${esc(r.task_title || 'Manual entry')}</div>${r.notes ? `<div class="secondary">${esc(r.notes)}</div>` : ''}</td>` +
        `<td data-label="By">${esc(r.performed_by_name || '—')}</td>` +
        `<td data-label="Cost" class="num">${esc(money(r.cost))}</td></tr>`).join('') +
      '</tbody></table>';
  }

  async function load() {
    const params = filters();
    if (params.from && params.to && params.from > params.to) {
      App.toast('"From" date must be before "To" date.', 'error');
      return;
    }
    try {
      const [history, expenses] = await Promise.all([
        api.get(api.url('/api/reports/history', params)),
        api.get(api.url('/api/reports/expenses', params))
      ]);
      renderSummary(expenses, history.records);
      renderByVehicle(expenses.by_vehicle);
      renderByMonth(expenses.by_month);
      renderRecords(history.records);
    } catch (error) {
      document.getElementById('records').innerHTML = emptyState('alert', error.message);
      document.getElementById('byVehicle').innerHTML = '';
      document.getElementById('byMonth').innerHTML = '';
    }
  }

  filterForm.addEventListener('submit', (event) => {
    event.preventDefault();
    load();
  });
  document.getElementById('resetFilters').addEventListener('click', () => {
    filterForm.reset();
    load();
  });

  (async function start() {
    user = await App.init({
      page: 'history',
      title: (u) => (u.role === 'owner' ? 'History & Expenses' : 'Completed Work'),
      roles: ['owner', 'caretaker']
    });
    if (user.role === 'caretaker') {
      document.getElementById('pageHeading').textContent = 'Completed Work';
      document.getElementById('pageIntro').textContent = 'Inspections and maintenance you have recorded, with costs billed.';
      document.getElementById('byVehicleHeading').textContent = 'Billed by vehicle';
    }
    try {
      const { vehicles } = await api.get('/api/vehicles');
      document.getElementById('fVehicle').innerHTML = '<option value="">All vehicles</option>' + vehicles.map((v) =>
        `<option value="${v.id}">${esc(v.make)} ${esc(v.model)} · ${esc(v.registration_number)}</option>`).join('');
    } catch (error) {
      App.toast(error.message, 'error');
    }
    await load();
  })();
})();
