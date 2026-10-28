'use strict';

const REQUIRED_DATABASE_FIELDS = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASS'];
const KNOWN_UNSAFE_DATABASES = new Set(['airline_booking_db', 'airline_booking_docker', 'airline_booking_prod_db', 'airline_booking_test_db']);

function migrationConfigError(message) {
  const error = new Error(message);
  error.code = 'MIGRATION_CONFIG_INVALID';
  return error;
}

function validateMigrationEnvironment({ env = process.env, targetEnv = env.NODE_ENV || 'development' } = {}) {
  const missing = REQUIRED_DATABASE_FIELDS.filter((name) => !String(env[name] || '').trim());
  if (missing.length > 0) throw migrationConfigError(`Missing database migration configuration: ${missing.join(', ')}`);

  const port = Number(env.DB_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw migrationConfigError('DB_PORT must be a valid TCP port.');

  const database = String(env.DB_NAME).trim();
  const user = String(env.DB_USER).trim().toLowerCase();
  if (targetEnv === 'production') {
    if (user === 'root') throw migrationConfigError('Production migrations must not use the root database user.');
    if (KNOWN_UNSAFE_DATABASES.has(database) || /(?:^|_)(?:test|docker|development)(?:_|$)/i.test(database)) {
      throw migrationConfigError('Production migrations require an explicitly named production/staging database.');
    }
  }
  if (targetEnv === 'test' && !/(?:test|integration)/i.test(database)) {
    throw migrationConfigError('Test migrations require a test or integration database name.');
  }

  return { targetEnv, host: String(env.DB_HOST), port, database, user };
}

module.exports = { REQUIRED_DATABASE_FIELDS, validateMigrationEnvironment };
