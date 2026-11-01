// Creates in-app notifications. Pass a transaction connection (`db`)
// when the notification must be saved together with other changes.
const { pool } = require('../config/db');

async function notify(db, userId, { title, message, link = null, dueAt = null }) {
  const executor = db || pool;
  await executor.execute(
    'INSERT INTO notifications (user_id, title, message, link, due_at) VALUES (?, ?, ?, ?, ?)',
    [userId, title.slice(0, 150), message.slice(0, 500), link, dueAt]
  );
}

module.exports = { notify };
