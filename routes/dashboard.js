// Dashboard summary, shaped for the logged-in user's role.
const express = require('express');
const { pool } = require('../config/db');
const { asyncHandler } = require('../utils/http');

const router = express.Router();

async function ownerDashboard(userId) {
  const [[vehicleStats]] = await pool.execute(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(status IN ('parked', 'stored')), 0) AS parked,
            COALESCE(SUM(status = 'in_service'), 0) AS in_service,
            COALESCE(SUM(status = 'active'), 0) AS active
     FROM vehicles WHERE owner_id = ?`,
    [userId]
  );
  const [[taskStats]] = await pool.execute(
    `SELECT COALESCE(SUM(t.status IN ('pending', 'in_progress')), 0) AS open_tasks,
            COALESCE(SUM(t.status IN ('pending', 'in_progress') AND t.due_date < CURDATE()), 0) AS overdue,
            COALESCE(SUM(t.status IN ('pending', 'in_progress')
                AND t.due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)), 0) AS due_this_week
     FROM maintenance_tasks t JOIN vehicles v ON v.id = t.vehicle_id
     WHERE v.owner_id = ?`,
    [userId]
  );
  const [[spend]] = await pool.execute(
    `SELECT COALESCE(SUM(r.cost), 0) AS this_year
     FROM maintenance_records r JOIN vehicles v ON v.id = r.vehicle_id
     WHERE v.owner_id = ? AND YEAR(r.service_date) = YEAR(CURDATE())`,
    [userId]
  );
  const [[requests]] = await pool.execute(
    "SELECT COUNT(*) AS pending FROM service_requests WHERE owner_id = ? AND status = 'pending'",
    [userId]
  );
  const [upcoming] = await pool.execute(
    `SELECT t.id, t.title, t.due_date, t.priority, t.status,
            v.make, v.model, v.registration_number, a.full_name AS assignee_name,
            (t.due_date < CURDATE()) AS is_overdue
     FROM maintenance_tasks t
     JOIN vehicles v ON v.id = t.vehicle_id
     LEFT JOIN users a ON a.id = t.assigned_to
     WHERE v.owner_id = ? AND t.status IN ('pending', 'in_progress')
     ORDER BY t.due_date ASC LIMIT 6`,
    [userId]
  );
  const [longestParked] = await pool.execute(
    `SELECT id, make, model, registration_number, status, parked_since, location,
            DATEDIFF(CURDATE(), parked_since) AS days_parked
     FROM vehicles
     WHERE owner_id = ? AND status IN ('parked', 'stored') AND parked_since IS NOT NULL
     ORDER BY parked_since ASC LIMIT 5`,
    [userId]
  );
  return {
    role: 'owner',
    stats: {
      vehicles: vehicleStats.total,
      parked: Number(vehicleStats.parked),
      in_service: Number(vehicleStats.in_service),
      active: Number(vehicleStats.active),
      open_tasks: Number(taskStats.open_tasks),
      overdue: Number(taskStats.overdue),
      due_this_week: Number(taskStats.due_this_week),
      spend_this_year: Number(spend.this_year),
      pending_requests: requests.pending
    },
    upcoming,
    longest_parked: longestParked
  };
}

async function caretakerDashboard(userId) {
  const [[taskStats]] = await pool.execute(
    `SELECT COALESCE(SUM(status IN ('pending', 'in_progress')), 0) AS open_tasks,
            COALESCE(SUM(status = 'in_progress'), 0) AS in_progress,
            COALESCE(SUM(status IN ('pending', 'in_progress') AND due_date < CURDATE()), 0) AS overdue,
            COALESCE(SUM(status IN ('pending', 'in_progress')
                AND due_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)), 0) AS due_this_week,
            COALESCE(SUM(status = 'completed'
                AND completed_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')), 0) AS completed_this_month,
            COUNT(DISTINCT CASE WHEN status IN ('pending', 'in_progress') THEN vehicle_id END) AS vehicles
     FROM maintenance_tasks WHERE assigned_to = ?`,
    [userId]
  );
  const [[requests]] = await pool.execute(
    "SELECT COUNT(*) AS pending FROM service_requests WHERE provider_id = ? AND status = 'pending'",
    [userId]
  );
  const [[earned]] = await pool.execute(
    `SELECT COALESCE(SUM(cost), 0) AS this_month FROM maintenance_records
     WHERE performed_by = ? AND service_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')`,
    [userId]
  );
  const [upcoming] = await pool.execute(
    `SELECT t.id, t.title, t.due_date, t.priority, t.status,
            v.make, v.model, v.registration_number, v.location, o.full_name AS owner_name,
            (t.due_date < CURDATE()) AS is_overdue
     FROM maintenance_tasks t
     JOIN vehicles v ON v.id = t.vehicle_id
     JOIN users o ON o.id = v.owner_id
     WHERE t.assigned_to = ? AND t.status IN ('pending', 'in_progress')
     ORDER BY t.due_date ASC LIMIT 6`,
    [userId]
  );
  return {
    role: 'caretaker',
    stats: {
      open_tasks: Number(taskStats.open_tasks),
      in_progress: Number(taskStats.in_progress),
      overdue: Number(taskStats.overdue),
      due_this_week: Number(taskStats.due_this_week),
      completed_this_month: Number(taskStats.completed_this_month),
      vehicles: Number(taskStats.vehicles),
      pending_requests: requests.pending,
      billed_this_month: Number(earned.this_month)
    },
    upcoming
  };
}

router.get('/', asyncHandler(async (req, res) => {
  const { id, role } = req.session.user;
  const data = role === 'owner' ? await ownerDashboard(id) : await caretakerDashboard(id);
  res.json(data);
}));

module.exports = router;
