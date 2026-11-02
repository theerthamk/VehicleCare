// Open job pool.
//   Owner posts a job for one of their vehicles (the vehicle must have a map location).
//   Caretakers whose service radius covers the vehicle see it and place a bid (price + message).
//   Owner compares bids (ranked by match score) and accepts one: a maintenance task is
//   created and assigned to that caretaker; the other bids are rejected.
const express = require('express');
const { pool, withTransaction } = require('../config/db');
const { requireRole } = require('../middleware/roles');
const { asyncHandler, HttpError, parseId } = require('../utils/http');
const { validate, today } = require('../utils/validate');
const { distanceKm, hasCoords } = require('../utils/geo');
const { notify } = require('../services/notificationService');
const { CARETAKER_SELECT, decorate } = require('../services/caretakers');

const router = express.Router();

const JOB_SELECT = `
  SELECT j.*, v.make, v.model, v.registration_number, v.vehicle_type, v.location AS vehicle_location,
         v.latitude, v.longitude, v.status AS vehicle_status, v.parked_since,
         o.full_name AS owner_name,
         (SELECT COUNT(*) FROM job_bids b WHERE b.job_id = j.id AND b.status IN ('pending', 'accepted')) AS bid_count,
         (SELECT MIN(b.price) FROM job_bids b WHERE b.job_id = j.id AND b.status = 'pending') AS lowest_bid,
         (SELECT u.full_name FROM job_bids b JOIN users u ON u.id = b.caretaker_id
            WHERE b.job_id = j.id AND b.status = 'accepted' LIMIT 1) AS assigned_name
  FROM job_posts j
  JOIN vehicles v ON v.id = j.vehicle_id
  JOIN users o ON o.id = j.owner_id`;

function label(j) {
  return `${j.make} ${j.model} (${j.registration_number})`;
}

// What a caretaker may see: approximate location only, and the registration
// number and owner's name only once their bid has been accepted.
function forCaretaker(job, me, myBid) {
  const distance = distanceKm(me, job);
  const { latitude, longitude, registration_number: reg, owner_name: ownerName, ...rest } = job;
  const accepted = myBid && myBid.status === 'accepted';
  return {
    ...rest,
    registration_number: accepted ? reg : null,
    owner_name: accepted ? ownerName : ownerName.split(' ')[0],
    my_bid: myBid || null,
    latitude: latitude === null ? null : Math.round(Number(latitude) * 100) / 100,
    longitude: longitude === null ? null : Math.round(Number(longitude) * 100) / 100,
    distance_km: distance
  };
}

async function loadMe(db, userId) {
  const [rows] = await db.execute('SELECT id, full_name, latitude, longitude, service_radius_km FROM users WHERE id = ?', [userId]);
  return rows[0];
}

function inRange(me, job) {
  const d = distanceKm(me, job);
  return d !== null && d <= Number(me.service_radius_km);
}

// ---------- List ----------
router.get('/', asyncHandler(async (req, res) => {
  const user = req.session.user;
  const status = req.query.status || 'all';
  if (!['all', 'open', 'assigned', 'cancelled'].includes(status)) throw new HttpError(400, 'Unknown status filter.');

  if (user.role === 'owner') {
    const params = [user.id];
    let sql = `${JOB_SELECT} WHERE j.owner_id = ?`;
    if (status !== 'all') {
      sql += ' AND j.status = ?';
      params.push(status);
    }
    const [jobs] = await pool.execute(`${sql} ORDER BY FIELD(j.status, 'open', 'assigned', 'cancelled'), j.created_at DESC LIMIT 200`, params);
    return res.json({ jobs });
  }

  // Caretaker: open jobs inside my service area + jobs I have bid on.
  const me = await loadMe(pool, user.id);
  const [myBids] = await pool.execute(
    'SELECT job_id, price, message, status FROM job_bids WHERE caretaker_id = ?',
    [user.id]
  );
  const bidByJob = new Map(myBids.map((b) => [b.job_id, b]));

  const [openJobs] = await pool.execute(`${JOB_SELECT} WHERE j.status = 'open' ORDER BY j.created_at DESC LIMIT 500`);
  let jobs = openJobs.filter((j) => j.owner_id !== user.id && (bidByJob.has(j.id) || (hasCoords(me) && inRange(me, j))));

  if (myBids.length) {
    const ids = myBids.map((b) => b.job_id).filter((id) => !jobs.some((j) => j.id === id));
    if (ids.length) {
      const [others] = await pool.query(`${JOB_SELECT} WHERE j.id IN (${ids.map(() => '?').join(',')})`, ids);
      jobs = jobs.concat(others);
    }
  }
  jobs = jobs
    .map((j) => forCaretaker(j, me, bidByJob.get(j.id)))
    .filter((j) => status === 'all' || j.status === status)
    .sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) ||
      (a.distance_km ?? 9999) - (b.distance_km ?? 9999));

  res.json({ jobs, needs_location: !hasCoords(me), service_radius_km: me.service_radius_km });
}));

// ---------- Detail ----------
router.get('/:id', asyncHandler(async (req, res) => {
  const jobId = parseId(req.params.id, 'job id');
  const user = req.session.user;
  const [rows] = await pool.execute(`${JOB_SELECT} WHERE j.id = ?`, [jobId]);
  const job = rows[0];
  if (!job) throw new HttpError(404, 'Job not found.');

  if (user.role === 'owner') {
    if (job.owner_id !== user.id) throw new HttpError(404, 'Job not found.');
    const [bids] = await pool.execute(
      'SELECT id AS bid_id, caretaker_id, price, message, status, created_at FROM job_bids WHERE job_id = ? AND status <> \'withdrawn\'',
      [jobId]
    );
    let ranked = [];
    if (bids.length) {
      const [caretakers] = await pool.query(
        `${CARETAKER_SELECT} AND u.id IN (${bids.map(() => '?').join(',')})`,
        bids.map((b) => b.caretaker_id)
      );
      const byId = new Map(caretakers.map((c) => [c.id, decorate(c, job, `${job.title} ${job.description || ''}`)]));
      ranked = bids.map((b) => ({ ...b, caretaker: byId.get(b.caretaker_id) }))
        .sort((a, b) => b.caretaker.match_score - a.caretaker.match_score || a.price - b.price);
      const pending = ranked.filter((b) => b.status === 'pending');
      if (pending.length > 1) pending[0].best_match = true;
    }
    return res.json({ job, bids: ranked });
  }

  const me = await loadMe(pool, user.id);
  const [mine] = await pool.execute('SELECT id, price, message, status FROM job_bids WHERE job_id = ? AND caretaker_id = ?', [jobId, user.id]);
  if (!mine.length && !(job.status === 'open' && inRange(me, job))) throw new HttpError(404, 'Job not found.');
  res.json({ job: forCaretaker(job, me, mine[0]) });
}));

// ---------- Create (owner) ----------
router.post('/', requireRole('owner'), asyncHandler(async (req, res) => {
  const owner = req.session.user;
  const data = validate(req.body, {
    vehicle_id: { type: 'int', required: true, min: 1, label: 'Vehicle' },
    title: { type: 'string', required: true, min: 3, max: 120, label: 'Job title' },
    description: { type: 'string', max: 1000, label: 'Description' },
    preferred_date: { type: 'date', label: 'Preferred date' },
    budget: { type: 'money', label: 'Budget' }
  });
  if (data.preferred_date && data.preferred_date < today()) {
    throw new HttpError(400, 'Preferred date cannot be in the past.', { preferred_date: 'Cannot be in the past.' });
  }

  const result = await withTransaction(async (conn) => {
    const [vehicles] = await conn.execute('SELECT * FROM vehicles WHERE id = ? AND owner_id = ?', [data.vehicle_id, owner.id]);
    const vehicle = vehicles[0];
    if (!vehicle) throw new HttpError(404, 'Vehicle not found.', { vehicle_id: 'Choose one of your vehicles.' });
    if (!hasCoords(vehicle)) {
      throw new HttpError(400, 'Set this vehicle\'s location on the map first (My Vehicles → Edit), so nearby caretakers can find the job.', {
        vehicle_id: 'This vehicle has no map location yet.'
      });
    }
    const [ins] = await conn.execute(
      'INSERT INTO job_posts (owner_id, vehicle_id, title, description, preferred_date, budget) VALUES (?, ?, ?, ?, ?, ?)',
      [owner.id, vehicle.id, data.title, data.description, data.preferred_date, data.budget]
    );

    // Tell every caretaker whose service area covers the vehicle.
    const [caretakers] = await conn.execute(
      "SELECT id, latitude, longitude, service_radius_km FROM users WHERE role = 'caretaker' AND latitude IS NOT NULL"
    );
    const nearby = caretakers.filter((c) => inRange(c, vehicle)).slice(0, 100);
    for (const c of nearby) {
      await notify(conn, c.id, {
        title: 'New job near you',
        message: `"${data.title}" for a ${vehicle.make} ${vehicle.model}, ${distanceKm(c, vehicle)} km away` +
          `${data.budget ? `, budget ₹${data.budget}` : ''}. Place a bid in Find Jobs.`,
        link: '/pages/jobs.html'
      });
    }
    return { id: ins.insertId, notified: nearby.length };
  });

  const [rows] = await pool.execute(`${JOB_SELECT} WHERE j.id = ?`, [result.id]);
  res.status(201).json({ job: rows[0], notified: result.notified });
}));

// ---------- Bid (caretaker) ----------
router.post('/:id/bids', requireRole('caretaker'), asyncHandler(async (req, res) => {
  const jobId = parseId(req.params.id, 'job id');
  const user = req.session.user;
  const data = validate(req.body, {
    price: { type: 'money', required: true, label: 'Your price' },
    message: { type: 'string', max: 500, label: 'Message' }
  });

  const bid = await withTransaction(async (conn) => {
    const [rows] = await conn.execute(`${JOB_SELECT} WHERE j.id = ? FOR UPDATE`, [jobId]);
    const job = rows[0];
    const me = await loadMe(conn, user.id);
    if (!job) throw new HttpError(404, 'Job not found.');
    if (!hasCoords(me)) throw new HttpError(400, 'Set your service location in your Provider Profile before bidding.');
    if (!inRange(me, job)) throw new HttpError(404, 'Job not found.');
    if (job.status !== 'open') throw new HttpError(409, 'This job is no longer open for bids.');

    const [existing] = await conn.execute('SELECT id, status FROM job_bids WHERE job_id = ? AND caretaker_id = ? FOR UPDATE', [jobId, user.id]);
    if (existing.length && ['accepted', 'rejected'].includes(existing[0].status)) {
      throw new HttpError(409, `Your bid was already ${existing[0].status}.`);
    }
    if (existing.length) {
      await conn.execute("UPDATE job_bids SET price = ?, message = ?, status = 'pending' WHERE id = ?", [data.price, data.message, existing[0].id]);
    } else {
      await conn.execute('INSERT INTO job_bids (job_id, caretaker_id, price, message) VALUES (?, ?, ?, ?)', [jobId, user.id, data.price, data.message]);
    }
    await notify(conn, job.owner_id, {
      title: existing.length ? 'Bid updated' : 'New bid on your job',
      message: `${user.full_name} ${existing.length ? 'updated their bid' : 'bid'} ₹${data.price.toFixed(2)} for "${job.title}" (${label(job)}).`,
      link: '/pages/jobs.html'
    });
    const [saved] = await conn.execute('SELECT id, price, message, status FROM job_bids WHERE job_id = ? AND caretaker_id = ?', [jobId, user.id]);
    return { bid: saved[0], created: !existing.length };
  });
  res.status(bid.created ? 201 : 200).json({ bid: bid.bid });
}));

router.delete('/:id/bids/mine', requireRole('caretaker'), asyncHandler(async (req, res) => {
  const jobId = parseId(req.params.id, 'job id');
  const [result] = await pool.execute(
    `UPDATE job_bids b JOIN job_posts j ON j.id = b.job_id
     SET b.status = 'withdrawn'
     WHERE b.job_id = ? AND b.caretaker_id = ? AND b.status = 'pending' AND j.status = 'open'`,
    [jobId, req.session.user.id]
  );
  if (result.affectedRows === 0) throw new HttpError(404, 'You have no pending bid on this open job.');
  res.json({ ok: true });
}));

// ---------- Accept a bid (owner) ----------
router.post('/:id/accept', requireRole('owner'), asyncHandler(async (req, res) => {
  const jobId = parseId(req.params.id, 'job id');
  const owner = req.session.user;
  const { bid_id: bidId } = validate(req.body, { bid_id: { type: 'int', required: true, min: 1, label: 'Bid' } });

  const taskId = await withTransaction(async (conn) => {
    const [rows] = await conn.execute(`${JOB_SELECT} WHERE j.id = ? AND j.owner_id = ? FOR UPDATE`, [jobId, owner.id]);
    const job = rows[0];
    if (!job) throw new HttpError(404, 'Job not found.');
    if (job.status !== 'open') throw new HttpError(409, `This job is already ${job.status}.`);

    const [bids] = await conn.execute('SELECT * FROM job_bids WHERE job_id = ? FOR UPDATE', [jobId]);
    const winner = bids.find((b) => b.id === bidId);
    if (!winner || winner.status !== 'pending') throw new HttpError(400, 'Choose a pending bid on this job.');

    const due = job.preferred_date && job.preferred_date >= today() ? job.preferred_date : today();
    const description = [job.description, `Agreed price: ₹${Number(winner.price).toFixed(2)} (from the job pool).`].filter(Boolean).join('\n');
    const [task] = await conn.execute(
      `INSERT INTO maintenance_tasks (vehicle_id, assigned_to, title, description, due_date, priority)
       VALUES (?, ?, ?, ?, ?, 'medium')`,
      [job.vehicle_id, winner.caretaker_id, job.title, description.slice(0, 1000), due]
    );
    await conn.execute("UPDATE job_posts SET status = 'assigned', task_id = ? WHERE id = ?", [task.insertId, jobId]);
    await conn.execute("UPDATE job_bids SET status = 'accepted' WHERE id = ?", [winner.id]);
    await conn.execute("UPDATE job_bids SET status = 'rejected' WHERE job_id = ? AND id <> ? AND status = 'pending'", [jobId, winner.id]);

    await notify(conn, winner.caretaker_id, {
      title: 'Your bid was accepted',
      message: `${owner.full_name} accepted your bid of ₹${Number(winner.price).toFixed(2)} for "${job.title}" (${label(job)}). It is now in My Tasks, due ${due}.`,
      link: '/pages/maintenance.html'
    });
    for (const b of bids.filter((x) => x.id !== winner.id && x.status === 'pending')) {
      await notify(conn, b.caretaker_id, {
        title: 'Job assigned to someone else',
        message: `The owner chose another caretaker for "${job.title}". Thanks for bidding.`,
        link: '/pages/jobs.html'
      });
    }
    return task.insertId;
  });

  const [rows] = await pool.execute(`${JOB_SELECT} WHERE j.id = ?`, [jobId]);
  res.json({ job: rows[0], task_id: taskId });
}));

// ---------- Cancel (owner) ----------
router.patch('/:id/cancel', requireRole('owner'), asyncHandler(async (req, res) => {
  const jobId = parseId(req.params.id, 'job id');
  const owner = req.session.user;
  await withTransaction(async (conn) => {
    const [rows] = await conn.execute('SELECT * FROM job_posts WHERE id = ? AND owner_id = ? FOR UPDATE', [jobId, owner.id]);
    const job = rows[0];
    if (!job) throw new HttpError(404, 'Job not found.');
    if (job.status !== 'open') throw new HttpError(409, `Only open jobs can be cancelled. This one is ${job.status}.`);
    const [bids] = await conn.execute("SELECT caretaker_id FROM job_bids WHERE job_id = ? AND status = 'pending'", [jobId]);
    await conn.execute("UPDATE job_posts SET status = 'cancelled' WHERE id = ?", [jobId]);
    await conn.execute("UPDATE job_bids SET status = 'rejected' WHERE job_id = ? AND status = 'pending'", [jobId]);
    for (const b of bids) {
      await notify(conn, b.caretaker_id, {
        title: 'Job cancelled',
        message: `The owner cancelled the job "${job.title}".`,
        link: '/pages/jobs.html'
      });
    }
  });
  const [rows] = await pool.execute(`${JOB_SELECT} WHERE j.id = ?`, [jobId]);
  res.json({ job: rows[0] });
}));

module.exports = router;
