'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { assertDemoSeedTarget } = require('./demo-seed-safety');

const safeEnvironment = {
  NODE_ENV: 'development',
  DB_NAME: 'airline_booking_docker',
  DB_HOST: 'db',
  DB_SSL: 'false',
  DEMO_SEED_ENABLED: 'true',
};

test('allows only an explicitly enabled Docker demo database target', () => {
  assert.equal(assertDemoSeedTarget(safeEnvironment), true);
});

test('refuses production even when every other demo setting matches', () => {
  assert.throws(
    () => assertDemoSeedTarget({ ...safeEnvironment, NODE_ENV: 'production' }),
    /production/i,
  );
});

test('refuses any database name other than the dedicated demo database', () => {
  assert.throws(
    () => assertDemoSeedTarget({ ...safeEnvironment, DB_NAME: 'airline_booking_db' }),
    /airline_booking_docker/,
  );
});

test('refuses database hosts outside the Docker Compose database service', () => {
  assert.throws(
    () => assertDemoSeedTarget({ ...safeEnvironment, DB_HOST: 'tidb.example.com' }),
    /DB_HOST=db/,
  );
});

test('requires TLS to be disabled for the local Docker-only seed command', () => {
  assert.throws(
    () => assertDemoSeedTarget({ ...safeEnvironment, DB_SSL: 'true' }),
    /DB_SSL=false/,
  );
});

test('requires an explicit opt-in before inserting local demo data', () => {
  assert.throws(
    () => assertDemoSeedTarget({ ...safeEnvironment, DEMO_SEED_ENABLED: 'false' }),
    /DEMO_SEED_ENABLED=true/,
  );
});
