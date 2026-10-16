'use strict';

const EXPECTED_DATABASE = Object.freeze({
  NODE_ENV: 'test',
  DB_HOST: '127.0.0.1',
  DB_PORT: '3309',
  DB_NAME: 'airline_booking_integration_test',
});

function assertSafeIntegrationEnvironment() {
  const mismatches = Object.entries(EXPECTED_DATABASE)
    .filter(([key, expected]) => process.env[key] !== expected)
    .map(([key, expected]) => `${key} must be ${expected}`);

  if (!process.env.DB_PASS) mismatches.push('DB_PASS must be present');
  if (mismatches.length > 0) {
    throw new Error(`Refusing MySQL integration test: ${mismatches.join('; ')}`);
  }
}

assertSafeIntegrationEnvironment();

const models = require('../../../models');

async function verifyConnectedDatabase() {
  await models.sequelize.authenticate();
  const [rows] = await models.sequelize.query(
    'SELECT DATABASE() AS database_name, @@hostname AS server_hostname, '
      + '@@port AS server_port, VERSION() AS mysql_version, '
      + '@@transaction_isolation AS isolation_level'
  );
  const metadata = rows[0];
  if (metadata.database_name !== EXPECTED_DATABASE.DB_NAME) {
    throw new Error(`Refusing writes to unexpected database: ${metadata.database_name}`);
  }
  return metadata;
}

module.exports = {
  EXPECTED_DATABASE,
  assertSafeIntegrationEnvironment,
  models,
  verifyConnectedDatabase,
};
