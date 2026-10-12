'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { writeBootstrapRecord, readBootstrapRecord, assertBootstrapReady } = require('../utils/demoBootstrap');

const record = { version: 1, status: 'complete', database: 'airline_booking_docker', composeProject: 'serene-demo', dbContainerId: 'a'.repeat(64) };

test('bootstrap state is written atomically and validated against the live demo database identity', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-bootstrap-state-'));
  const marker = path.join(root, 'bootstrap.json');
  try {
    writeBootstrapRecord(marker, record);
    assert.deepEqual(readBootstrapRecord(marker), record);
    assert.equal(assertBootstrapReady({
      env: { DEMO_BOOTSTRAP_REQUIRED: 'true', NODE_ENV: 'development', DB_HOST: 'db', DB_NAME: 'airline_booking_docker', DB_SSL: 'false' },
      markerPath: marker,
      databaseRow: { database_name: 'airline_booking_docker', server_hostname: 'aaaaaaaaaaaa', server_port: 3306, read_only: 0 },
    }), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('missing/stale bootstrap state and non-demo DB identity fail closed', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-bootstrap-state-'));
  const marker = path.join(root, 'bootstrap.json');
  const input = {
    env: { DEMO_BOOTSTRAP_REQUIRED: 'true', NODE_ENV: 'development', DB_HOST: 'db', DB_NAME: 'airline_booking_docker', DB_SSL: 'false' },
    markerPath: marker,
    databaseRow: { database_name: 'airline_booking_docker', server_hostname: 'aaaaaaaaaaaa', server_port: 3306, read_only: 0 },
  };
  try {
    assert.throws(() => assertBootstrapReady(input), /npm run demo:up/i);
    writeBootstrapRecord(marker, record);
    assert.throws(() => assertBootstrapReady({ ...input, env: { ...input.env, NODE_ENV: 'production' } }), /development/i);
    assert.throws(() => assertBootstrapReady({ ...input, databaseRow: { ...input.databaseRow, server_hostname: 'bbbbbbbbbbbb' } }), /identity|MySQL/i);
    assert.throws(() => assertBootstrapReady({ ...input, databaseRow: { ...input.databaseRow, database_name: 'production' } }), /identity|MySQL|demo:up/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
