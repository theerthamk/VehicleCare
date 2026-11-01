// Service providers directory and service requests.
// Flow: owner creates request -> provider accepts (a maintenance task is
// created and assigned to them) or declines -> provider completes the task,
// which completes the request with the recorded cost.
const express = require('express');
const { pool, withTransaction } = require('../config/db');
const { requireRole } = require('../middleware/roles');
const { asyncHandler, HttpError, parseId } = require('../utils/http');
const { validate, today } = require('../utils/validate');
const { notify } = require('../services/notificationService');

const router = express.Router();
const REQUEST_STATUSES = ['pending', 'accepted', 'declined', 'cancelled', 'completed'];

// ---------- Providers ----------
router.get('/providers', asyncHandler(async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 60) : '';
  const params = [];
  let filter = '';
  if (q) {
    filter = ' AND (u.full_name LIKE ? OR u.city LIKE ? OR u.specialization LIKE ?)';
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    params.push(like, like, like);
  }
  const [rows] = await pool.execute(
    `SELECT u.id, u.full_name, u.phone, u.city, u.specialization, u.bio, u.created_at,
       (SELECT COUNT(*) FROM maintenance_tasks t WHERE t.assigned_to = u.id AND t.status = 'completed') AS completed_jobs,
       (SELECT COUNT(*) FROM maintenance_tasks t WHERE t.assigned_to = u.id AND t.status IN ('pending', 'in_progress')) AS open_jobs
     FROM users u
     WHERE u.role = 'caretaker'${filter}
     ORDER BY u.full_name
     LIMIT 200`,
    params
  );
  res.json({ providers: rows });
}));

// ---------- Requests ----------
const REQUEST_SELECT = `
  SELECT sr.*, v.make, v.model, v.registration_number, v.location AS vehicle_location,
         o.full_name AS owner_name, o.phone AS owner_phone,
         p.full_name AS provider_name, p.phone AS provider_phone,
         t.status AS task_status
  FROM service_requests sr
  JOIN vehicles v ON v.id = sr.vehicle_id
  JOIN users o ON o.id = sr.owner_id
  JOIN users p ON p.id = sr.provider_id
  LEFT JOIN maintenance_tasks t ON t.id = sr.task_id`;

function scopeFor(user) {
  return user.role === 'owner'
    ? { sql: 'sr.owner_id = ?', params: [user.id] }
    : { sql: 'sr.provider_id = ?', params: [user.id] };
}

async function loadRequest(db, requestId, user, { lock = false } = {}) {
  const scope = scopeFor(user);
  const [rows] = await db.execute(
    `${REQUEST_SELECT} WHERE sr.id = ? AND ${scope.sql}${lock ? ' FOR UPDATE' : ''}`,
    [requestId, ...scope.params]
  );
  if (!rows.length) throw new HttpError(404, 'Service request not found.');
  return rows[0];
}

function vehicleLabel(r) {
  return `${r.make} ${r.model} (${r.registration_number})`;
}

router.get('/requests', asyncHandler(async (req, res) => {
  const scope = scopeFor(req.session.user);
  const params = [...scope.params];
  let sql = `${REQUEST_SELECT} WHERE ${scope.sql}`;
  const status = req.query.status;
  if (status && status !== 'all') {
    if (!REQUEST_STATUSES.includes(status)) throw new HttpError(400, 'Unknown status filter.');
    sql += ' AND sr.status = ?';
    params.push(status);
  }
  sql += " ORDER BY FIELD(sr.status, 'pending', 'accepted', 'completed', 'declined', 'cancelled'), sr.request_date DESC LIMIT 500";
  const [rows] = await pool.execute(sql, params);
  res.json({ requests: rows });
}));

router.post('/requests', requireRole('owner'), asyncHandler(async (req, res) => {
  const owner = req.session.user;
  const data = validate(req.body, {
    vehicle_id: { type: 'int', required: true, min: 1, label: 'Vehicle' },
    provider_id: { type: 'int', required: true, min: 1, label: 'Service provider' },
    service_type: { type: 'string', required: true, min: 3, max: 100, label: 'Service type' },
    details: { type: 'string', max: 1000, label: 'Details' },
    preferred_date: { type: 'date', label: 'Preferred date' }
  });
  if (data.preferred_date && data.preferred_date < today()) {
    throw new HttpError(400, 'Preferred date cannot be in the past.', { preferred_date: 'Cannot be in the past.' });
  }

  const requestId = await withTransaction(async (conn) => {
    const [vehicles] = await conn.execute(
      'SELECT id, make, model, registration_number FROM vehicles WHERE id = ? AND owner_id = ?',
      [data.vehicle_id, owner.id]
    );
    if (!vehicles.length) throw new HttpError(404, 'Vehicle not found.', { vehicle_id: 'Choose one of your vehicles.' });

    const [providers] = await conn.execute(
      "SELECT id FROM users WHERE id = ? AND role = 'caretaker'",
      [data.provider_id]
    );
    if (!providers.length) {
      throw new HttpError(400, 'The selected service provider does not exist.', { provider_id: 'Choose a valid provider.' });
    }

    const [result] = await conn.execute(
      `INSERT INTO service_requests (vehicle_id, owner_id, provider_id, service_type, details, preferred_date)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [data.vehicle_id, owner.id, data.provider_id, data.service_type, data.details, data.preferred_date]
    );
    await notify(conn, data.provider_id, {
      title: 'New service request',
      message: `${owner.full_name} requested "${data.service_type}" for ${vehicleLabel(vehicles[0])}` +
        (data.preferred_date ? ` on ${data.preferred_date}.` : '.'),
      link: '/pages/services.html'
    });
    return result.insertId;
  });

  res.status(201).json({ request: await loadRequest(pool, requestId, owner) });
}));

router.patch('/requests/:id/status', asyncHandler(async (req, res) => {
  const requestId = parseId(req.params.id, 'request id');
  const user = req.session.user;
  const allowed = user.role === 'owner' ? ['cancelled'] : ['accepted', 'declined'];
  const data = validate(req.body, {
    status: { type: 'enum', required: true, values: allowed, label: 'Status' },
    provider_note: { type: 'string', max: 500, label: 'Note' }
  });

  await withTransaction(async (conn) => {
    const request = await loadRequest(conn, requestId, user, { lock: true });

    if (user.role === 'caretaker') {
      if (request.status !== 'pending') {
        throw new HttpError(409, `This request is already ${request.status}.`);
      }
      if (data.status === 'accepted') {
        const due = request.preferred_date && request.preferred_date >= today() ? request.preferred_date : today();
        const [task] = await conn.execute(
          `INSERT INTO maintenance_tasks (vehicle_id, assigned_to, title, description, due_date, priority)
           VALUES (?, ?, ?, ?, ?, 'medium')`,
          [request.vehicle_id, user.id, request.service_type, request.details, due]
        );
        await conn.execute(
          "UPDATE service_requests SET status = 'accepted', task_id = ?, provider_note = ? WHERE id = ?",
          [task.insertId, data.provider_note, requestId]
        );
        await notify(conn, request.owner_id, {
          title: 'Service request accepted',
          message: `${user.full_name} accepted "${request.service_type}" for ${vehicleLabel(request)}. Scheduled for ${due}.`,
          link: '/pages/services.html'
        });
      } else {
        await conn.execute(
          "UPDATE service_requests SET status = 'declined', provider_note = ? WHERE id = ?",
          [data.provider_note, requestId]
        );
        await notify(conn, request.owner_id, {
          title: 'Service request declined',
          message: `${user.full_name} declined "${request.service_type}" for ${vehicleLabel(request)}.` +
            (data.provider_note ? ` Note: ${data.provider_note}` : ''),
          link: '/pages/services.html'
        });
      }
      return;
    }

    // Owner cancelling
    if (!['pending', 'accepted'].includes(request.status)) {
      throw new HttpError(409, `This request is already ${request.status} and cannot be cancelled.`);
    }
    if (request.task_id && ['pending', 'in_progress'].includes(request.task_status)) {
      await conn.execute(
        "UPDATE maintenance_tasks SET status = 'cancelled' WHERE id = ?",
        [request.task_id]
      );
    }
    await conn.execute("UPDATE service_requests SET status = 'cancelled' WHERE id = ?", [requestId]);
    await notify(conn, request.provider_id, {
      title: 'Service request cancelled',
      message: `${user.full_name} cancelled "${request.service_type}" for ${vehicleLabel(request)}.`,
      link: '/pages/services.html'
    });
  });

  res.json({ request: await loadRequest(pool, requestId, user) });
}));

module.exports = router;
