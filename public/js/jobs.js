// Job Pool.
//   Owner: post a job for a vehicle, compare ranked bids, accept one, cancel a job.
//   Caretaker: see open jobs inside your service area (list + map), bid, update or withdraw.
(function () {
  'use strict';

  const { esc, badge, fmtDate, money, emptyState, icon, stars } = App;

  const list = document.getElementById('jobList');
  const postDialog = document.getElementById('postDialog');
  const postForm = document.getElementById('postForm');
  const bidsDialog = document.getElementById('bidsDialog');
  const bidDialog = document.getElementById('bidDialog');
  const bidForm = document.getElementById('bidForm');

  let user;
  let jobs = [];
  let vehicles = [];
  let statusFilter = 'open';
  let me = null; // caretaker's own profile (location + radius)
  let map = null;

  const isOwner = () => user.role === 'owner';

  // ---------- Rendering ----------
  function jobStatusBadge(job) {
    if (job.status === 'open') return badge('pending', 'Open for bids');
    if (job.status === 'assigned') return badge('completed', 'Assigned');
    return badge('cancelled', 'Cancelled');
  }

  function meta(items) {
    return `<div class="meta">${items.filter(Boolean).map((i) => `<span>${i}</span>`).join('')}</div>`;
  }

  function ownerCard(j) {
    const bids = Number(j.bid_count) || 0;
    return '<article class="card job-card">' +
      `<div class="top"><div><h3>${esc(j.title)}</h3>` +
      `<div class="small muted">${esc(j.make)} ${esc(j.model)} · ${esc(j.registration_number)}</div></div>${jobStatusBadge(j)}</div>` +
      (j.description ? `<p class="small" style="margin:0">${esc(j.description)}</p>` : '') +
      meta([
        `${icon('calendar')} ${j.preferred_date ? esc(fmtDate(j.preferred_date)) : 'Any date'}`,
        j.budget !== null ? `Budget ${esc(money(j.budget))}` : 'No budget set',
        `Posted ${esc(fmtDate(j.created_at))}`
      ]) +
      (j.status === 'assigned'
        ? `<div class="small">Assigned to <strong>${esc(j.assigned_name || 'a caretaker')}</strong> — the task is in Maintenance.</div>`
        : `<div class="small"><strong>${bids}</strong> bid${bids === 1 ? '' : 's'}` +
          `${j.lowest_bid !== null && j.lowest_bid !== undefined ? ` · lowest ${esc(money(j.lowest_bid))}` : ''}</div>`) +
      '<div class="actions">' +
      (j.status !== 'cancelled'
        ? `<button type="button" class="btn ${bids && j.status === 'open' ? 'btn-primary' : 'btn-secondary'} btn-sm" data-action="bids" data-id="${j.id}">` +
          `${j.status === 'open' ? `Compare bids (${bids})` : 'View bids'}</button>` : '') +
      (j.status === 'open' ? `<button type="button" class="btn btn-danger btn-sm" data-action="cancel" data-id="${j.id}">Cancel job</button>` : '') +
      '</div></article>';
  }

  function caretakerCard(j) {
    const bid = j.my_bid;
    let bidLine = '';
    if (bid) {
      const label = { pending: 'Your bid is waiting', accepted: 'Your bid was accepted!', rejected: 'Not selected', withdrawn: 'You withdrew your bid' }[bid.status];
      bidLine = `<div class="callout small" style="padding:10px 12px"><strong>${esc(label)}</strong> · ${esc(money(bid.price))}` +
        `${bid.message ? ` · "${esc(bid.message)}"` : ''}</div>`;
    }
    let actions = '';
    if (j.status === 'open') {
      if (!bid || bid.status === 'withdrawn') {
        actions = `<button type="button" class="btn btn-primary btn-sm" data-action="bid" data-id="${j.id}">Place a bid</button>`;
      } else if (bid.status === 'pending') {
        actions = `<button type="button" class="btn btn-secondary btn-sm" data-action="bid" data-id="${j.id}">Change bid</button>` +
          `<button type="button" class="btn btn-ghost btn-sm" data-action="withdraw" data-id="${j.id}">Withdraw</button>`;
      }
    } else if (bid && bid.status === 'accepted') {
      actions = '<a class="btn btn-success btn-sm" href="/pages/maintenance.html">Open in My Tasks</a>';
    }
    return '<article class="card job-card">' +
      `<div class="top"><div><h3>${esc(j.title)}</h3>` +
      `<div class="small muted">${esc(j.make)} ${esc(j.model)} (${esc(j.vehicle_type)})` +
      `${j.registration_number ? ` · ${esc(j.registration_number)}` : ''} · posted by ${esc(j.owner_name)}</div></div>${jobStatusBadge(j)}</div>` +
      (j.description ? `<p class="small" style="margin:0">${esc(j.description)}</p>` : '') +
      meta([
        j.distance_km !== null && j.distance_km !== undefined ? `${icon('pin')} ${esc(j.distance_km)} km away` : '',
        `${icon('calendar')} ${j.preferred_date ? esc(fmtDate(j.preferred_date)) : 'Any date'}`,
        j.budget !== null ? `Budget ${esc(money(j.budget))}` : 'Open budget',
        `${esc(j.bid_count)} bid${Number(j.bid_count) === 1 ? '' : 's'} so far`
      ]) +
      bidLine +
      (actions ? `<div class="actions">${actions}</div>` : '') +
      '</article>';
  }

  function sizeIcons(root) {
    root.querySelectorAll('.meta svg').forEach((svg) => {
      svg.setAttribute('width', '15');
      svg.setAttribute('height', '15');
      svg.style.verticalAlign = '-2px';
    });
  }

  function render() {
    if (!jobs.length) {
      let msg;
      if (isOwner()) {
        msg = statusFilter === 'open' || statusFilter === 'all'
          ? 'No jobs posted yet. Post a job and nearby caretakers will send you their price.'
          : 'No jobs with this status.';
      } else if (me && me.latitude === null) {
        msg = 'Set your service location to see jobs near you.';
      } else {
        msg = statusFilter === 'open' ? 'No open jobs in your service area right now. You will get a notification when one is posted.' : 'No jobs with this status.';
      }
      list.innerHTML = `<div class="card" style="grid-column:1/-1">${emptyState('briefcase', msg,
        isOwner() && statusFilter !== 'cancelled' && statusFilter !== 'assigned'
          ? '<button type="button" class="btn btn-primary btn-sm" data-action="post">Post a job</button>' : '')}</div>`;
      return;
    }
    list.innerHTML = jobs.map(isOwner() ? ownerCard : caretakerCard).join('');
    sizeIcons(list);
  }

  function renderMap() {
    if (isOwner() || !window.VCMap) return;
    const card = document.getElementById('mapCard');
    if (!me || me.latitude === null) {
      card.classList.add('hidden');
      return;
    }
    card.classList.remove('hidden');
    const center = { lat: Number(me.latitude), lng: Number(me.longitude) };
    const markers = [{ lat: center.lat, lng: center.lng, color: '#12805c', size: 9, label: 'You' }];
    jobs.filter((j) => j.latitude !== null && j.status === 'open').forEach((j) => {
      markers.push({
        lat: Number(j.latitude),
        lng: Number(j.longitude),
        color: j.my_bid && j.my_bid.status === 'pending' ? '#c27a00' : '#1f5bd8',
        label: `${j.title} (${j.distance_km} km)`,
        popup: `<strong>${esc(j.title)}</strong><br>${esc(j.make)} ${esc(j.model)} · ${esc(j.distance_km)} km` +
          `${j.budget !== null ? `<br>Budget ${esc(money(j.budget))}` : ''}`
      });
    });
    document.getElementById('mapNote').textContent =
      `Within ${me.service_radius_km} km of your base · blue = open job, orange = you have bid`;
    if (map) map.remove();
    map = VCMap.view(document.getElementById('jobMap'), {
      center,
      markers,
      circles: [{ lat: center.lat, lng: center.lng, radiusKm: Number(me.service_radius_km) }]
    });
  }

  async function load() {
    try {
      const data = await api.get(api.url('/api/jobs', { status: statusFilter }));
      jobs = data.jobs;
      if (!isOwner()) {
        const callout = document.getElementById('locationCallout');
        callout.classList.toggle('hidden', !data.needs_location);
        callout.innerHTML = data.needs_location
          ? '<strong>Set your service area to see jobs.</strong> Pick your base on the map and how far you travel in your ' +
            '<a href="/pages/profile.html">Provider Profile</a>.'
          : '';
      }
      render();
      renderMap();
    } catch (error) {
      list.innerHTML = `<div class="card" style="grid-column:1/-1">${emptyState('alert', error.message)}</div>`;
    }
  }

  // ---------- Owner: post ----------
  function updateVehicleHint() {
    const v = vehicles.find((x) => String(x.id) === postForm.elements.vehicle_id.value);
    const hint = document.getElementById('jVehicleHint');
    if (!v) {
      hint.textContent = '';
    } else if (v.latitude === null) {
      hint.innerHTML = '⚠ This vehicle has no map location yet, so caretakers cannot find the job. ' +
        `<a href="/pages/vehicles.html?edit=${v.id}">Set its location</a>.`;
    } else {
      hint.textContent = v.location ? `Caretakers near ${v.location} will see this job.` : 'Caretakers near this vehicle will see this job.';
    }
  }

  function openPostForm() {
    if (!vehicles.length) {
      App.toast('Add a vehicle first.', 'error');
      return;
    }
    postForm.reset();
    App.clearErrors(postForm);
    postForm.elements.vehicle_id.innerHTML = '<option value="">Choose a vehicle</option>' + vehicles.map((v) =>
      `<option value="${v.id}">${esc(v.make)} ${esc(v.model)} · ${esc(v.registration_number)}${v.latitude === null ? ' (no location)' : ''}</option>`).join('');
    postForm.elements.preferred_date.min = App.today();
    const preset = new URLSearchParams(location.search).get('vehicle_id');
    if (preset) postForm.elements.vehicle_id.value = preset;
    updateVehicleHint();
    App.openDialog(postDialog);
  }

  App.bindForm(postForm, async (values) => {
    const data = await api.post('/api/jobs', values);
    App.toast(data.notified
      ? `Job posted. ${data.notified} nearby caretaker${data.notified === 1 ? ' was' : 's were'} notified.`
      : 'Job posted. No caretakers cover this area yet, but new ones will see it.', 'success');
    App.closeDialog(postDialog);
    statusFilter = 'open';
    document.querySelectorAll('#statusTabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.status === 'open'));
    await load();
  });
  postForm.elements.vehicle_id.addEventListener('change', updateVehicleHint);

  // ---------- Owner: bids ----------
  function bidCard(b, jobOpen) {
    const c = b.caretaker || {};
    const scoreColor = c.match_score >= 70 ? 'var(--green)' : c.match_score >= 50 ? '#c27a00' : 'var(--red)';
    return `<div class="bid${b.best_match ? ' best' : ''}">` +
      '<div class="row"><div style="display:flex;gap:12px;align-items:center">' +
      `<div class="avatar">${esc(App.initials(c.full_name))}</div><div>` +
      `<div><strong>${esc(c.full_name)}</strong> ${c.top_rated ? '<span class="badge gold">Top rated</span>' : ''}` +
      `${b.best_match ? ' <span class="badge blue">Best match</span>' : ''}</div>` +
      `<div class="small">${stars(c.avg_rating, c.review_count)}</div></div></div>` +
      `<div style="text-align:right"><div class="price">${esc(money(b.price))}</div>${badge(b.status)}</div></div>` +
      `<div class="small muted" style="margin-top:8px">${c.distance_km !== null && c.distance_km !== undefined ? `${esc(c.distance_km)} km away · ` : ''}` +
      `${esc(c.completed_jobs)} job${Number(c.completed_jobs) === 1 ? '' : 's'} completed` +
      `${c.specialization ? ` · ${esc(c.specialization)}` : ''}</div>` +
      (b.message ? `<p class="small" style="margin:8px 0 0">"${esc(b.message)}"</p>` : '') +
      `<div style="margin-top:10px"><div class="small">Match score <span class="score">${esc(c.match_score)}/100</span>` +
      ' <span class="muted">(rating, distance, experience, skills)</span></div>' +
      `<div class="meter"><div style="width:${Number(c.match_score) || 0}%;background:${scoreColor}"></div></div></div>` +
      '<div class="actions" style="margin-top:10px">' +
      `<button type="button" class="btn btn-ghost btn-sm" data-reviews="${c.id}">Read reviews</button>` +
      (jobOpen && b.status === 'pending'
        ? `<button type="button" class="btn btn-success btn-sm" data-accept="${b.bid_id}">Accept for ${esc(money(b.price))}</button>` : '') +
      '</div></div>';
  }

  async function openBids(job) {
    const body = document.getElementById('bidsBody');
    document.getElementById('bidsTitle').textContent = `Bids: ${job.title}`;
    body.innerHTML = '<div class="loading">Loading…</div>';
    App.openDialog(bidsDialog);
    try {
      const data = await api.get(`/api/jobs/${job.id}`);
      bidsDialog.dataset.jobId = job.id;
      const open = data.job.status === 'open';
      body.innerHTML =
        `<p class="small muted">${esc(data.job.make)} ${esc(data.job.model)} · ${esc(data.job.registration_number)}` +
        `${data.job.budget !== null ? ` · your budget ${esc(money(data.job.budget))}` : ''}</p>` +
        (data.bids.length
          ? (open && data.bids.length > 1 ? '<p class="small">Bids are ranked by match score: rating, distance, experience and how well their skills fit this job.</p>' : '') +
            data.bids.map((b) => bidCard(b, open)).join('')
          : emptyState('inbox', 'No bids yet. Nearby caretakers have been notified.'));
    } catch (error) {
      body.innerHTML = emptyState('alert', error.message);
    }
  }

  document.getElementById('bidsBody').addEventListener('click', async (event) => {
    const reviews = event.target.closest('[data-reviews]');
    if (reviews) { Reviews.open(reviews.dataset.reviews); return; }
    const accept = event.target.closest('[data-accept]');
    if (!accept) return;
    const jobId = bidsDialog.dataset.jobId;
    const job = jobs.find((j) => String(j.id) === jobId);
    const ok = await App.confirm('Accept this bid? The job becomes a maintenance task for this caretaker and the other bids are declined.',
      { title: 'Accept bid', confirmText: 'Accept bid' });
    if (!ok) return;
    try {
      await api.post(`/api/jobs/${jobId}/accept`, { bid_id: Number(accept.dataset.accept) });
      App.toast('Bid accepted. The task is now in Maintenance.', 'success');
      App.closeDialog(bidsDialog);
      await load();
    } catch (error) {
      App.toast(error.message, 'error');
      if (job) openBids(job);
    }
  });

  // ---------- Caretaker: bid ----------
  function openBidForm(job) {
    if (me && me.latitude === null) {
      App.toast('Set your service location in your Provider Profile first.', 'error');
      return;
    }
    bidForm.reset();
    App.clearErrors(bidForm);
    bidForm.elements.job_id.value = job.id;
    document.getElementById('bidSummary').textContent =
      `${job.title} — ${job.make} ${job.model}, ${job.distance_km} km away` +
      `${job.budget !== null ? `. Owner's budget: ${money(job.budget)}` : ''}.`;
    if (job.my_bid && job.my_bid.status === 'pending') {
      bidForm.elements.price.value = job.my_bid.price;
      bidForm.elements.message.value = job.my_bid.message || '';
      document.getElementById('bidTitle').textContent = 'Change your bid';
    } else {
      document.getElementById('bidTitle').textContent = 'Place a bid';
      if (job.budget !== null) bidForm.elements.price.value = Math.round(job.budget);
    }
    App.openDialog(bidDialog);
  }

  App.bindForm(bidForm, async (values) => {
    await api.post(`/api/jobs/${values.job_id}/bids`, { price: values.price, message: values.message });
    App.toast('Bid sent. The owner has been notified.', 'success');
    App.closeDialog(bidDialog);
    await load();
  });

  // ---------- Events ----------
  list.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'post') { openPostForm(); return; }
    const job = jobs.find((j) => String(j.id) === button.dataset.id);
    if (!job) return;
    if (action === 'bids') openBids(job);
    if (action === 'bid') openBidForm(job);
    if (action === 'withdraw') {
      const ok = await App.confirm('Withdraw your bid? You can bid again while the job is open.', { title: 'Withdraw bid', confirmText: 'Withdraw', danger: true });
      if (!ok) return;
      try {
        await api.del(`/api/jobs/${job.id}/bids/mine`);
        App.toast('Bid withdrawn.', 'success');
        await load();
      } catch (error) {
        App.toast(error.message, 'error');
      }
    }
    if (action === 'cancel') {
      const ok = await App.confirm(`Cancel the job "${job.title}"? Caretakers who bid will be told.`, { title: 'Cancel job', confirmText: 'Cancel job', danger: true });
      if (!ok) return;
      try {
        await api.patch(`/api/jobs/${job.id}/cancel`);
        App.toast('Job cancelled.', 'success');
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

  (async function start() {
    user = await App.init({
      page: 'jobs',
      title: (u) => (u.role === 'owner' ? 'Job Pool' : 'Find Jobs'),
      roles: ['owner', 'caretaker']
    });
    if (isOwner()) {
      const btn = document.getElementById('postJobBtn');
      btn.classList.remove('hidden');
      btn.addEventListener('click', openPostForm);
      try {
        vehicles = (await api.get('/api/vehicles')).vehicles;
      } catch (error) {
        App.toast(error.message, 'error');
      }
    } else {
      me = user;
      document.getElementById('pageHeading').textContent = 'Find Jobs';
      document.getElementById('pageIntro').textContent = 'Open jobs from vehicle owners inside your service area. Send your price; the owner picks one caretaker.';
    }
    await load();
    if (isOwner() && new URLSearchParams(location.search).get('new') === '1') openPostForm();
  })();
})();
