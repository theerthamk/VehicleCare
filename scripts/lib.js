// Shared helpers for the command-line scripts.
require('dotenv').config();
const readline = require('readline');
const mysql = require('mysql2/promise');
const { explainDbError } = require('../config/db');

const DB_NAME = process.env.DB_NAME || 'vehiclecare';

if (!/^[A-Za-z0-9_]+$/.test(DB_NAME)) {
  console.error('DB_NAME may contain only letters, numbers and underscores.');
  process.exit(1);
}

function connect({ withDatabase = true } = {}) {
  return mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: withDatabase ? DB_NAME : undefined,
    multipleStatements: !withDatabase,
    dateStrings: true
  });
}

// Asks the user to type "yes" unless --yes was passed.
async function confirm(question) {
  if (process.argv.includes('--yes') || process.argv.includes('-y')) return true;
  if (!process.stdin.isTTY) {
    console.error('Add --yes to run this without a prompt, e.g.  npm run db:init -- --yes');
    return false;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question(`${question} Type "yes" to continue: `, resolve));
  rl.close();
  return answer.trim().toLowerCase() === 'yes';
}

function fail(err) {
  console.error(`\nFailed: ${explainDbError(err)}`);
  if (err && !['ECONNREFUSED', 'ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR', 'ENOTFOUND'].includes(err.code)) {
    console.error(err);
  }
  process.exit(1);
}

module.exports = { DB_NAME, connect, confirm, fail };
