// Maintenance history and expense summaries.
//   Owners: records for their own vehicles.
//   Caretakers: records they performed themselves.
const express = require('express');
const { pool } = require('../config/db');
const { asyncHandler, HttpError, parseId } = require('../utils/http');
const { isRealDate } = require('../utils/validate');

const router = express.Router();

function scopeFor(user) {
  return user.role === 'owner'
    ? { sql: 'v.owner_id = ?', params: [user.id] }
    : { sql: 'r.performed_by = ?', params: [user.id] };
}

function buildFilters(req) {
  const scope = scopeFor(req.session.user);
  const where = [scope.sql];
  const params = [...scope.params];
  const { vehicle_id: vehicleId, from, to } = req.query;
  if (vehicleId) {
    where.push('r.vehicle_id = ?');
    params.push(parseId(vehicleId, 'vehicle id'));
  }
  if (from) {
    if (!isRealDate(from)) throw new HttpError(400, 'Invalid "from" date.');
    where.push('r.service_date >= ?');
    params.push(from);
  }
  if (to) {
    if (!isRealDate(to)) throw new HttpError(400, 'Invalid "to" date.');
    where.push('r.service_date <= ?');
    params.push(to);
  }
  return { where: where.join(' AND '), params };
}

router.get('/history', asyncHandler(async (req, res) => {
  const { where, params } = buildFilters(req);
  const [records] = await pool.execute(
    `SELECT r.id, r.vehicle_id, r.task_id, r.record_type, r.service_date, r.notes, r.cost, r.ai_condition,
            (SELECT COUNT(*) FROM record_photos p WHERE p.record_id = r.id) AS photo_count,
            v.make, v.model, v.registration_number,
            t.title AS task_title, u.full_name AS performed_by_name
     FROM maintenance_records r
     JOIN vehicles v ON v.id = r.vehicle_id
     LEFT JOIN maintenance_tasks t ON t.id = r.task_id
     LEFT JOIN users u ON u.id = r.performed_by
     WHERE ${where}
     ORDER BY r.service_date DESC, r.id DESC
     LIMIT 1000`,
    params
  );
  res.json({ records });
}));

router.get('/expenses', asyncHandler(async (req, res) => {
  const { where, params } = buildFilters(req);
  const [[totals]] = await pool.execute(
    `SELECT COALESCE(SUM(r.cost), 0) AS total, COUNT(*) AS records
     FROM maintenance_records r JOIN vehicles v ON v.id = r.vehicle_id
     WHERE ${where}`,
    params
  );
  const [byVehicle] = await pool.execute(
    `SELECT v.id AS vehicle_id, v.make, v.model, v.registration_number,
            COALESCE(SUM(r.cost), 0) AS total, COUNT(*) AS records, MAX(r.service_date) AS last_service
     FROM maintenance_records r JOIN vehicles v ON v.id = r.vehicle_id
     WHERE ${where}
     GROUP BY v.id, v.make, v.model, v.registration_number
     ORDER BY total DESC`,
    params
  );
  const [byMonth] = await pool.execute(
    `SELECT DATE_FORMAT(r.service_date, '%Y-%m') AS month, COALESCE(SUM(r.cost), 0) AS total
     FROM maintenance_records r JOIN vehicles v ON v.id = r.vehicle_id
     WHERE ${where} AND r.service_date >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 11 MONTH)
     GROUP BY DATE_FORMAT(r.service_date, '%Y-%m')
     ORDER BY month`,
    params
  );
  res.json({ total: Number(totals.total), records: totals.records, by_vehicle: byVehicle, by_month: byMonth });
}));

module.exports = router;
