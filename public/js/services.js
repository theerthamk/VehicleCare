// Services page.
//   Owner: browse providers, send service requests, cancel them.
//   Caretaker: accept or decline incoming requests.
(function () {
  'use strict';

  const { esc, badge, fmtDate, money, emptyState, icon, initials } = App;

  const requestTable = document.getElementById('requestTable');
  const providerGrid = document.getElementById('providerGrid');
  const providerSearch = document.getElementById('providerSearch');
  const requestDialog = document.getElementById('requestDialog');
  const requestForm = document.getElementById('requestForm');
  const respondDialog = document.getElementById('respondDialog');
  const respondForm = document.getElementById('respondForm');

  let user;
  let requests = [];
  let providers = [];
  let vehicles = [];
  let statusFilter = 'all';

  const isOwner = () => user.role === 'owner';

  // ---------- Providers (owner) ----------
  function renderProviders() {
    if (!providers.length) {
      providerGrid.innerHTML = `<div class="card" style="grid-column:1/-1">${emptyState('user',
        providerSearch.value ? 'No providers match your search.' : 'No caretakers have registered yet.')}</div>`;
      return;
    }
    providerGrid.innerHTML = providers.map((p) =>
      '<article class="card provider">' +
      `<div class="provider-top"><div class="avatar">${esc(initials(p.full_name))}</div>` +
      `<div class="grow"><h3>${esc(p.full_name)}</h3>` +
      `<div class="small muted">${p.specialization ? esc(p.specialization) : 'General vehicle care'}</div></div></div>` +
      (p.bio ? `<p class="small" style="margin:0">${esc(p.bio)}</p>` : '') +
      '<div class="meta">' +
      (p.city ? `<span>${icon('pin', 'inline-icon')} ${esc(p.city)}</span>` : '') +
      (p.phone ? `<span>${icon('phone')} ${esc(p.phone)}</span>` : '') +
      `<span>${icon('check')} ${esc(p.completed_jobs)} job${Number(p.completed_jobs) === 1 ? '' : 's'} done</span></div>` +
      `<button type="button" class="btn btn-primary btn-sm" data-request-provider="${p.id}">Request service</button>` +
      '</article>').join('');
    providerGrid.querySelectorAll('.meta svg').forEach((svg) => {
      svg.setAttribute('width', '15');
      svg.setAttribute('height', '15');
      svg.style.verticalAlign = '-2px';
    });
  }

  let searchTimer;
  let providerRequestId = 0;
  async function loadProviders() {
    const requestId = ++providerRequestId;
    try {
      const data = await api.get(api.url('/api/services/providers', { q: providerSearch.value.trim() }));
      if (requestId !== providerRequestId) return; // a newer search has started; ignore this result
      providers = data.providers;
      renderProviders();
    } catch (error) {
      providerGrid.innerHTML = `<div class="card" style="grid-column:1/-1">${emptyState('alert', error.message)}</div>`;
    }
  }

  function openRequestForm(providerId) {
    if (!vehicles.length) {
      App.toast('Add a vehicle before requesting a service.', 'error');
      return;
    }
    requestForm.reset();
    App.clearErrors(requestForm);
    document.getElementById('sProvider').innerHTML = providers.map((p) =>
      `<option value="${p.id}">${esc(p.full_name)}${p.city ? ` — ${esc(p.city)}` : ''}</option>`).join('');
    document.getElementById('sVehicle').innerHTML = '<option value="">Choose a vehicle</option>' + vehicles.map((v) =>
      `<option value="${v.id}">${esc(v.make)} ${esc(v.model)} · ${esc(v.registration_number)}</option>`).join('');
    requestForm.elements.provider_id.value = String(providerId);
    requestForm.elements.preferred_date.min = App.today();
    App.openDialog(requestDialog);
  }

  // ---------- Requests ----------
  function requestActions(r) {
    if (isOwner()) {
      return ['pending', 'accepted'].includes(r.status)
        ? `<button type="button" class="btn btn-danger btn-sm" data-action="cancel" data-id="${r.id}">Cancel</button>`
        : '';
    }
    if (r.status === 'pending') {
      return `<button type="button" class="btn btn-success btn-sm" data-action="accept" data-id="${r.id}">Accept</button>` +
        `<button type="button" class="btn btn-danger btn-sm" data-action="decline" data-id="${r.id}">Decline</button>`;
    }
    if (r.status === 'accepted') {
      return '<a class="btn btn-secondary btn-sm" href="/pages/maintenance.html">Open task</a>';
    }
    return '';
  }

  function renderRequests() {
    if (!requests.length) {
      const msg = isOwner()
        ? (statusFilter === 'all' ? 'You have not requested any services yet. Pick a provider above.' : 'No requests with this status.')
        : (statusFilter === 'all' ? 'No service requests yet. Owners can find you once your profile is filled in.' : 'No requests with this status.');
      requestTable.innerHTML = emptyState('inbox', msg);
      return;
    }
    requestTable.innerHTML =
      `<table><thead><tr><th>Service</th><th>${isOwner() ? 'Provider' : 'Owner'}</th><th>Preferred date</th>` +
      '<th>Requested</th><th>Status</th><th class="num">Cost</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>' +
      requests.map((r) => {
        const person = isOwner()
          ? `${esc(r.provider_name)}${r.provider_phone ? `<div class="secondary nowrap">${esc(r.provider_phone)}</div>` : ''}`
          : `${esc(r.owner_name)}${r.owner_phone ? `<div class="secondary nowrap">${esc(r.owner_phone)}</div>` : ''}`;
        return '<tr>' +
          `<td><div class="primary">${esc(r.service_type)}</div>` +
          `<div class="secondary">${esc(r.make)} ${esc(r.model)} · ${esc(r.registration_number)}` +
          `${!isOwner() && r.vehicle_location ? ` · ${esc(r.vehicle_location)}` : ''}</div>` +
          `${r.details ? `<div class="secondary">${esc(r.details)}</div>` : ''}` +
          `${r.provider_note ? `<div class="secondary"><em>Note: ${esc(r.provider_note)}</em></div>` : ''}</td>` +
          `<td data-label="${isOwner() ? 'Provider' : 'Owner'}">${person}</td>` +
          `<td data-label="Preferred" class="nowrap">${r.preferred_date ? esc(fmtDate(r.preferred_date)) : '<span class="muted">Any time</span>'}</td>` +
          `<td data-label="Requested" class="nowrap">${esc(fmtDate(r.request_date))}</td>` +
          `<td data-label="Status">${badge(r.status)}</td>` +
          `<td data-label="Cost" class="num">${r.cost !== null ? esc(money(r.cost)) : '<span class="muted">—</span>'}</td>` +
          `<td><div class="actions">${requestActions(r)}</div></td></tr>`;
      }).join('') +
      '</tbody></table>';
  }

  async function loadRequests() {
    try {
      const data = await api.get(api.url('/api/services/requests', { status: statusFilter }));
      requests = data.requests;
      renderRequests();
    } catch (error) {
      requestTable.innerHTML = emptyState('alert', error.message);
    }
  }

  // ---------- Forms ----------
  App.bindForm(requestForm, async (values) => {
    await api.post('/api/services/requests', values);
    App.toast('Request sent. The provider has been notified.', 'success');
    App.closeDialog(requestDialog);
    await loadRequests();
  });

  function openRespond(request, status) {
    respondForm.reset();
    App.clearErrors(respondForm);
    respondForm.elements.request_id.value = request.id;
    respondForm.elements.status.value = status;
    const accepting = status === 'accepted';
    document.getElementById('respondTitle').textContent = accepting ? 'Accept request' : 'Decline request';
    document.getElementById('respondSummary').textContent =
      `${request.service_type} for ${request.make} ${request.model} (${request.registration_number}) — ${request.owner_name}.` +
      (accepting ? ' A maintenance task will be added to your task list.' : '');
    const submit = document.getElementById('respondSubmit');
    submit.textContent = accepting ? 'Accept request' : 'Decline request';
    submit.className = `btn ${accepting ? 'btn-success' : 'btn-danger'}`;
    App.openDialog(respondDialog);
  }

  App.bindForm(respondForm, async (values) => {
    await api.patch(`/api/services/requests/${values.request_id}/status`, {
      status: values.status,
      provider_note: values.provider_note
    });
    App.toast(values.status === 'accepted' ? 'Request accepted and added to your tasks.' : 'Request declined.', 'success');
    App.closeDialog(respondDialog);
    await loadRequests();
  });

  requestTable.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const request = requests.find((r) => String(r.id) === button.dataset.id);
    if (!request) return;
    const action = button.dataset.action;
    if (action === 'accept') return openRespond(request, 'accepted');
    if (action === 'decline') return openRespond(request, 'declined');
    if (action === 'cancel') {
      const ok = await App.confirm(
        `Cancel "${request.service_type}" with ${request.provider_name}?` +
        (request.status === 'accepted' ? ' The scheduled task will be cancelled too.' : ''),
        { title: 'Cancel request', confirmText: 'Cancel request', danger: true });
      if (!ok) return;
      try {
        await api.patch(`/api/services/requests/${request.id}/status`, { status: 'cancelled' });
        App.toast('Request cancelled.', 'success');
        await loadRequests();
      } catch (error) {
        App.toast(error.message, 'error');
      }
    }
    return undefined;
  });

  document.getElementById('requestTabs').addEventListener('click', (event) => {
    const tab = event.target.closest('.tab');
    if (!tab) return;
    document.querySelectorAll('#requestTabs .tab').forEach((t) => t.classList.toggle('active', t === tab));
    statusFilter = tab.dataset.status;
    loadRequests();
  });

  (async function start() {
    user = await App.init({
      page: 'services',
      title: (u) => (u.role === 'owner' ? 'Service Providers' : 'Service Requests'),
      roles: ['owner', 'caretaker']
    });

    if (isOwner()) {
      document.getElementById('providerSection').classList.remove('hidden');
      document.getElementById('searchIcon').outerHTML = icon('search');
      providerSearch.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(loadProviders, 250);
      });
      providerGrid.addEventListener('click', (event) => {
        const button = event.target.closest('[data-request-provider]');
        if (button) openRequestForm(button.dataset.requestProvider);
      });
      try {
        vehicles = (await api.get('/api/vehicles')).vehicles;
      } catch (error) {
        App.toast(error.message, 'error');
      }
      await loadProviders();
    } else {
      document.getElementById('pageHeading').textContent = 'Service Requests';
      document.getElementById('pageIntro').textContent = 'Requests sent to you by vehicle owners. Accepting one adds it to your tasks.';
      document.getElementById('requestsHeading').textContent = 'Incoming requests';
      // Caretakers usually want to see what is waiting for them first.
      statusFilter = 'pending';
      document.querySelectorAll('#requestTabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.status === 'pending'));
    }
    await loadRequests();
  })();
})();
