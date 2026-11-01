// Vehicles: owners manage their own; caretakers see only vehicles
// that have at least one task assigned to them.
const express = require('express');
const { pool } = require('../config/db');
const { requireRole } = require('../middleware/roles');
const { asyncHandler, HttpError, parseId } = require('../utils/http');
const { validate, today } = require('../utils/validate');

const router = express.Router();

const VEHICLE_TYPES = ['car', 'motorcycle', 'scooter', 'truck', 'van', 'other'];
const VEHICLE_STATUSES = ['active', 'parked', 'in_service', 'stored'];

const vehicleRules = {
  make: { type: 'string', required: true, max: 60, label: 'Make' },
  model: { type: 'string', required: true, max: 60, label: 'Model' },
  year: { type: 'int', min: 1900, max: new Date().getFullYear() + 1, label: 'Year' },
  registration_number: { type: 'string', required: true, min: 2, max: 20, label: 'Registration number' },
  vehicle_type: { type: 'enum', required: true, values: VEHICLE_TYPES, label: 'Vehicle type' },
  status: { type: 'enum', required: true, values: VEHICLE_STATUSES, label: 'Status' },
  parked_since: { type: 'date', label: 'Parked since' },
  location: { type: 'string', max: 150, label: 'Location' },
  notes: { type: 'string', max: 500, label: 'Notes' }
};

function cleanVehicle(body) {
  const data = validate(body, vehicleRules);
  data.registration_number = data.registration_number.toUpperCase().replace(/\s+/g, ' ');
  if (data.parked_since && data.parked_since > today()) {
    throw new HttpError(400, 'Parked since cannot be in the future.', { parked_since: 'Cannot be in the future.' });
  }
  // A parked or stored vehicle should know since when.
  if ((data.status === 'parked' || data.status === 'stored') && !data.parked_since) {
    data.parked_since = today();
  }
  return data;
}

function duplicateRegistration(err) {
  if (err.code === 'ER_DUP_ENTRY') {
    return new HttpError(409, 'You already have a vehicle with this registration number.', {
      registration_number: 'Already used for another of your vehicles.'
    });
  }
  return err;
}

// Columns plus a few useful counts for list views.
const OWNER_LIST_SQL = `
  SELECT v.*,
    (SELECT COUNT(*) FROM maintenance_tasks t
       WHERE t.vehicle_id = v.id AND t.status IN ('pending', 'in_progress')) AS open_tasks,
    (SELECT MIN(t.due_date) FROM maintenance_tasks t
       WHERE t.vehicle_id = v.id AND t.status IN ('pending', 'in_progress')) AS next_due,
    (SELECT MAX(r.service_date) FROM maintenance_records r WHERE r.vehicle_id = v.id) AS last_service
  FROM vehicles v
  WHERE v.owner_id = ?`;

const CARETAKER_LIST_SQL = `
  SELECT v.id, v.make, v.model, v.year, v.registration_number, v.vehicle_type, v.status,
         v.parked_since, v.location, v.notes, u.full_name AS owner_name, u.phone AS owner_phone,
    (SELECT COUNT(*) FROM maintenance_tasks t
       WHERE t.vehicle_id = v.id AND t.assigned_to = ? AND t.status IN ('pending', 'in_progress')) AS open_tasks,
    (SELECT MIN(t.due_date) FROM maintenance_tasks t
       WHERE t.vehicle_id = v.id AND t.assigned_to = ? AND t.status IN ('pending', 'in_progress')) AS next_due,
    (SELECT MAX(r.service_date) FROM maintenance_records r WHERE r.vehicle_id = v.id) AS last_service
  FROM vehicles v
  JOIN users u ON u.id = v.owner_id
  WHERE EXISTS (SELECT 1 FROM maintenance_tasks t WHERE t.vehicle_id = v.id AND t.assigned_to = ?)`;

router.get('/', asyncHandler(async (req, res) => {
  const { id, role } = req.session.user;
  const status = req.query.status;
  if (status && !VEHICLE_STATUSES.includes(status)) throw new HttpError(400, 'Unknown status filter.');

  let sql;
  let params;
  if (role === 'owner') {
    sql = OWNER_LIST_SQL;
    params = [id];
  } else {
    sql = CARETAKER_LIST_SQL;
    params = [id, id, id];
  }
  if (status) {
    sql += ' AND v.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY v.created_at DESC, v.id DESC';

  const [rows] = await pool.execute(sql, params);
  res.json({ vehicles: rows });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const vehicleId = parseId(req.params.id, 'vehicle id');
  const { id, role } = req.session.user;
  const [rows] = role === 'owner'
    ? await pool.execute(`${OWNER_LIST_SQL} AND v.id = ?`, [id, vehicleId])
    : await pool.execute(`${CARETAKER_LIST_SQL} AND v.id = ?`, [id, id, id, vehicleId]);
  if (!rows.length) throw new HttpError(404, 'Vehicle not found.');
  res.json({ vehicle: rows[0] });
}));

router.post('/', requireRole('owner'), asyncHandler(async (req, res) => {
  const data = cleanVehicle(req.body);
  let result;
  try {
    [result] = await pool.execute(
      `INSERT INTO vehicles (owner_id, make, model, year, registration_number, vehicle_type,
         status, parked_since, location, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.session.user.id, data.make, data.model, data.year, data.registration_number,
        data.vehicle_type, data.status, data.parked_since, data.location, data.notes]
    );
  } catch (err) {
    throw duplicateRegistration(err);
  }
  const [rows] = await pool.execute(`${OWNER_LIST_SQL} AND v.id = ?`, [req.session.user.id, result.insertId]);
  res.status(201).json({ vehicle: rows[0] });
}));

router.put('/:id', requireRole('owner'), asyncHandler(async (req, res) => {
  const vehicleId = parseId(req.params.id, 'vehicle id');
  const data = cleanVehicle(req.body);
  let result;
  try {
    [result] = await pool.execute(
      `UPDATE vehicles SET make = ?, model = ?, year = ?, registration_number = ?, vehicle_type = ?,
         status = ?, parked_since = ?, location = ?, notes = ?
       WHERE id = ? AND owner_id = ?`,
      [data.make, data.model, data.year, data.registration_number, data.vehicle_type,
        data.status, data.parked_since, data.location, data.notes, vehicleId, req.session.user.id]
    );
  } catch (err) {
    throw duplicateRegistration(err);
  }
  if (result.affectedRows === 0) throw new HttpError(404, 'Vehicle not found.');
  const [rows] = await pool.execute(`${OWNER_LIST_SQL} AND v.id = ?`, [req.session.user.id, vehicleId]);
  res.json({ vehicle: rows[0] });
}));

router.delete('/:id', requireRole('owner'), asyncHandler(async (req, res) => {
  const vehicleId = parseId(req.params.id, 'vehicle id');
  // Tasks, records and requests for the vehicle are removed by ON DELETE CASCADE.
  const [result] = await pool.execute(
    'DELETE FROM vehicles WHERE id = ? AND owner_id = ?',
    [vehicleId, req.session.user.id]
  );
  if (result.affectedRows === 0) throw new HttpError(404, 'Vehicle not found.');
  res.json({ ok: true });
}));

module.exports = router;
