// Authentication: register, login, logout, current user, profile.
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { pool } = require('../config/db');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler, HttpError } = require('../utils/http');
const { validate } = require('../utils/validate');
const { coordRules, checkCoordPair } = require('../utils/geo');

const router = express.Router();
const BCRYPT_ROUNDS = 12;

// A real bcrypt hash used when the email does not exist, so a failed
// login takes the same time whether or not the account exists.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

// Slow down password guessing: 20 failed attempts per 15 minutes per IP.
// Successful logins do not count, so switching demo accounts is never blocked.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' }
});

const PUBLIC_USER_COLUMNS =
  'id, full_name, email, role, phone, city, specialization, bio, latitude, longitude, service_radius_km, created_at';

function checkPasswordStrength(password) {
  if (typeof password !== 'string' || password.length < 8) {
    return 'Password must be at least 8 characters.';
  }
  if (Buffer.byteLength(password, 'utf8') > 72) {
    return 'Password must be at most 72 characters.';
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'Password must contain at least one letter and one number.';
  }
  return null;
}

// Starts a fresh session for the user (prevents session fixation).
function startSession(req, user) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.user = {
        id: user.id,
        role: user.role,
        full_name: user.full_name,
        email: user.email
      };
      req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
    });
  });
}

router.post('/register', loginLimiter, asyncHandler(async (req, res) => {
  const data = validate(req.body, {
    full_name: { type: 'string', required: true, min: 2, max: 100, label: 'Full name' },
    email: { type: 'email', required: true, label: 'Email' },
    role: { type: 'enum', required: true, values: ['owner', 'caretaker'], label: 'Role' }
  });
  const passwordProblem = checkPasswordStrength(req.body && req.body.password);
  if (passwordProblem) throw new HttpError(400, passwordProblem, { password: passwordProblem });

  const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [data.email]);
  if (existing.length) {
    throw new HttpError(409, 'An account with this email already exists.', { email: 'Email already registered.' });
  }

  const passwordHash = await bcrypt.hash(req.body.password, BCRYPT_ROUNDS);
  let result;
  try {
    [result] = await pool.execute(
      'INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)',
      [data.full_name, data.email, passwordHash, data.role]
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      throw new HttpError(409, 'An account with this email already exists.', { email: 'Email already registered.' });
    }
    throw err;
  }

  const [rows] = await pool.execute(`SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = ?`, [result.insertId]);
  await startSession(req, rows[0]);
  res.status(201).json({ user: rows[0] });
}));

router.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const data = validate(req.body, {
    email: { type: 'email', required: true, label: 'Email' },
    password: { type: 'string', required: true, max: 200, label: 'Password' }
  });
  // validate() trims strings; compare against the password exactly as typed.
  const password = String(req.body.password);

  const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [data.email]);
  const user = rows[0];
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) {
    throw new HttpError(401, 'Incorrect email or password.');
  }

  await startSession(req, user);
  const { password_hash, updated_at, ...publicUser } = user;
  res.json({ user: publicUser });
}));

router.post('/logout', (req, res, next) => {
  if (!req.session) return res.json({ ok: true });
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('vc.sid');
    res.json({ ok: true });
  });
});

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const [rows] = await pool.execute(`SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = ?`, [req.session.user.id]);
  if (!rows.length) {
    // The account was deleted while the session was still active.
    req.session.destroy(() => {});
    throw new HttpError(401, 'Your account no longer exists. Please register again.');
  }
  res.json({ user: rows[0] });
}));

router.put('/profile', requireAuth, asyncHandler(async (req, res) => {
  const { id, role } = req.session.user;
  const rules = {
    full_name: { type: 'string', required: true, min: 2, max: 100, label: 'Full name' },
    phone: { type: 'string', max: 20, label: 'Phone' },
    city: { type: 'string', max: 80, label: 'City' }
  };
  if (role === 'caretaker') {
    rules.specialization = { type: 'string', max: 120, label: 'Specialization' };
    rules.bio = { type: 'string', max: 500, label: 'About' };
  }
  const data = validate(req.body, rules);
  if (role === 'caretaker') {
    // Location and radius change only when they are sent, so a form that
    // does not include the map never erases a saved location.
    const location = validate(req.body, {
      latitude: coordRules.latitude,
      longitude: coordRules.longitude,
      service_radius_km: { type: 'int', min: 1, max: 200, label: 'Service radius' }
    }, { partial: true });
    if ('latitude' in location || 'longitude' in location) {
      checkCoordPair({ latitude: location.latitude, longitude: location.longitude });
      data.latitude = location.latitude;
      data.longitude = location.longitude;
    }
    if (location.service_radius_km) data.service_radius_km = location.service_radius_km;
  }
  if (data.phone && !/^[0-9+\-\s()]{6,20}$/.test(data.phone)) {
    throw new HttpError(400, 'Phone number can contain only digits, spaces, +, - and brackets.', { phone: 'Invalid phone number.' });
  }

  const fields = Object.keys(data);
  await pool.execute(
    `UPDATE users SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`,
    [...fields.map((f) => data[f]), id]
  );
  req.session.user.full_name = data.full_name;

  const [rows] = await pool.execute(`SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = ?`, [id]);
  res.json({ user: rows[0] });
}));

module.exports = router;
