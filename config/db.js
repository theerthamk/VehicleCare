// MySQL connection pool shared by the whole app.
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'vehiclecare',
  waitForConnections: true,
  connectionLimit: 10,
  // Return DATE / DATETIME columns as plain strings ("2026-10-29")
  // so dates never shift because of time-zone conversion.
  dateStrings: true,
  // Return DECIMAL columns (costs) as numbers, not strings.
  decimalNumbers: true
});

// Error codes that mean "the database itself is unreachable or misconfigured".
const CONNECTION_ERRORS = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
  'PROTOCOL_CONNECTION_LOST',
  'ER_ACCESS_DENIED_ERROR',
  'ER_BAD_DB_ERROR',
  'ER_CON_COUNT_ERROR',
  'ER_NO_SUCH_TABLE'
]);

function isConnectionError(err) {
  return Boolean(err && CONNECTION_ERRORS.has(err.code));
}

// Turns a low-level MySQL error into advice a person can act on.
function explainDbError(err) {
  const name = process.env.DB_NAME || 'vehiclecare';
  switch (err && err.code) {
    case 'ECONNREFUSED':
      return `Cannot reach MySQL at ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 3306}. Is the MySQL service running?`;
    case 'ENOTFOUND':
      return `The DB_HOST "${process.env.DB_HOST}" could not be found. Check DB_HOST in your .env file.`;
    case 'ER_ACCESS_DENIED_ERROR':
      return 'MySQL rejected the username or password. Check DB_USER and DB_PASSWORD in your .env file.';
    case 'ER_BAD_DB_ERROR':
      return `The database "${name}" does not exist yet. Run "npm run db:init" to create it.`;
    case 'ER_NO_SUCH_TABLE':
      return `A VehicleCare table is missing in "${name}". Run "npm run db:init" to create the tables.`;
    default:
      return `Database error: ${err ? err.message : 'unknown'}`;
  }
}

async function checkConnection() {
  const conn = await pool.getConnection();
  try {
    await conn.query('SELECT 1 FROM users LIMIT 1');
  } finally {
    conn.release();
  }
}

// Runs fn(conn) inside a transaction. Commits if fn succeeds,
// rolls back (and re-throws) if anything fails.
async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try {
      await conn.rollback();
    } catch (rollbackErr) {
      console.error('Rollback failed:', rollbackErr.message);
    }
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, isConnectionError, explainDbError, checkConnection, withTransaction };
