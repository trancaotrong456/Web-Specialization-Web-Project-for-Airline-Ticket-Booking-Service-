'use strict';

const { assertConnectedDatabase } = require('./seed-demo-local');

async function main({ argv = process.argv.slice(2), env = process.env, isDockerContainer = require('node:fs').existsSync('/.dockerenv') } = {}) {
  const dbContainerId = argv[0];
  if (argv.length !== 1 || !/^[a-f0-9]{12,64}$/i.test(dbContainerId || '')) throw new Error('Usage: node scripts/verify-demo-db.js <verified-db-container-id>');
  if (!isDockerContainer || env.NODE_ENV !== 'development' || env.DB_HOST !== 'db' || env.DB_NAME !== 'airline_booking_docker' || String(env.DB_SSL).toLowerCase() !== 'false') {
    throw new Error('Read-only DB preflight requires the verified local Compose development target.');
  }
  if (!env.DEMO_SEED_COMPOSE_PROJECT || !/^[a-f0-9]{12,64}$/i.test(env.DEMO_SEED_API_CONTAINER_ID || '') || !String(env.HOSTNAME || '').startsWith(env.DEMO_SEED_API_CONTAINER_ID.slice(0, 12))) {
    throw new Error('Read-only DB preflight must run in the host-verified Compose bootstrap container.');
  }
  const models = require('../models');
  await models.sequelize.authenticate();
  await assertConnectedDatabase(models.sequelize, dbContainerId);
  console.log('DEMO_DB_IDENTITY verified: local Compose MySQL, airline_booking_docker, port 3306, writable.');
  return true;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Read-only local demo DB preflight refused: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { main };
