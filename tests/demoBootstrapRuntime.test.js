'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDemoBootstrapReadiness } = require('../infrastructure/demoBootstrapReadiness');

const IDENTITY_QUERY = 'SELECT DATABASE() AS database_name, @@hostname AS server_hostname, @@port AS server_port, @@global.read_only AS read_only';

test('Demo-disabled runtime readiness skips the MySQL identity query', async () => {
  let queryCount = 0;
  let assertionCount = 0;
  const verifyReadiness = createDemoBootstrapReadiness({
    sequelize: { async query() { queryCount += 1; return [[]]; } },
    assertBootstrapReady() { assertionCount += 1; },
    logger: { log() {} },
  });

  await verifyReadiness({ DEMO_BOOTSTRAP_REQUIRED: 'false' });

  assert.equal(queryCount, 0);
  assert.equal(assertionCount, 0);
});

test('Demo-enabled runtime checks the exact MySQL identity before readiness succeeds', async () => {
  const environment = { DEMO_BOOTSTRAP_REQUIRED: 'true', DB_NAME: 'airline_booking_docker' };
  const databaseRow = { database_name: 'airline_booking_docker', server_hostname: 'a'.repeat(12), server_port: 3306, read_only: 0 };
  const events = [];
  const verifyReadiness = createDemoBootstrapReadiness({
    sequelize: { async query(sql) { events.push(['query', sql]); return [[databaseRow]]; } },
    assertBootstrapReady(input) { events.push(['assert', input]); },
    logger: { log(message) { events.push(['log', message]); } },
  });

  await verifyReadiness(environment);

  assert.deepEqual(events, [
    ['query', IDENTITY_QUERY],
    ['assert', { env: environment, databaseRow }],
    ['log', '[Demo] Local bootstrap state and MySQL identity verified.'],
  ]);
});

test('Demo-enabled runtime fails closed when the readiness assertion rejects', async () => {
  const failure = new Error('bootstrap marker invalid');
  const verifyReadiness = createDemoBootstrapReadiness({
    sequelize: { async query() { return [[{}]]; } },
    assertBootstrapReady() { throw failure; },
    logger: { log() { assert.fail('must not log ready'); } },
  });

  await assert.rejects(verifyReadiness({ DEMO_BOOTSTRAP_REQUIRED: 'true' }), failure);
});
