// Gathers per-vehicle facts used by the health score and the AI assistant.
const { pool } = require('../config/db');
const { healthScore, daysSince, isParked } = require('./careRules');

// Returns Map(vehicleId -> { overdue_tasks, last_service, last_condition, open_task_titles })
async function vehicleStats(vehicleIds) {
  const stats = new Map();
  if (!vehicleIds.length) return stats;
  vehicleIds.forEach((id) => stats.set(id, { overdue_tasks: 0, last_service: null, last_condition: null, open_task_titles: [] }));
  const placeholders = vehicleIds.map(() => '?').join(',');

  const [tasks] = await pool.query(
    `SELECT vehicle_id, title, (due_date < CURDATE()) AS overdue
     FROM maintenance_tasks
     WHERE vehicle_id IN (${placeholders}) AND status IN ('pending', 'in_progress')`,
    vehicleIds
  );
  tasks.forEach((t) => {
    const s = stats.get(t.vehicle_id);
    s.open_task_titles.push(t.title);
    if (Number(t.overdue)) s.overdue_tasks += 1;
  });

  const [records] = await pool.query(
    `SELECT r.vehicle_id, r.service_date, r.ai_condition
     FROM maintenance_records r
     JOIN (SELECT vehicle_id, MAX(id) AS max_id FROM maintenance_records
           WHERE vehicle_id IN (${placeholders}) GROUP BY vehicle_id) latest ON latest.max_id = r.id`,
    vehicleIds
  );
  const [lastDates] = await pool.query(
    `SELECT vehicle_id, MAX(service_date) AS last_service FROM maintenance_records
     WHERE vehicle_id IN (${placeholders}) GROUP BY vehicle_id`,
    vehicleIds
  );
  lastDates.forEach((r) => { stats.get(r.vehicle_id).last_service = r.last_service; });
  records.forEach((r) => { stats.get(r.vehicle_id).last_condition = r.ai_condition; });
  return stats;
}

// Adds a `health` object ({ score, label, reasons }) to each vehicle.
async function withHealth(vehicles) {
  const stats = await vehicleStats(vehicles.map((v) => v.id));
  vehicles.forEach((v) => { v.health = healthScore(v, stats.get(v.id)); });
  return vehicles;
}

// Plain-text summary of a user's vehicles for the AI prompt.
async function ownerContext(ownerId, focusVehicleId) {
  const [vehicles] = await pool.query(
    'SELECT * FROM vehicles WHERE owner_id = ? ORDER BY (id = ?) DESC, id LIMIT 20',
    [ownerId, focusVehicleId || 0]
  );
  const stats = await vehicleStats(vehicles.map((v) => v.id));
  const lines = [];
  for (const v of vehicles) {
    const s = stats.get(v.id);
    const h = healthScore(v, s);
    const parked = isParked(v) && v.parked_since ? `, ${v.status} for ${daysSince(v.parked_since)} days` : `, ${v.status.replace('_', ' ')}`;
    lines.push(`- ${v.make} ${v.model}${v.year ? ` (${v.year})` : ''} [${v.registration_number}], ${v.vehicle_type}${parked}` +
      `${v.location ? `, at ${v.location}` : ''}. Health score ${h.score}/100 (${h.label})` +
      `${h.reasons.length ? `: ${h.reasons.join('; ')}` : ''}. Last care: ${s.last_service || 'never recorded'}.` +
      ` Open tasks: ${s.open_task_titles.length ? s.open_task_titles.join('; ') : 'none'}.` +
      `${v.notes ? ` Owner notes: ${v.notes}` : ''}`);
  }
  const [records] = await pool.query(
    `SELECT r.service_date, r.record_type, r.notes, r.cost, r.ai_condition, v.make, v.model, t.title
     FROM maintenance_records r JOIN vehicles v ON v.id = r.vehicle_id
     LEFT JOIN maintenance_tasks t ON t.id = r.task_id
     WHERE v.owner_id = ? ORDER BY r.service_date DESC, r.id DESC LIMIT 8`,
    [ownerId]
  );
  const history = records.map((r) => `- ${r.service_date} ${r.make} ${r.model}: ${r.title || r.record_type}` +
    `${r.notes ? ` — ${String(r.notes).slice(0, 160)}` : ''} (₹${Number(r.cost).toFixed(0)}${r.ai_condition ? `, condition ${r.ai_condition}` : ''})`);
  return {
    vehicles: vehicles.map((v) => ({ ...v, open_task_titles: stats.get(v.id).open_task_titles })),
    text: `Role: vehicle owner.\nVehicles:\n${lines.join('\n') || '- none added yet'}\n\nRecent care history:\n${history.join('\n') || '- none'}`
  };
}

async function caretakerContext(caretakerId) {
  const [tasks] = await pool.query(
    `SELECT t.title, t.due_date, t.status, t.priority, t.description, v.make, v.model, v.registration_number, v.vehicle_type, v.parked_since, v.status AS vehicle_status
     FROM maintenance_tasks t JOIN vehicles v ON v.id = t.vehicle_id
     WHERE t.assigned_to = ? AND t.status IN ('pending', 'in_progress')
     ORDER BY t.due_date LIMIT 20`,
    [caretakerId]
  );
  const lines = tasks.map((t) => `- ${t.title} for ${t.make} ${t.model} [${t.registration_number}] (${t.vehicle_type}` +
    `${t.parked_since ? `, ${t.vehicle_status} since ${t.parked_since}` : ''}), due ${t.due_date}, ${t.status}, ${t.priority} priority` +
    `${t.description ? `. Instructions: ${String(t.description).slice(0, 160)}` : ''}`);
  return {
    vehicles: [],
    text: `Role: caretaker / service provider who does maintenance work for vehicle owners.\nAssigned open tasks:\n${lines.join('\n') || '- none'}`
  };
}

module.exports = { vehicleStats, withHealth, ownerContext, caretakerContext };
