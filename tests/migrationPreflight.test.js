'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArgs } = require('../scripts/migrate');
const { validateMigrationEnvironment } = require('../config/migrationValidation');

const validTest = {
  NODE_ENV: 'test', DB_HOST: '127.0.0.1', DB_PORT: '3309', DB_NAME: 'airline_booking_integration_test',
  DB_USER: 'airline_test', DB_PASS: 'test-password',
};

test('migration preflight rejects missing database credentials', () => {
  assert.throws(() => validateMigrationEnvironment({ env: { ...validTest, DB_PASS: '' }, targetEnv: 'test' }), /DB_PASS/);
});

test('migration preflight rejects production root/default targets', () => {
  const base = {
    NODE_ENV: 'production', DB_HOST: 'db', DB_PORT: '3306', DB_NAME: 'airline_booking_prod_db',
    DB_USER: 'root', DB_PASS: 'secret',
  };
  assert.throws(() => validateMigrationEnvironment({ env: base, targetEnv: 'production' }), /root|production/i);
});

test('migration preflight accepts explicit isolated test configuration', () => {
  assert.doesNotThrow(() => validateMigrationEnvironment({ env: validTest, targetEnv: 'test' }));
  assert.deepEqual(parseArgs(['--env', 'test', '--check-only']), { targetEnv: 'test', checkOnly: true });
});
