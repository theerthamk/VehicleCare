// Maintenance tasks and their records (inspections / completed work).
//   Owners: tasks on their own vehicles (create, edit, assign, cancel, delete, complete).
//   Caretakers: only tasks assigned to them (start, record inspection, complete).
const express = require('express');
const { pool, withTransaction } = require('../config/db');
const { requireRole } = require('../middleware/roles');
const { asyncHandler, HttpError, parseId } = require('../utils/http');
const { validate, today } = require('../utils/validate');
const { notify } = require('../services/notificationService');

const router = express.Router();

const PRIORITIES = ['low', 'medium', 'high'];
const OPEN = ['pending', 'in_progress'];

const TASK_SELECT = `
  SELECT t.id, t.vehicle_id, t.assigned_to, t.title, t.description, t.due_date, t.status,
         t.priority, t.completed_at, t.created_at,
         v.make, v.model, v.registration_number, v.owner_id,
         o.full_name AS owner_name,
         a.full_name AS assignee_name,
         sr.id AS request_id,
         (t.status IN ('pending', 'in_progress') AND t.due_date < CURDATE()) AS is_overdue,
         (SELECT COALESCE(SUM(r.cost), 0) FROM maintenance_records r WHERE r.task_id = t.id) AS total_cost
  FROM maintenance_tasks t
  JOIN vehicles v ON v.id = t.vehicle_id
  JOIN users o ON o.id = v.owner_id
  LEFT JOIN users a ON a.id = t.assigned_to
  LEFT JOIN service_requests sr ON sr.task_id = t.id`;

// Adds the "who may see this task" condition for the current user.
function scopeFor(user) {
  return user.role === 'owner'
    ? { sql: 'v.owner_id = ?', params: [user.id] }
    : { sql: 't.assigned_to = ?', params: [user.id] };
}

async function loadTask(db, taskId, user, { lock = false } = {}) {
  const scope = scopeFor(user);
  const [rows] = await db.execute(
    `${TASK_SELECT} WHERE t.id = ? AND ${scope.sql}${lock ? ' FOR UPDATE' : ''}`,
    [taskId, ...scope.params]
  );
  if (!rows.length) throw new HttpError(404, 'Maintenance task not found.');
  return rows[0];
}

async function assertCaretaker(db, userId) {
  const [rows] = await db.execute("SELECT id FROM users WHERE id = ? AND role = 'caretaker'", [userId]);
  if (!rows.length) {
    throw new HttpError(400, 'The selected caretaker does not exist.', { assigned_to: 'Choose a valid caretaker.' });
  }
}

function vehicleLabel(t) {
  return `${t.make} ${t.model} (${t.registration_number})`;
}

// ---------- List ----------
router.get('/', asyncHandler(async (req, res) => {
  const user = req.session.user;
  const scope = scopeFor(user);
  const where = [scope.sql];
  const params = [...scope.params];

  const status = req.query.status || 'all';
  if (status === 'open') {
    where.push("t.status IN ('pending', 'in_progress')");
  } else if (status === 'overdue') {
    where.push("t.status IN ('pending', 'in_progress') AND t.due_date < CURDATE()");
  } else if (['pending', 'in_progress', 'completed', 'cancelled'].includes(status)) {
    where.push('t.status = ?');
    params.push(status);
  } else if (status !== 'all') {
    throw new HttpError(400, 'Unknown status filter.');
  }

  if (req.query.vehicle_id) {
    where.push('t.vehicle_id = ?');
    params.push(parseId(req.query.vehicle_id, 'vehicle id'));
  }

  const [rows] = await pool.execute(
    `${TASK_SELECT} WHERE ${where.join(' AND ')}
     ORDER BY FIELD(t.status, 'in_progress', 'pending', 'completed', 'cancelled'),
              CASE WHEN t.status IN ('completed', 'cancelled') THEN NULL ELSE t.due_date END ASC,
              t.completed_at DESC, t.id DESC
     LIMIT 500`,
    params
  );
  res.json({ tasks: rows });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const task = await loadTask(pool, parseId(req.params.id, 'task id'), req.session.user);
  const [records] = await pool.execute(
    `SELECT r.*, u.full_name AS performed_by_name
     FROM maintenance_records r LEFT JOIN users u ON u.id = r.performed_by
     WHERE r.task_id = ? ORDER BY r.service_date DESC, r.id DESC`,
    [task.id]
  );
  res.json({ task, records });
}));

// ---------- Create (owner) ----------
const taskRules = {
  vehicle_id: { type: 'int', required: true, min: 1, label: 'Vehicle' },
  title: { type: 'string', required: true, min: 3, max: 120, label: 'Title' },
  description: { type: 'string', max: 1000, label: 'Description' },
  due_date: { type: 'date', required: true, label: 'Due date' },
  priority: { type: 'enum', required: true, values: PRIORITIES, label: 'Priority' },
  assigned_to: { type: 'int', min: 1, label: 'Caretaker' }
};

router.post('/', requireRole('owner'), asyncHandler(async (req, res) => {
  const data = validate(req.body, taskRules);
  const owner = req.session.user;

  const taskId = await withTransaction(async (conn) => {
    const [vehicles] = await conn.execute(
      'SELECT id, make, model, registration_number FROM vehicles WHERE id = ? AND owner_id = ?',
      [data.vehicle_id, owner.id]
    );
    if (!vehicles.length) throw new HttpError(404, 'Vehicle not found.', { vehicle_id: 'Choose one of your vehicles.' });
    if (data.assigned_to) await assertCaretaker(conn, data.assigned_to);

    const [result] = await conn.execute(
      `INSERT INTO maintenance_tasks (vehicle_id, assigned_to, title, description, due_date, priority)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [data.vehicle_id, data.assigned_to, data.title, data.description, data.due_date, data.priority]
    );
    if (data.assigned_to) {
      await notify(conn, data.assigned_to, {
        title: 'New task assigned',
        message: `${owner.full_name} assigned "${data.title}" for ${vehicleLabel(vehicles[0])}, due ${data.due_date}.`,
        link: '/pages/maintenance.html',
        dueAt: `${data.due_date} 09:00:00`
      });
    }
    return result.insertId;
  });

  res.status(201).json({ task: await loadTask(pool, taskId, owner) });
}));

// ---------- Edit (owner, open tasks only) ----------
router.put('/:id', requireRole('owner'), asyncHandler(async (req, res) => {
  const taskId = parseId(req.params.id, 'task id');
  const owner = req.session.user;
  const { vehicle_id, ...editRules } = taskRules; // the vehicle of a task cannot change
  const data = validate(req.body, editRules);

  await withTransaction(async (conn) => {
    const task = await loadTask(conn, taskId, owner, { lock: true });
    if (!OPEN.includes(task.status)) {
      throw new HttpError(409, 'Only pending or in-progress tasks can be edited.');
    }
    if (task.request_id && data.assigned_to !== task.assigned_to) {
      throw new HttpError(409, 'This task belongs to an accepted service request, so its caretaker cannot be changed.');
    }
    if (data.assigned_to) await assertCaretaker(conn, data.assigned_to);

    // reminder_sent_at is set first: MySQL applies SET assignments left to
    // right, so due_date still holds the old value at that point. A new due
    // date clears it so a fresh reminder is sent.
    await conn.execute(
      `UPDATE maintenance_tasks
       SET reminder_sent_at = IF(due_date = ?, reminder_sent_at, NULL),
           title = ?, description = ?, due_date = ?, priority = ?, assigned_to = ?
       WHERE id = ?`,
      [data.due_date, data.title, data.description, data.due_date, data.priority, data.assigned_to, taskId]
    );

    if (data.assigned_to && data.assigned_to !== task.assigned_to) {
      await notify(conn, data.assigned_to, {
        title: 'New task assigned',
        message: `${owner.full_name} assigned "${data.title}" for ${vehicleLabel(task)}, due ${data.due_date}.`,
        link: '/pages/maintenance.html',
        dueAt: `${data.due_date} 09:00:00`
      });
    }
    if (task.assigned_to && data.assigned_to !== task.assigned_to) {
      await notify(conn, task.assigned_to, {
        title: 'Task unassigned',
        message: `"${task.title}" for ${vehicleLabel(task)} is no longer assigned to you.`,
        link: '/pages/maintenance.html'
      });
    }
  });

  res.json({ task: await loadTask(pool, taskId, owner) });
}));

// ---------- Status change ----------
router.patch('/:id/status', asyncHandler(async (req, res) => {
  const taskId = parseId(req.params.id, 'task id');
  const user = req.session.user;
  const allowed = user.role === 'owner' ? ['pending', 'in_progress', 'cancelled'] : ['pending', 'in_progress'];
  const { status } = validate(req.body, {
    status: { type: 'enum', required: true, values: allowed, label: 'Status' }
  });

  await withTransaction(async (conn) => {
    const task = await loadTask(conn, taskId, user, { lock: true });
    if (!OPEN.includes(task.status)) {
      throw new HttpError(409, `This task is already ${task.status} and cannot be changed.`);
    }
    if (task.status === status) return;

    await conn.execute('UPDATE maintenance_tasks SET status = ? WHERE id = ?', [status, taskId]);

    if (status === 'cancelled' && task.request_id) {
      await conn.execute(
        "UPDATE service_requests SET status = 'cancelled' WHERE id = ? AND status = 'accepted'",
        [task.request_id]
      );
    }
    if (user.role === 'caretaker' && status === 'in_progress') {
      await notify(conn, task.owner_id, {
        title: 'Work started',
        message: `${user.full_name} started "${task.title}" on ${vehicleLabel(task)}.`,
        link: '/pages/maintenance.html'
      });
    }
    if (status === 'cancelled' && task.assigned_to) {
      await notify(conn, task.assigned_to, {
        title: 'Task cancelled',
        message: `The owner cancelled "${task.title}" for ${vehicleLabel(task)}.`,
        link: '/pages/maintenance.html'
      });
    }
  });

  res.json({ task: await loadTask(pool, taskId, user) });
}));

// ---------- Record inspection or completion ----------
router.post('/:id/records', asyncHandler(async (req, res) => {
  const taskId = parseId(req.params.id, 'task id');
  const user = req.session.user;
  const data = validate(req.body, {
    record_type: { type: 'enum', required: true, values: ['inspection', 'maintenance'], label: 'Record type' },
    service_date: { type: 'date', required: true, label: 'Service date' },
    notes: { type: 'string', max: 1000, label: 'Notes' },
    cost: { type: 'money', label: 'Cost' }
  });
  const markComplete = req.body.mark_complete === true || req.body.mark_complete === 'true';
  if (data.service_date > today()) {
    throw new HttpError(400, 'Service date cannot be in the future.', { service_date: 'Cannot be in the future.' });
  }
  if (data.record_type === 'maintenance' && !markComplete && !data.notes) {
    throw new HttpError(400, 'Add notes describing the work done.', { notes: 'Notes are required.' });
  }

  const recordId = await withTransaction(async (conn) => {
    const task = await loadTask(conn, taskId, user, { lock: true });
    if (!OPEN.includes(task.status)) {
      throw new HttpError(409, `This task is already ${task.status}. Records can only be added to open tasks.`);
    }

    const [result] = await conn.execute(
      `INSERT INTO maintenance_records (vehicle_id, task_id, performed_by, record_type, service_date, notes, cost)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [task.vehicle_id, task.id, user.id, data.record_type, data.service_date, data.notes, data.cost || 0]
    );

    if (markComplete) {
      await conn.execute(
        "UPDATE maintenance_tasks SET status = 'completed', completed_at = NOW() WHERE id = ?",
        [task.id]
      );
      if (task.request_id) {
        await conn.execute(
          `UPDATE service_requests
           SET status = 'completed',
               cost = (SELECT COALESCE(SUM(cost), 0) FROM maintenance_records WHERE task_id = ?)
           WHERE id = ?`,
          [task.id, task.request_id]
        );
      }
    } else if (task.status === 'pending') {
      await conn.execute("UPDATE maintenance_tasks SET status = 'in_progress' WHERE id = ?", [task.id]);
    }

    if (user.role === 'caretaker') {
      const total = Number(task.total_cost) + (data.cost || 0);
      await notify(conn, task.owner_id, markComplete
        ? {
          title: 'Maintenance completed',
          message: `${user.full_name} completed "${task.title}" on ${vehicleLabel(task)}. Total cost: ${total.toFixed(2)}.`,
          link: '/pages/history.html'
        }
        : {
          title: data.record_type === 'inspection' ? 'Inspection recorded' : 'Work update',
          message: `${user.full_name} added a${data.record_type === 'inspection' ? 'n inspection' : ' work'} note for "${task.title}" on ${vehicleLabel(task)}.`,
          link: '/pages/maintenance.html'
        });
    } else if (markComplete && task.assigned_to) {
      await notify(conn, task.assigned_to, {
        title: 'Task closed by owner',
        message: `The owner marked "${task.title}" on ${vehicleLabel(task)} as completed.`,
        link: '/pages/maintenance.html'
      });
    }
    return result.insertId;
  });

  const [records] = await pool.execute('SELECT * FROM maintenance_records WHERE id = ?', [recordId]);
  res.status(201).json({ record: records[0], task: await loadTask(pool, taskId, user) });
}));

// ---------- Delete (owner) ----------
router.delete('/:id', requireRole('owner'), asyncHandler(async (req, res) => {
  const taskId = parseId(req.params.id, 'task id');
  const owner = req.session.user;

  await withTransaction(async (conn) => {
    const task = await loadTask(conn, taskId, owner, { lock: true });
    if (task.status === 'completed') {
      throw new HttpError(409, 'Completed tasks are part of the service history and cannot be deleted.');
    }
    if (task.request_id) {
      await conn.execute(
        "UPDATE service_requests SET status = 'cancelled' WHERE id = ? AND status = 'accepted'",
        [task.request_id]
      );
    }
    await conn.execute('DELETE FROM maintenance_tasks WHERE id = ?', [taskId]);
    if (task.assigned_to && OPEN.includes(task.status)) {
      await notify(conn, task.assigned_to, {
        title: 'Task removed',
        message: `The owner removed "${task.title}" for ${vehicleLabel(task)}.`,
        link: '/pages/maintenance.html'
      });
    }
  });

  res.json({ ok: true });
}));

module.exports = router;
