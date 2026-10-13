'use strict';

const DEMO_IDENTITY_QUERY = 'SELECT DATABASE() AS database_name, @@hostname AS server_hostname, @@port AS server_port, @@global.read_only AS read_only';

function createDemoBootstrapReadiness({ sequelize, assertBootstrapReady, logger = console } = {}) {
  if (!sequelize || typeof sequelize.query !== 'function' || typeof assertBootstrapReady !== 'function') {
    throw new TypeError('Sequelize and bootstrap readiness providers are required');
  }

  return async (environment = process.env) => {
    if (environment.DEMO_BOOTSTRAP_REQUIRED !== 'true') return false;

    const [rows] = await sequelize.query(DEMO_IDENTITY_QUERY);
    assertBootstrapReady({ env: environment, databaseRow: rows?.[0] });
    logger.log('[Demo] Local bootstrap state and MySQL identity verified.');
    return true;
  };
}

module.exports = { DEMO_IDENTITY_QUERY, createDemoBootstrapReadiness };
