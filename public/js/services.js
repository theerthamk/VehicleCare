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
  const nearVehicle = document.getElementById('nearVehicle');
  const sortBy = document.getElementById('sortBy');
  const coversOnly = document.getElementById('coversOnly');
  let origin = null;
  let providerMap = null;

  function sortedProviders() {
    let list = providers.slice();
    if (origin && coversOnly.checked) list = list.filter((p) => p.covers);
    const by = sortBy.value;
    list.sort((a, b) => {
      if (by === 'distance') return (a.distance_km ?? 99999) - (b.distance_km ?? 99999);
      if (by === 'rating') return (b.avg_rating ?? 0) - (a.avg_rating ?? 0) || b.review_count - a.review_count;
      return b.match_score - a.match_score;
    });
    return list;
  }

  function providerCard(p, best) {
    const scoreColor = p.match_score >= 70 ? 'var(--green)' : p.match_score >= 50 ? '#c27a00' : 'var(--red)';
    let where = '';
    if (p.distance_km !== null && p.distance_km !== undefined) {
      where = `<span class="${p.covers ? '' : 'muted'}">${icon('pin')} ${esc(p.distance_km)} km away` +
        `${p.covers ? '' : ` (travels ${esc(p.service_radius_km)} km)`}</span>`;
    } else if (p.city) {
      where = `<span>${icon('pin')} ${esc(p.city)}</span>`;
    }
    return `<article class="card provider"${best ? ' style="border-color:var(--blue-500);box-shadow:0 0 0 3px var(--blue-100)"' : ''}>` +
      `<div class="provider-top"><div class="avatar">${esc(initials(p.full_name))}</div>` +
      `<div class="grow"><h3>${esc(p.full_name)} ${p.top_rated ? '<span class="badge gold">Top rated</span>' : ''}` +
      `${best ? ' <span class="badge blue">Best match</span>' : ''}</h3>` +
      `<div class="small muted">${p.specialization ? esc(p.specialization) : 'General vehicle care'}</div></div></div>` +
      `<button type="button" class="btn btn-ghost btn-sm" data-reviews="${p.id}" style="justify-content:flex-start;padding:0 4px;height:auto">${App.stars(p.avg_rating, p.review_count)}</button>` +
      (p.bio ? `<p class="small" style="margin:0">${esc(p.bio)}</p>` : '') +
      '<div class="meta">' + where +
      (p.phone ? `<span>${icon('phone')} ${esc(p.phone)}</span>` : '') +
      `<span>${icon('check')} ${esc(p.completed_jobs)} job${Number(p.completed_jobs) === 1 ? '' : 's'} done</span></div>` +
      (origin
        ? `<div><div class="small">Match score <span class="score">${esc(p.match_score)}/100</span></div>` +
          `<div class="meter"><div style="width:${Number(p.match_score) || 0}%;background:${scoreColor}"></div></div></div>`
        : '') +
      '<div class="actions">' +
      `<button type="button" class="btn btn-primary btn-sm" data-request-provider="${p.id}">Request service</button>` +
      `<button type="button" class="btn btn-ghost btn-sm" data-reviews="${p.id}">Reviews</button></div>` +
      '</article>';
  }

  function renderProviders() {
    const list = sortedProviders();
    const note = document.getElementById('nearNote');
    const vehicle = vehicles.find((v) => String(v.id) === nearVehicle.value);
    if (vehicle && !origin) {
      note.classList.remove('hidden');
      note.innerHTML = `${esc(vehicle.make)} ${esc(vehicle.model)} has no map location yet, so distances cannot be shown. ` +
        `<a href="/pages/vehicles.html?edit=${vehicle.id}">Set its location</a>.`;
    } else if (origin) {
      const covering = providers.filter((p) => p.covers).length;
      note.classList.remove('hidden');
      note.innerHTML = `<strong>${covering}</strong> caretaker${covering === 1 ? '' : 's'} travel to your ${esc(vehicle.make)} ${esc(vehicle.model)}. ` +
        'Match score combines rating, distance, experience and skills.';
    } else {
      note.classList.add('hidden');
    }

    if (!list.length) {
      providerGrid.innerHTML = `<div class="card" style="grid-column:1/-1">${emptyState('user',
        providerSearch.value ? 'No providers match your search.'
          : origin ? 'No caretakers travel to this vehicle yet. Untick "Only those who travel there", or post it in the Job Pool.'
            : 'No caretakers have registered yet.')}</div>`;
    } else {
      providerGrid.innerHTML = list.map((p, i) => providerCard(p, origin && i === 0 && sortBy.value === 'match' && list.length > 1)).join('');
      providerGrid.querySelectorAll('.meta svg').forEach((svg) => {
        svg.setAttribute('width', '15');
        svg.setAttribute('height', '15');
        svg.style.verticalAlign = '-2px';
      });
    }
    renderProviderMap();
  }

  function renderProviderMap() {
    const card = document.getElementById('providerMapCard');
    if (!origin || !window.VCMap) {
      card.classList.add('hidden');
      return;
    }
    card.classList.remove('hidden');
    const shown = providers.filter((p) => p.latitude !== null);
    const markers = [{ lat: Number(origin.latitude), lng: Number(origin.longitude), color: '#1f5bd8', size: 10, label: 'Your vehicle' }];
    const circles = [];
    shown.forEach((p) => {
      markers.push({
        lat: Number(p.latitude),
        lng: Number(p.longitude),
        color: p.covers ? '#12805c' : '#8a94a6',
        label: `${p.full_name} · ${p.distance_km} km`,
        popup: `<strong>${esc(p.full_name)}</strong><br>${p.avg_rating !== null ? `${esc(p.avg_rating)} ★ · ` : ''}${esc(p.distance_km)} km away`
      });
      if (p.covers) circles.push({ lat: Number(p.latitude), lng: Number(p.longitude), radiusKm: Number(p.service_radius_km), color: '#12805c' });
    });
    if (providerMap) providerMap.remove();
    providerMap = VCMap.view(document.getElementById('providerMap'), {
      center: { lat: Number(origin.latitude), lng: Number(origin.longitude) },
      markers,
      circles
    });
  }

  let searchTimer;
  let providerRequestId = 0;
  async function loadProviders() {
    const requestId = ++providerRequestId;
    try {
      const data = await api.get(api.url('/api/services/providers', {
        q: providerSearch.value.trim(),
        vehicle_id: nearVehicle.value
      }));
      if (requestId !== providerRequestId) return; // a newer search has started; ignore this result
      providers = data.providers;
      origin = data.origin;
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
    if (nearVehicle.value) requestForm.elements.vehicle_id.value = nearVehicle.value;
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
      title: (u) => (u.role === 'owner' ? 'Find Caretakers' : 'Service Requests'),
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
        const reviews = event.target.closest('[data-reviews]');
        if (reviews) { Reviews.open(reviews.dataset.reviews); return; }
        const button = event.target.closest('[data-request-provider]');
        if (button) openRequestForm(button.dataset.requestProvider);
      });
      try {
        vehicles = (await api.get('/api/vehicles')).vehicles;
        nearVehicle.innerHTML = '<option value="">Near: any location</option>' + vehicles.map((v) =>
          `<option value="${v.id}">Near my ${esc(v.make)} ${esc(v.model)}${v.latitude === null ? ' (no location)' : ''}</option>`).join('');
        // Default to the first vehicle that has a map location.
        const preset = new URLSearchParams(location.search).get('vehicle_id');
        const located = vehicles.find((v) => String(v.id) === preset) || vehicles.find((v) => v.latitude !== null);
        if (located) nearVehicle.value = String(located.id);
      } catch (error) {
        App.toast(error.message, 'error');
      }
      nearVehicle.addEventListener('change', loadProviders);
      sortBy.addEventListener('change', renderProviders);
      coversOnly.addEventListener('change', renderProviders);
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
