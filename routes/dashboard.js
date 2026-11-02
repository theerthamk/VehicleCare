// Dashboard summary, shaped for the logged-in user's role.
const express = require('express');
const { pool } = require('../config/db');
const { asyncHandler } = require('../utils/http');
const { withHealth } = require('../services/vehicleInsights');
const { distanceKm, hasCoords } = require('../utils/geo');

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
  const [allVehicles] = await pool.execute(
    'SELECT id, make, model, registration_number, status, parked_since, vehicle_type FROM vehicles WHERE owner_id = ?',
    [userId]
  );
  await withHealth(allVehicles);
  const health = allVehicles
    .map((v) => ({ id: v.id, make: v.make, model: v.model, registration_number: v.registration_number, health: v.health }))
    .sort((a, b) => a.health.score - b.health.score);
  const avgHealth = health.length ? Math.round(health.reduce((sum, v) => sum + v.health.score, 0) / health.length) : null;
  const [[jobs]] = await pool.execute(
    `SELECT COUNT(*) AS open_jobs,
            (SELECT COUNT(*) FROM job_bids b JOIN job_posts j2 ON j2.id = b.job_id
              WHERE j2.owner_id = ? AND j2.status = 'open' AND b.status = 'pending') AS pending_bids
     FROM job_posts WHERE owner_id = ? AND status = 'open'`,
    [userId, userId]
  );
  const [[toRate]] = await pool.execute(
    `SELECT COUNT(*) AS count FROM maintenance_tasks t JOIN vehicles v ON v.id = t.vehicle_id
     LEFT JOIN reviews r ON r.task_id = t.id
     WHERE v.owner_id = ? AND t.status = 'completed' AND t.assigned_to IS NOT NULL AND r.id IS NULL`,
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
      pending_requests: requests.pending,
      avg_health: avgHealth,
      open_jobs: jobs.open_jobs,
      pending_bids: jobs.pending_bids,
      tasks_to_rate: toRate.count
    },
    upcoming,
    longest_parked: longestParked,
    health: health.slice(0, 5)
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
  const [[rating]] = await pool.execute(
    'SELECT ROUND(AVG(rating), 1) AS avg_rating, COUNT(*) AS review_count FROM reviews WHERE caretaker_id = ?',
    [userId]
  );
  const [[me]] = await pool.execute('SELECT latitude, longitude, service_radius_km FROM users WHERE id = ?', [userId]);
  let nearbyJobs = 0;
  if (hasCoords(me)) {
    const [open] = await pool.execute(
      `SELECT v.latitude, v.longitude FROM job_posts j JOIN vehicles v ON v.id = j.vehicle_id
       WHERE j.status = 'open' AND NOT EXISTS (SELECT 1 FROM job_bids b WHERE b.job_id = j.id AND b.caretaker_id = ?)`,
      [userId]
    );
    nearbyJobs = open.filter((v) => { const d = distanceKm(me, v); return d !== null && d <= me.service_radius_km; }).length;
  }
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
      billed_this_month: Number(earned.this_month),
      avg_rating: rating.avg_rating === null ? null : Number(rating.avg_rating),
      review_count: rating.review_count,
      nearby_jobs: nearbyJobs,
      has_location: hasCoords(me)
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
