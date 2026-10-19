'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { assertIsolatedCiDatabase, cleanup } = require('./prepare-browser-fixtures');

async function main() {
  assertIsolatedCiDatabase();
  const fixturePath = path.resolve(process.argv[2] || 'artifacts/e2e/fixture.json');
  let fixture;
  try { fixture = JSON.parse(await fs.readFile(fixturePath, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') { console.log('No browser fixture manifest exists; nothing to clean.'); return; }
    throw error;
  }
  const db = require('../../models');
  await db.sequelize.authenticate();
  const [rows] = await db.sequelize.query('SELECT DATABASE() AS database_name, @@global.read_only AS read_only');
  if (rows[0]?.database_name !== 'airline_booking_ci_test' || Number(rows[0]?.read_only) !== 0) {
    throw new Error('Refusing fixture cleanup: connected MySQL identity is not the writable CI test database.');
  }
  try {
    await cleanup(db, fixture.ids);
    console.log('Removed only the browser fixtures listed in the CI fixture manifest.');
  } finally {
    await db.sequelize.close();
    await fs.rm(fixturePath, { force: true });
  }
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { main };
