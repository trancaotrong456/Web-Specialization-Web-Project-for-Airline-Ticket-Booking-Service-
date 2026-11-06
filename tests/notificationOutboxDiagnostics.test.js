'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createBookingMaintenanceJob } = require('../infrastructure/jobs/bookingMaintenanceJob');

test('notification outbox cron includes a test-only stack trace without exposing payload data', async () => {
  let run;
  const logs = [];
  const failure = new Error('WHERE parameter "id" has invalid "undefined" value');
  const job = createBookingMaintenanceJob({
    cron: { schedule: (_expression, callback) => { run = callback; return { stop() {} }; } },
    bookingService: { expireHoldingBookings: async () => ({ expiredCount: 0 }) },
    notificationWorker: { runBatch: async () => { throw failure; } },
    environment: { NODE_ENV: 'test', ENABLE_PENDING_RECONCILIATION: 'false' },
    logger: { log() {}, error: (...args) => logs.push(args) },
  });

  job.start();
  await run();

  assert.equal(logs.length, 1);
  assert.equal(logs[0][0], '[Notifications] Outbox delivery job failed:');
  assert.match(logs[0][1], /Error: WHERE parameter "id" has invalid "undefined" value/);
  assert.doesNotMatch(logs[0][1], /payload|token|secret|email/i);
});
