// AI assistant and AI care plans.
const express = require('express');
const rateLimit = require('express-rate-limit');
const { pool } = require('../config/db');
const { requireRole } = require('../middleware/roles');
const { asyncHandler, HttpError } = require('../utils/http');
const { validate } = require('../utils/validate');
const ai = require('../services/aiService');
const insights = require('../services/vehicleInsights');

const router = express.Router();

// Protects the Gemini free-tier quota: 15 AI requests per minute per user.
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 15,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `user-${req.session.user.id}`,
  message: { error: 'You are sending AI requests too quickly. Please wait a minute.' }
});

router.get('/status', (req, res) => {
  res.json(ai.status());
});

router.get('/messages', asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT * FROM (
       SELECT id, role, content, source, vehicle_id, created_at FROM ai_messages
       WHERE user_id = ? ORDER BY id DESC LIMIT 40
     ) recent ORDER BY id`,
    [req.session.user.id]
  );
  res.json({ messages: rows, ai: ai.status() });
}));

router.delete('/messages', asyncHandler(async (req, res) => {
  await pool.execute('DELETE FROM ai_messages WHERE user_id = ?', [req.session.user.id]);
  res.json({ ok: true });
}));

router.post('/chat', aiLimiter, asyncHandler(async (req, res) => {
  const user = req.session.user;
  const data = validate(req.body, {
    message: { type: 'string', required: true, max: 1000, label: 'Message' },
    vehicle_id: { type: 'int', min: 1, label: 'Vehicle' }
  });
  if (data.vehicle_id && user.role === 'owner') {
    const [own] = await pool.execute('SELECT id FROM vehicles WHERE id = ? AND owner_id = ?', [data.vehicle_id, user.id]);
    if (!own.length) throw new HttpError(404, 'Vehicle not found.');
  } else {
    data.vehicle_id = null;
  }

  const context = user.role === 'owner'
    ? await insights.ownerContext(user.id, data.vehicle_id)
    : await insights.caretakerContext(user.id);
  const [historyRows] = await pool.execute(
    'SELECT role, content FROM (SELECT id, role, content FROM ai_messages WHERE user_id = ? ORDER BY id DESC LIMIT 10) h ORDER BY id',
    [user.id]
  );

  const reply = await ai.chatReply({
    message: data.message,
    history: historyRows,
    contextText: context.text,
    vehicles: context.vehicles
  });

  await pool.execute(
    'INSERT INTO ai_messages (user_id, vehicle_id, role, content) VALUES (?, ?, \'user\', ?)',
    [user.id, data.vehicle_id, data.message]
  );
  const [saved] = await pool.execute(
    'INSERT INTO ai_messages (user_id, vehicle_id, role, content, source) VALUES (?, ?, \'assistant\', ?, ?)',
    [user.id, data.vehicle_id, reply.text, reply.source]
  );
  res.json({ reply: { id: saved.insertId, role: 'assistant', content: reply.text, source: reply.source }, ai: ai.status() });
}));

router.post('/care-plan', requireRole('owner'), aiLimiter, asyncHandler(async (req, res) => {
  const user = req.session.user;
  const { vehicle_id: vehicleId } = validate(req.body, {
    vehicle_id: { type: 'int', required: true, min: 1, label: 'Vehicle' }
  });
  const [vehicles] = await pool.execute('SELECT * FROM vehicles WHERE id = ? AND owner_id = ?', [vehicleId, user.id]);
  const vehicle = vehicles[0];
  if (!vehicle) throw new HttpError(404, 'Vehicle not found.');

  const context = await insights.ownerContext(user.id, vehicleId);
  const focus = context.vehicles.find((v) => v.id === vehicleId);
  const vehicleLine = context.text.split('\n').find((l) => l.includes(`[${vehicle.registration_number}]`)) || '';
  const plan = await ai.carePlan({
    vehicle,
    contextText: `Vehicle: ${vehicleLine.replace(/^- /, '')}`,
    openTaskTitles: focus ? focus.open_task_titles : []
  });
  res.json({ vehicle_id: vehicleId, ...plan, ai: ai.status() });
}));

module.exports = router;
