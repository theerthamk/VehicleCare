// Creates the database and all tables from database/schema.sql.
// Usage:  npm run db:init          (asks for confirmation)
//         npm run db:init -- --yes (no prompt)
const fs = require('fs');
const path = require('path');
const { DB_NAME, connect, confirm, fail } = require('./lib');

async function main() {
  const ok = await confirm(
    `This creates database "${DB_NAME}" and DELETES all existing VehicleCare tables and data in it.`
  );
  if (!ok) {
    console.log('Cancelled. Nothing was changed.');
    return;
  }

  let sql = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
  // Use the database name from .env instead of the default one in the file.
  sql = sql
    .replace(/CREATE DATABASE IF NOT EXISTS vehiclecare\b/, `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``)
    .replace(/USE vehiclecare;/, `USE \`${DB_NAME}\`;`);

  const conn = await connect({ withDatabase: false });
  try {
    await conn.query(sql);
    console.log(`Database "${DB_NAME}" is ready. Tables created.`);
    console.log('Next: npm run db:seed   (optional demo data)');
  } finally {
    await conn.end();
  }
}

main().catch(fail);
