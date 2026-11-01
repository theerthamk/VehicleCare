// VehicleCare server: Express REST API + static PWA frontend.
require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');

const { pool, checkConnection, isConnectionError, explainDbError } = require('./config/db');
const { requireAuth } = require('./middleware/auth');
const { HttpError } = require('./utils/http');
const { startReminderService } = require('./services/reminderService');

const isProduction = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3000;

// ---------- Configuration checks ----------
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret === 'replace_with_a_long_random_string' || sessionSecret.length < 16) {
  console.error(
    '\n[config] SESSION_SECRET is missing or too short in your .env file.\n' +
    '         Create one with:\n' +
    "         node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"\n" +
    '         and paste it into .env as SESSION_SECRET=...\n'
  );
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
if (isProduction) app.set('trust proxy', 1); // needed for secure cookies behind a proxy

// ---------- Security & parsing ----------
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'img-src': ["'self'", 'data:'],
      // Allow plain-HTTP local testing on other devices in the same network.
      'upgrade-insecure-requests': isProduction ? [] : null
    }
  }
}));
app.use(express.json({ limit: '100kb' }));

app.use(session({
  name: 'vc.sid',
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: 8 * 60 * 60 * 1000 // 8 hours of inactivity
  }
}));

// API responses contain private data: never cache them (browser or service worker).
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// CSRF protection: state-changing API calls must be JSON. Browsers cannot send
// cross-site JSON requests without a CORS pre-flight, which this server never allows.
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !req.is('application/json')) {
    return res.status(415).json({ error: 'Requests must be sent as JSON.' });
  }
  next();
});

// ---------- Health check ----------
app.get('/api/health', async (req, res) => {
  try {
    await checkConnection();
    res.json({ status: 'ok', database: 'connected', time: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'degraded', database: 'unavailable', error: explainDbError(err) });
  }
});

// ---------- API routes ----------
app.use('/api/auth', require('./routes/auth'));
app.use('/api/dashboard', requireAuth, require('./routes/dashboard'));
app.use('/api/vehicles', requireAuth, require('./routes/vehicles'));
app.use('/api/maintenance', requireAuth, require('./routes/maintenance'));
app.use('/api/services', requireAuth, require('./routes/services'));
app.use('/api/notifications', requireAuth, require('./routes/notifications'));
app.use('/api/reports', requireAuth, require('./routes/reports'));

app.use('/api', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
});

// ---------- Frontend ----------
const publicDir = path.join(__dirname, 'public');
app.get('/sw.js', (req, res) => {
  // The browser must always re-check the service worker for updates.
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(publicDir, 'sw.js'));
});
app.use(express.static(publicDir, { extensions: ['html'] }));
app.use((req, res) => {
  res.status(404).sendFile(path.join(publicDir, '404.html'));
});

// ---------- Error handler ----------
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'The request body is not valid JSON.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'The request is too large.' });
  }
  if (isConnectionError(err)) {
    console.error('[db]', explainDbError(err));
    return res.status(503).json({ error: 'The database is not available right now. Please try again shortly.' });
  }
  console.error(`[error] ${req.method} ${req.originalUrl}:`, err);
  res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
});

// ---------- Start ----------
async function start() {
  try {
    await checkConnection();
    console.log(`[db] Connected to MySQL database "${process.env.DB_NAME || 'vehiclecare'}".`);
  } catch (err) {
    console.error('\n[db] Could not connect to the database.');
    console.error(`     ${explainDbError(err)}`);
    console.error('     The server will still start, but API calls will fail until this is fixed.');
    console.error('     Check status at /api/health\n');
  }

  const server = app.listen(PORT, () => {
    console.log(`VehicleCare running at http://localhost:${PORT}`);
    startReminderService();
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[server] Port ${PORT} is already in use. Stop the other program or change PORT in .env.`);
    } else {
      console.error('[server]', err);
    }
    process.exit(1);
  });

  const shutdown = () => {
    server.close(() => pool.end().finally(() => process.exit(0)));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) {
  start();
}

module.exports = app;
