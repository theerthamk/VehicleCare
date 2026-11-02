// Shared "AI care plan" dialog (owner only).
//   CarePlan.open({ vehicles, vehicleId, onCreated })
// Asks the server for a plan (Gemini, or built-in rules), shows each suggested
// task with a checkbox and adds the ones the owner keeps as maintenance tasks.
(function () {
  'use strict';

  let dialog;
  let state = { vehicles: [], plan: null, onCreated: null };

  function addDays(days) {
    const d = new Date();
    d.setDate(d.getDate() + Number(days || 0));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function ensureDialog() {
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.setAttribute('aria-labelledby', 'planTitle');
    dialog.innerHTML =
      `<div class="dialog-head"><h2 id="planTitle">${App.icon('sparkles')} AI care plan</h2>` +
      `<button type="button" class="icon-btn" data-close aria-label="Close">${App.icon('x')}</button></div>` +
      '<div class="dialog-body">' +
      '<div class="field"><label for="planVehicle">Vehicle</label>' +
      '<div style="display:flex;gap:8px"><select id="planVehicle"></select>' +
      '<button type="button" class="btn btn-primary" id="planGenerate">Generate</button></div></div>' +
      '<div id="planBody" style="margin-top:16px"></div></div>' +
      '<div class="dialog-foot"><button type="button" class="btn btn-ghost" data-close>Close</button>' +
      '<button type="button" class="btn btn-success hidden" id="planAdd">Add selected tasks</button></div>';
    document.body.appendChild(dialog);
    dialog.querySelector('#planTitle svg').style.cssText = 'width:20px;height:20px;vertical-align:-3px;color:#5b3fc4';
    dialog.querySelector('#planGenerate').addEventListener('click', generate);
    dialog.querySelector('#planAdd').addEventListener('click', addSelected);
    dialog.querySelector('#planBody').addEventListener('change', updateAddButton);
    return dialog;
  }

  function updateAddButton() {
    const add = dialog.querySelector('#planAdd');
    const count = dialog.querySelectorAll('#planBody input[type=checkbox]:checked').length;
    add.classList.toggle('hidden', !state.plan || !state.plan.tasks.length);
    add.disabled = !count;
    add.textContent = count ? `Add ${count} task${count === 1 ? '' : 's'}` : 'Add selected tasks';
  }

  async function generate() {
    const vehicleId = dialog.querySelector('#planVehicle').value;
    const body = dialog.querySelector('#planBody');
    const button = dialog.querySelector('#planGenerate');
    if (!vehicleId) {
      body.innerHTML = '<p class="small muted">Choose a vehicle first.</p>';
      return;
    }
    button.disabled = true;
    button.textContent = 'Thinking…';
    state.plan = null;
    updateAddButton();
    body.innerHTML = '<div class="loading">Looking at how long it has been parked, its history and open tasks…</div>';
    try {
      const plan = await api.post('/api/ai/care-plan', { vehicle_id: Number(vehicleId) });
      state.plan = plan;
      body.innerHTML =
        `<div class="callout small" style="margin-bottom:8px">${App.esc(plan.summary)}<div style="margin-top:6px">${App.sourceBadge(plan.source)}</div></div>` +
        (plan.tasks.length
          ? plan.tasks.map((t, i) =>
            `<label class="plan-item"><input type="checkbox" data-index="${i}" checked><div style="flex:1">` +
            `<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><strong>${App.esc(t.title)}</strong>` +
            `<span>${App.badge(t.priority)} <span class="small muted">${t.due_in_days === 0 ? 'today' : `in ${App.esc(t.due_in_days)} day${t.due_in_days === 1 ? '' : 's'}`}</span></span></div>` +
            `<div class="small">${App.esc(t.description)}</div>` +
            (t.reason ? `<div class="small muted" style="margin-top:2px">Why: ${App.esc(t.reason)}</div>` : '') +
            '</div></label>').join('')
          : App.emptyState('check', 'This vehicle\'s open tasks already cover what it needs right now.'));
    } catch (error) {
      body.innerHTML = App.emptyState('alert', error.message);
    } finally {
      button.disabled = false;
      button.textContent = 'Generate again';
      updateAddButton();
    }
  }

  async function addSelected() {
    const add = dialog.querySelector('#planAdd');
    const vehicleId = Number(dialog.querySelector('#planVehicle').value);
    const picked = Array.from(dialog.querySelectorAll('#planBody input[type=checkbox]:checked'))
      .map((box) => state.plan.tasks[Number(box.dataset.index)]);
    if (!picked.length) return;
    add.disabled = true;
    add.textContent = 'Adding…';
    let created = 0;
    try {
      for (const t of picked) {
        await api.post('/api/maintenance', {
          vehicle_id: vehicleId,
          title: t.title,
          description: [t.description, t.reason ? `Why: ${t.reason}` : ''].filter(Boolean).join('\n').slice(0, 1000),
          due_date: addDays(t.due_in_days),
          priority: t.priority
        });
        created += 1;
      }
      App.toast(`${created} task${created === 1 ? '' : 's'} added to Maintenance.`, 'success');
      App.closeDialog(dialog);
      if (typeof state.onCreated === 'function') state.onCreated(created);
    } catch (error) {
      App.toast(created ? `${created} added, then: ${error.message}` : error.message, 'error');
      updateAddButton();
    }
  }

  function open({ vehicles, vehicleId, onCreated } = {}) {
    const d = ensureDialog();
    state = { vehicles: vehicles || [], plan: null, onCreated };
    const select = d.querySelector('#planVehicle');
    select.innerHTML = '<option value="">Choose a vehicle</option>' + state.vehicles.map((v) =>
      `<option value="${v.id}">${App.esc(v.make)} ${App.esc(v.model)} · ${App.esc(v.registration_number)}</option>`).join('');
    d.querySelector('#planBody').innerHTML =
      '<p class="small muted">The assistant looks at the vehicle type, how long it has been parked, its service history and open tasks, ' +
      'then suggests what to do in the next 30 days. You choose which tasks to add.</p>';
    d.querySelector('#planGenerate').textContent = 'Generate';
    updateAddButton();
    App.openDialog(d);
    if (vehicleId) {
      select.value = String(vehicleId);
      if (select.value) generate();
    }
  }

  window.CarePlan = { open };
})();
