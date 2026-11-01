// Maintenance page.
//   Owner: create / edit / assign / cancel / delete tasks, record own work.
//   Caretaker: start assigned tasks, record inspections, complete work.
(function () {
  'use strict';

  const { esc, badge, fmtDate, fmtDateTime, relativeDue, money, emptyState } = App;

  const table = document.getElementById('taskTable');
  const vehicleFilter = document.getElementById('vehicleFilter');
  const taskDialog = document.getElementById('taskDialog');
  const taskForm = document.getElementById('taskForm');
  const detailDialog = document.getElementById('detailDialog');
  const recordDialog = document.getElementById('recordDialog');
  const recordForm = document.getElementById('recordForm');

  let user;
  let tasks = [];
  let vehicles = [];
  let providers = [];
  let statusFilter = 'open';
  let editingTask = null;

  const isOwner = () => user.role === 'owner';
  const isOpen = (t) => t.status === 'pending' || t.status === 'in_progress';

  // ---------- Table ----------
  function rowActions(t) {
    let html = `<button type="button" class="btn btn-ghost btn-sm" data-action="details" data-id="${t.id}">Details</button>`;
    if (!isOpen(t)) return html;
    if (isOwner()) {
      html += `<button type="button" class="btn btn-secondary btn-sm" data-action="edit" data-id="${t.id}">Edit</button>`;
      html += `<button type="button" class="btn btn-success btn-sm" data-action="complete" data-id="${t.id}">Complete</button>`;
    } else if (t.status === 'pending') {
      html += `<button type="button" class="btn btn-primary btn-sm" data-action="start" data-id="${t.id}">Start</button>`;
    } else {
      html += `<button type="button" class="btn btn-secondary btn-sm" data-action="inspect" data-id="${t.id}">Inspection</button>`;
      html += `<button type="button" class="btn btn-success btn-sm" data-action="complete" data-id="${t.id}">Complete</button>`;
    }
    return html;
  }

  function render() {
    if (!tasks.length) {
      const messages = {
        open: isOwner() ? 'No open tasks. Plan the next check for a parked vehicle.' : 'No open tasks assigned to you.',
        overdue: 'Nothing is overdue.',
        completed: 'No completed tasks yet.',
        cancelled: 'No cancelled tasks.',
        all: isOwner() ? 'No maintenance tasks yet.' : 'No tasks have been assigned to you yet.'
      };
      table.innerHTML = emptyState('clipboard', messages[statusFilter],
        isOwner() && statusFilter === 'open'
          ? '<button type="button" class="btn btn-primary btn-sm" data-action="new">Create a task</button>' : '');
      return;
    }

    table.innerHTML =
      '<table><thead><tr><th>Task</th><th>Due</th><th>Priority</th><th>Status</th>' +
      `<th>${isOwner() ? 'Caretaker' : 'Owner'}</th><th class="num">Cost</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>` +
      tasks.map((t) => {
        const late = Number(t.is_overdue) === 1;
        const dueSub = isOpen(t)
          ? `<div class="secondary" style="${late ? 'color:var(--red);font-weight:600' : ''}">${esc(relativeDue(t.due_date))}</div>`
          : (t.completed_at ? `<div class="secondary">Done ${esc(fmtDate(t.completed_at))}</div>` : '');
        const person = isOwner()
          ? (t.assignee_name ? esc(t.assignee_name) : '<span class="muted">Myself</span>')
          : esc(t.owner_name);
        return `<tr class="${late ? 'overdue' : ''}">` +
          `<td><div class="primary">${esc(t.title)}</div><div class="secondary">${esc(t.make)} ${esc(t.model)} · ${esc(t.registration_number)}` +
          `${t.request_id ? ' · from service request' : ''}</div></td>` +
          `<td data-label="Due" class="nowrap">${esc(fmtDate(t.due_date))}${dueSub}</td>` +
          `<td data-label="Priority">${badge(t.priority)}</td>` +
          `<td data-label="Status">${late ? badge('overdue') : badge(t.status)}</td>` +
          `<td data-label="${isOwner() ? 'Caretaker' : 'Owner'}">${person}</td>` +
          `<td data-label="Cost" class="num">${Number(t.total_cost) ? esc(money(t.total_cost)) : '<span class="muted">—</span>'}</td>` +
          `<td><div class="actions">${rowActions(t)}</div></td></tr>`;
      }).join('') +
      '</tbody></table>';
  }

  async function loadTasks() {
    try {
      const data = await api.get(api.url('/api/maintenance', { status: statusFilter, vehicle_id: vehicleFilter.value }));
      tasks = data.tasks;
      render();
    } catch (error) {
      table.innerHTML = emptyState('alert', error.message);
    }
  }

  // ---------- Task form (owner) ----------
  function fillSelects() {
    const vehicleOptions = vehicles.map((v) =>
      `<option value="${v.id}">${esc(v.make)} ${esc(v.model)} · ${esc(v.registration_number)}</option>`).join('');
    vehicleFilter.innerHTML = '<option value="">All vehicles</option>' + vehicleOptions;
    const preset = new URLSearchParams(location.search).get('vehicle_id');
    if (preset && vehicles.some((v) => String(v.id) === preset)) vehicleFilter.value = preset;

    if (isOwner()) {
      document.getElementById('tVehicle').innerHTML = '<option value="">Choose a vehicle</option>' + vehicleOptions;
      document.getElementById('tAssignee').innerHTML = '<option value="">I will do it myself</option>' +
        providers.map((p) => `<option value="${p.id}">${esc(p.full_name)}${p.city ? ` — ${esc(p.city)}` : ''}` +
          `${p.specialization ? ` (${esc(p.specialization)})` : ''}</option>`).join('');
    }
  }

  function openTaskForm(task) {
    if (!vehicles.length) {
      App.toast('Add a vehicle first, then plan its maintenance.', 'error');
      return;
    }
    editingTask = task || null;
    taskForm.reset();
    App.clearErrors(taskForm);
    document.getElementById('taskDialogTitle').textContent = task ? 'Edit task' : 'New maintenance task';
    const vehicleSelect = taskForm.elements.vehicle_id;
    const assignee = taskForm.elements.assigned_to;
    vehicleSelect.disabled = Boolean(task);
    assignee.disabled = Boolean(task && task.request_id);
    if (task) {
      App.fillForm(taskForm, task);
    } else {
      taskForm.elements.id.value = '';
      if (vehicleFilter.value) vehicleSelect.value = vehicleFilter.value;
      const d = new Date();
      d.setDate(d.getDate() + 7);
      taskForm.elements.due_date.value =
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    App.openDialog(taskDialog);
  }

  App.bindForm(taskForm, async (values) => {
    const payload = {
      title: values.title,
      description: values.description,
      due_date: values.due_date,
      priority: values.priority,
      assigned_to: editingTask && editingTask.request_id ? editingTask.assigned_to : values.assigned_to
    };
    if (editingTask) {
      await api.put(`/api/maintenance/${editingTask.id}`, payload);
      App.toast('Task updated.', 'success');
    } else {
      payload.vehicle_id = values.vehicle_id;
      await api.post('/api/maintenance', payload);
      App.toast(payload.assigned_to ? 'Task created and caretaker notified.' : 'Task created.', 'success');
    }
    App.closeDialog(taskDialog);
    await loadTasks();
  });

  // ---------- Details ----------
  async function openDetails(id) {
    const body = document.getElementById('detailBody');
    const actions = document.getElementById('detailActions');
    body.innerHTML = '<div class="loading">Loading…</div>';
    actions.innerHTML = '';
    App.openDialog(detailDialog);
    try {
      const { task, records } = await api.get(`/api/maintenance/${id}`);
      document.getElementById('detailTitle').textContent = task.title;
      const late = Number(task.is_overdue) === 1;
      body.innerHTML =
        '<dl class="kv">' +
        `<dt>Vehicle</dt><dd>${esc(task.make)} ${esc(task.model)} · ${esc(task.registration_number)}</dd>` +
        `<dt>Owner</dt><dd>${esc(task.owner_name)}</dd>` +
        `<dt>Caretaker</dt><dd>${task.assignee_name ? esc(task.assignee_name) : 'Owner (not assigned)'}</dd>` +
        `<dt>Due</dt><dd>${esc(fmtDate(task.due_date))}${isOpen(task) ? ` · <span style="${late ? 'color:var(--red)' : ''}">${esc(relativeDue(task.due_date))}</span>` : ''}</dd>` +
        `<dt>Status</dt><dd>${badge(task.status)} ${badge(task.priority, `${task.priority} priority`)}</dd>` +
        (task.completed_at ? `<dt>Completed</dt><dd>${esc(fmtDateTime(task.completed_at))}</dd>` : '') +
        `<dt>Total cost</dt><dd>${esc(money(task.total_cost))}</dd>` +
        `<dt>Instructions</dt><dd>${task.description ? esc(task.description) : '<span class="muted">None</span>'}</dd>` +
        '</dl>' +
        '<h3 style="margin-top:20px">Work records</h3>' +
        (records.length
          ? records.map((r) =>
            `<div class="record"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">` +
            `<div>${badge(r.record_type)} <strong>${esc(fmtDate(r.service_date))}</strong>` +
            ` <span class="muted small">by ${esc(r.performed_by_name || 'deleted user')}</span></div>` +
            `<strong>${esc(money(r.cost))}</strong></div>` +
            `${r.notes ? `<p class="small" style="margin:8px 0 0">${esc(r.notes)}</p>` : ''}</div>`).join('')
          : '<p class="muted small" style="margin-top:8px">Nothing recorded yet.</p>');

      let buttons = '<button type="button" class="btn btn-ghost" data-close>Close</button>';
      if (isOpen(task)) {
        if (isOwner()) {
          if (task.status !== 'completed') buttons = `<button type="button" class="btn btn-danger" data-detail="delete" data-id="${task.id}">Delete</button>` +
            `<button type="button" class="btn btn-ghost" data-detail="cancel" data-id="${task.id}">Cancel task</button>` + buttons;
          buttons += `<button type="button" class="btn btn-secondary" data-detail="edit" data-id="${task.id}">Edit</button>`;
          buttons += `<button type="button" class="btn btn-success" data-detail="complete" data-id="${task.id}">Record &amp; complete</button>`;
        } else {
          if (task.status === 'pending') buttons += `<button type="button" class="btn btn-secondary" data-detail="start" data-id="${task.id}">Start work</button>`;
          buttons += `<button type="button" class="btn btn-secondary" data-detail="inspect" data-id="${task.id}">Record inspection</button>`;
          buttons += `<button type="button" class="btn btn-success" data-detail="complete" data-id="${task.id}">Complete</button>`;
        }
      } else if (isOwner() && task.status === 'cancelled') {
        buttons = `<button type="button" class="btn btn-danger" data-detail="delete" data-id="${task.id}">Delete</button>` + buttons;
      }
      actions.innerHTML = buttons;
      detailDialog.dataset.taskId = task.id;
      detailDialog._task = task;
    } catch (error) {
      body.innerHTML = emptyState('alert', error.message);
      actions.innerHTML = '<button type="button" class="btn btn-ghost" data-close>Close</button>';
    }
  }

  // ---------- Record form ----------
  function openRecordForm(task, mode) {
    recordForm.reset();
    App.clearErrors(recordForm);
    recordForm.elements.task_id.value = task.id;
    document.getElementById('recordTaskName').textContent =
      `${task.title} — ${task.make} ${task.model} (${task.registration_number})`;
    const complete = mode === 'complete';
    document.getElementById('recordDialogTitle').textContent = complete ? 'Complete task' : 'Record inspection';
    recordForm.elements.record_type.value = complete ? 'maintenance' : 'inspection';
    recordForm.elements.mark_complete.checked = complete;
    recordForm.elements.service_date.value = App.today();
    recordForm.elements.service_date.max = App.today();
    App.openDialog(recordDialog);
  }

  App.bindForm(recordForm, async (values) => {
    if (values.record_type === 'maintenance' && !values.mark_complete && !values.notes) {
      throw new api.ApiError(400, 'Add notes describing the work done.', { notes: 'Notes are required for a work update.' });
    }
    await api.post(`/api/maintenance/${values.task_id}/records`, {
      record_type: values.record_type,
      service_date: values.service_date,
      cost: values.cost,
      notes: values.notes,
      mark_complete: values.mark_complete
    });
    App.toast(values.mark_complete ? 'Task completed.' : 'Record saved.', 'success');
    App.closeDialog(recordDialog);
    App.closeDialog(detailDialog);
    await loadTasks();
  });

  // ---------- Actions ----------
  async function setStatus(task, status) {
    try {
      await api.patch(`/api/maintenance/${task.id}/status`, { status });
      App.toast(status === 'in_progress' ? 'Marked as in progress.' : `Task ${status.replace('_', ' ')}.`, 'success');
      App.closeDialog(detailDialog);
      await loadTasks();
    } catch (error) {
      App.toast(error.message, 'error');
    }
  }

  async function deleteTask(task) {
    const ok = await App.confirm(`Delete the task "${task.title}"? This cannot be undone.`,
      { title: 'Delete task', confirmText: 'Delete', danger: true });
    if (!ok) return;
    try {
      await api.del(`/api/maintenance/${task.id}`);
      App.toast('Task deleted.', 'success');
      App.closeDialog(detailDialog);
      await loadTasks();
    } catch (error) {
      App.toast(error.message, 'error');
    }
  }

  async function handleAction(action, task) {
    switch (action) {
      case 'details': return openDetails(task.id);
      case 'edit': App.closeDialog(detailDialog); return openTaskForm(task);
      case 'complete': return openRecordForm(task, 'complete');
      case 'inspect': return openRecordForm(task, 'inspect');
      case 'start': return setStatus(task, 'in_progress');
      case 'cancel': {
        const ok = await App.confirm(`Cancel "${task.title}"?${task.request_id ? ' The linked service request will also be cancelled.' : ''}`,
          { title: 'Cancel task', confirmText: 'Cancel task', danger: true });
        if (ok) await setStatus(task, 'cancelled');
        return undefined;
      }
      case 'delete': return deleteTask(task);
      default: return undefined;
    }
  }

  table.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    if (button.dataset.action === 'new') return openTaskForm(null);
    const task = tasks.find((t) => String(t.id) === button.dataset.id);
    if (task) handleAction(button.dataset.action, task);
    return undefined;
  });

  document.getElementById('detailActions').addEventListener('click', (event) => {
    const button = event.target.closest('[data-detail]');
    if (button && detailDialog._task) handleAction(button.dataset.detail, detailDialog._task);
  });

  document.getElementById('statusTabs').addEventListener('click', (event) => {
    const tab = event.target.closest('.tab');
    if (!tab) return;
    document.querySelectorAll('#statusTabs .tab').forEach((t) => t.classList.toggle('active', t === tab));
    statusFilter = tab.dataset.status;
    loadTasks();
  });
  vehicleFilter.addEventListener('change', loadTasks);

  (async function start() {
    user = await App.init({
      page: 'maintenance',
      title: (u) => (u.role === 'owner' ? 'Maintenance' : 'My Tasks'),
      roles: ['owner', 'caretaker']
    });
    if (isOwner()) {
      const btn = document.getElementById('newTaskBtn');
      btn.classList.remove('hidden');
      btn.addEventListener('click', () => openTaskForm(null));
    } else {
      document.getElementById('pageHeading').textContent = 'My Tasks';
      document.getElementById('pageIntro').textContent = 'Work assigned to you. Record inspections and complete tasks with notes and costs.';
    }

    try {
      const requests = [api.get('/api/vehicles')];
      if (isOwner()) requests.push(api.get('/api/services/providers'));
      const [vehicleData, providerData] = await Promise.all(requests);
      vehicles = vehicleData.vehicles;
      providers = providerData ? providerData.providers : [];
      fillSelects();
    } catch (error) {
      App.toast(error.message, 'error');
    }
    await loadTasks();
    if (isOwner() && new URLSearchParams(location.search).get('new') === '1') openTaskForm(null);
  })();
})();
