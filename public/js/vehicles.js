// Vehicles page. Owners: full CRUD. Caretakers: read-only list of assigned vehicles.
(function () {
  'use strict';

  const { esc, badge, fmtDate, daysUntil, relativeDue, emptyState } = App;
  const table = document.getElementById('vehicleTable');
  const dialog = document.getElementById('vehicleDialog');
  const form = document.getElementById('vehicleForm');
  const search = document.getElementById('search');

  let user;
  let vehicles = [];
  let statusFilter = '';
  let picker = null;

  const TYPE_LABELS = { car: 'Car', motorcycle: 'Motorcycle', scooter: 'Scooter', truck: 'Truck', van: 'Van', other: 'Other' };

  function parkedText(v) {
    if (!v.parked_since || !['parked', 'stored'].includes(v.status)) return '<span class="muted">—</span>';
    const days = -daysUntil(v.parked_since);
    return `${esc(fmtDate(v.parked_since))}<div class="secondary">${days} day${days === 1 ? '' : 's'}</div>`;
  }

  function nextDueText(v) {
    if (!Number(v.open_tasks)) return '<span class="muted">No open tasks</span>';
    const late = daysUntil(v.next_due) < 0;
    return `${esc(v.open_tasks)} open<div class="secondary" style="${late ? 'color:var(--red)' : ''}">${esc(relativeDue(v.next_due))}</div>`;
  }

  function render() {
    const q = search.value.trim().toLowerCase();
    const rows = vehicles.filter((v) =>
      !q || `${v.make} ${v.model} ${v.registration_number} ${v.location || ''}`.toLowerCase().includes(q));

    if (!rows.length) {
      const isOwner = user.role === 'owner';
      const msg = vehicles.length
        ? 'No vehicles match your search.'
        : isOwner
          ? (statusFilter ? 'No vehicles with this status.' : 'You have not added any vehicles yet.')
          : 'No vehicles are assigned to you yet. They appear here when an owner assigns you a task.';
      table.innerHTML = emptyState('car', msg, isOwner && !vehicles.length && !statusFilter
        ? '<button type="button" class="btn btn-primary btn-sm" data-action="add">Add your first vehicle</button>' : '');
      return;
    }

    const isOwner = user.role === 'owner';
    table.innerHTML =
      '<table><thead><tr><th>Vehicle</th>' +
      (isOwner ? '' : '<th>Owner</th>') +
      '<th>Health</th><th>Status</th><th>Parked since</th><th>Location</th><th>Maintenance</th><th>Last service</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>' +
      rows.map((v) =>
        '<tr>' +
        `<td><div class="primary">${esc(v.make)} ${esc(v.model)}${v.year ? ` <span class="muted">(${esc(v.year)})</span>` : ''}</div>` +
        `<div class="secondary">${esc(v.registration_number)} · ${esc(TYPE_LABELS[v.vehicle_type] || v.vehicle_type)}</div></td>` +
        (isOwner ? '' : `<td data-label="Owner">${esc(v.owner_name)}${v.owner_phone ? `<div class="secondary">${esc(v.owner_phone)}</div>` : ''}</td>`) +
        `<td data-label="Health">${v.health ? App.healthBadge(v.health) : '<span class="muted">—</span>'}</td>` +
        `<td data-label="Status">${badge(v.status)}</td>` +
        `<td data-label="Parked since" class="nowrap">${parkedText(v)}</td>` +
        `<td data-label="Location">${v.location ? esc(v.location) : '<span class="muted">—</span>'}` +
        `${isOwner && v.latitude === null ? '<div class="secondary">No map pin</div>' : ''}</td>` +
        `<td data-label="Maintenance">${nextDueText(v)}</td>` +
        `<td data-label="Last service" class="nowrap">${v.last_service ? esc(fmtDate(v.last_service)) : '<span class="muted">Never</span>'}</td>` +
        '<td><div class="actions">' +
        `<a class="btn btn-secondary btn-sm" href="/pages/maintenance.html?vehicle_id=${v.id}">Tasks</a>` +
        (isOwner
          ? `<button type="button" class="btn btn-secondary btn-sm" data-action="plan" data-id="${v.id}" data-icon="sparkles">AI plan</button>` +
            `<button type="button" class="btn btn-ghost btn-sm" data-action="edit" data-id="${v.id}">Edit</button>` +
            `<button type="button" class="btn btn-danger btn-sm" data-action="delete" data-id="${v.id}">Delete</button>`
          : '') +
        '</div></td></tr>').join('') +
      '</tbody></table>';
    App.applyIcons(table);
  }

  async function load() {
    try {
      const data = await api.get(api.url('/api/vehicles', { status: statusFilter }));
      vehicles = data.vehicles;
      render();
    } catch (error) {
      table.innerHTML = emptyState('alert', error.message);
    }
  }

  function openForm(vehicle) {
    form.reset();
    App.clearErrors(form);
    document.getElementById('vehicleDialogTitle').textContent = vehicle ? 'Edit vehicle' : 'Add vehicle';
    form.elements.year.max = new Date().getFullYear() + 1;
    form.elements.parked_since.max = App.today();
    if (vehicle) App.fillForm(form, vehicle);
    else form.elements.id.value = '';
    App.openDialog(dialog);
    // Created after the dialog opens so the map knows its size.
    picker = window.VCMap
      ? VCMap.picker(document.getElementById('vehicleMap'), {
        lat: vehicle ? vehicle.latitude : null,
        lng: vehicle ? vehicle.longitude : null
      })
      : null;
  }

  App.bindForm(form, async (values) => {
    const id = values.id;
    delete values.id;
    const point = picker ? picker.value : null;
    values.latitude = point ? point.lat : null;
    values.longitude = point ? point.lng : null;
    if (id) {
      await api.put(`/api/vehicles/${id}`, values);
      App.toast('Vehicle updated.', 'success');
    } else {
      await api.post('/api/vehicles', values);
      App.toast('Vehicle added.', 'success');
    }
    App.closeDialog(dialog);
    await load();
  });

  table.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'add') return openForm(null);

    const vehicle = vehicles.find((v) => String(v.id) === button.dataset.id);
    if (!vehicle) return;
    if (action === 'edit') return openForm(vehicle);
    if (action === 'plan') {
      return CarePlan.open({
        vehicles,
        vehicleId: vehicle.id,
        onCreated: () => load()
      });
    }
    if (action === 'delete') {
      const ok = await App.confirm(
        `Delete ${vehicle.make} ${vehicle.model} (${vehicle.registration_number})? Its tasks, service requests and history will also be deleted.`,
        { title: 'Delete vehicle', confirmText: 'Delete', danger: true }
      );
      if (!ok) return;
      try {
        await api.del(`/api/vehicles/${vehicle.id}`);
        App.toast('Vehicle deleted.', 'success');
        await load();
      } catch (error) {
        App.toast(error.message, 'error');
      }
    }
  });

  document.getElementById('statusTabs').addEventListener('click', (event) => {
    const tab = event.target.closest('.tab');
    if (!tab) return;
    document.querySelectorAll('#statusTabs .tab').forEach((t) => t.classList.toggle('active', t === tab));
    statusFilter = tab.dataset.status;
    load();
  });
  search.addEventListener('input', render);

  (async function start() {
    user = await App.init({
      page: 'vehicles',
      title: (u) => (u.role === 'owner' ? 'My Vehicles' : 'Assigned Vehicles'),
      roles: ['owner', 'caretaker']
    });
    document.getElementById('searchIcon').outerHTML = App.icon('search');
    if (user.role === 'owner') {
      const add = document.getElementById('addVehicleBtn');
      add.classList.remove('hidden');
      add.addEventListener('click', () => openForm(null));
      document.getElementById('pageHeading').textContent = 'My Vehicles';
    } else {
      document.getElementById('pageHeading').textContent = 'Assigned Vehicles';
      document.getElementById('pageIntro').textContent = 'Vehicles that have tasks assigned to you.';
    }
    await load();
    const params = new URLSearchParams(location.search);
    if (user.role === 'owner' && params.get('new') === '1') openForm(null);
    const toEdit = user.role === 'owner' && vehicles.find((v) => String(v.id) === params.get('edit'));
    if (toEdit) openForm(toEdit);
  })();
})();
