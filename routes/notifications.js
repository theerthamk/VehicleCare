// Notifications for the logged-in user only.
const express = require('express');
const { pool } = require('../config/db');
const { asyncHandler, HttpError, parseId } = require('../utils/http');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const userId = req.session.user.id;
  const unreadOnly = req.query.unread === '1' || req.query.unread === 'true';
  const [rows] = await pool.execute(
    `SELECT id, title, message, link, due_at, read_at, created_at
     FROM notifications
     WHERE user_id = ?${unreadOnly ? ' AND read_at IS NULL' : ''}
     ORDER BY created_at DESC, id DESC
     LIMIT 100`,
    [userId]
  );
  const [[{ unread }]] = await pool.execute(
    'SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND read_at IS NULL',
    [userId]
  );
  res.json({ notifications: rows, unread });
}));

// Must be declared before "/:id/read" so "read-all" is not taken as an id.
router.patch('/read-all', asyncHandler(async (req, res) => {
  const [result] = await pool.execute(
    'UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL',
    [req.session.user.id]
  );
  res.json({ updated: result.affectedRows });
}));

router.patch('/:id/read', asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'notification id');
  const [result] = await pool.execute(
    'UPDATE notifications SET read_at = COALESCE(read_at, NOW()) WHERE id = ? AND user_id = ?',
    [id, req.session.user.id]
  );
  if (result.affectedRows === 0) throw new HttpError(404, 'Notification not found.');
  res.json({ ok: true });
}));

module.exports = router;
