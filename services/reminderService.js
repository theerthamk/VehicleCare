// Sends "maintenance due soon / overdue" notifications.
// Runs once at start-up and then every hour. Each task gets one reminder
// per due date (reminder_sent_at is cleared when the due date changes).
const { pool, isConnectionError, explainDbError } = require('../config/db');
const { notify } = require('./notificationService');

const ONE_HOUR = 60 * 60 * 1000;
let timer = null;

async function sendDueReminders() {
  const daysAhead = Math.max(0, Number(process.env.REMINDER_DAYS_AHEAD) || 3);
  const [tasks] = await pool.execute(
    `SELECT t.id, t.title, t.due_date, t.assigned_to, v.owner_id,
            v.make, v.model, v.registration_number,
            (t.due_date < CURDATE()) AS is_overdue
     FROM maintenance_tasks t JOIN vehicles v ON v.id = t.vehicle_id
     WHERE t.status IN ('pending', 'in_progress')
       AND t.reminder_sent_at IS NULL
       AND t.due_date <= DATE_ADD(CURDATE(), INTERVAL ${daysAhead} DAY)
     LIMIT 500`
  );

  let sent = 0;
  for (const task of tasks) {
    // Claim the task first so two server instances never both send it.
    const [claim] = await pool.execute(
      'UPDATE maintenance_tasks SET reminder_sent_at = NOW() WHERE id = ? AND reminder_sent_at IS NULL',
      [task.id]
    );
    if (claim.affectedRows === 0) continue;

    const vehicle = `${task.make} ${task.model} (${task.registration_number})`;
    const title = task.is_overdue ? 'Maintenance overdue' : 'Maintenance due soon';
    const message = task.is_overdue
      ? `"${task.title}" for ${vehicle} was due on ${task.due_date}.`
      : `"${task.title}" for ${vehicle} is due on ${task.due_date}.`;
    const dueAt = `${task.due_date} 09:00:00`;

    await notify(null, task.owner_id, { title, message, link: '/pages/maintenance.html', dueAt });
    if (task.assigned_to) {
      await notify(null, task.assigned_to, { title, message, link: '/pages/maintenance.html', dueAt });
    }
    sent += 1;
  }
  return sent;
}

async function runSafely() {
  try {
    const sent = await sendDueReminders();
    if (sent) console.log(`[reminders] Sent reminders for ${sent} task(s).`);
  } catch (err) {
    if (isConnectionError(err)) {
      console.warn(`[reminders] Skipped: ${explainDbError(err)}`);
    } else {
      console.error('[reminders] Failed:', err.message);
    }
  }
}

function startReminderService() {
  if (timer) return;
  runSafely();
  timer = setInterval(runSafely, ONE_HOUR);
  timer.unref(); // do not keep the process alive just for reminders
}

module.exports = { startReminderService, sendDueReminders };
