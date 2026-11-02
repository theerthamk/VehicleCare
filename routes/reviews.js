// Ratings and reviews of caretakers.
//   Owners rate the caretaker of a completed task on their own vehicle (1-5 stars).
//   Saving again updates the same review. Anyone logged in can read reviews.
const express = require('express');
const { pool, withTransaction } = require('../config/db');
const { requireRole } = require('../middleware/roles');
const { asyncHandler, HttpError, parseId } = require('../utils/http');
const { validate } = require('../utils/validate');
const { notify } = require('../services/notificationService');

const router = express.Router();

router.post('/', requireRole('owner'), asyncHandler(async (req, res) => {
  const owner = req.session.user;
  const data = validate(req.body, {
    task_id: { type: 'int', required: true, min: 1, label: 'Task' },
    rating: { type: 'int', required: true, min: 1, max: 5, label: 'Rating' },
    comment: { type: 'string', max: 500, label: 'Comment' }
  });

  const review = await withTransaction(async (conn) => {
    const [tasks] = await conn.execute(
      `SELECT t.id, t.status, t.assigned_to, t.title, v.make, v.model
       FROM maintenance_tasks t JOIN vehicles v ON v.id = t.vehicle_id
       WHERE t.id = ? AND v.owner_id = ?`,
      [data.task_id, owner.id]
    );
    const task = tasks[0];
    if (!task) throw new HttpError(404, 'Task not found.');
    if (task.status !== 'completed') throw new HttpError(409, 'You can rate a caretaker once the task is completed.');
    if (!task.assigned_to) throw new HttpError(409, 'This task was not done by a caretaker, so there is no one to rate.');

    const [existing] = await conn.execute('SELECT id FROM reviews WHERE task_id = ?', [task.id]);
    await conn.execute(
      `INSERT INTO reviews (task_id, owner_id, caretaker_id, rating, comment) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE rating = ?, comment = ?`,
      [task.id, owner.id, task.assigned_to, data.rating, data.comment, data.rating, data.comment]
    );
    if (!existing.length) {
      await notify(conn, task.assigned_to, {
        title: `New ${data.rating}-star review`,
        message: `${owner.full_name} rated your work on "${task.title}" (${task.make} ${task.model}) ${data.rating}/5` +
          `${data.comment ? `: "${data.comment.slice(0, 200)}"` : '.'}`,
        link: '/pages/profile.html'
      });
    }
    const [rows] = await conn.execute('SELECT * FROM reviews WHERE task_id = ?', [task.id]);
    return { review: rows[0], created: !existing.length };
  });

  res.status(review.created ? 201 : 200).json({ review: review.review });
}));

// GET /api/reviews?caretaker_id=12  -> reviews + summary for one caretaker
router.get('/', asyncHandler(async (req, res) => {
  const caretakerId = parseId(req.query.caretaker_id, 'caretaker id');
  const [[summary]] = await pool.execute(
    `SELECT u.id, u.full_name, COUNT(r.id) AS review_count, ROUND(AVG(r.rating), 1) AS avg_rating
     FROM users u LEFT JOIN reviews r ON r.caretaker_id = u.id
     WHERE u.id = ? AND u.role = 'caretaker' GROUP BY u.id, u.full_name`,
    [caretakerId]
  );
  if (!summary) throw new HttpError(404, 'Caretaker not found.');
  const [reviews] = await pool.execute(
    `SELECT r.id, r.rating, r.comment, r.created_at, t.title AS task_title,
            SUBSTRING_INDEX(o.full_name, ' ', 1) AS owner_first_name
     FROM reviews r
     JOIN maintenance_tasks t ON t.id = r.task_id
     JOIN users o ON o.id = r.owner_id
     WHERE r.caretaker_id = ?
     ORDER BY r.created_at DESC, r.id DESC LIMIT 50`,
    [caretakerId]
  );
  const [breakdown] = await pool.execute(
    'SELECT rating, COUNT(*) AS count FROM reviews WHERE caretaker_id = ? GROUP BY rating',
    [caretakerId]
  );
  const stars = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  breakdown.forEach((b) => { stars[b.rating] = b.count; });
  res.json({
    caretaker: {
      id: summary.id,
      full_name: summary.full_name,
      review_count: summary.review_count,
      avg_rating: summary.avg_rating === null ? null : Number(summary.avg_rating)
    },
    stars,
    reviews
  });
}));

module.exports = router;
