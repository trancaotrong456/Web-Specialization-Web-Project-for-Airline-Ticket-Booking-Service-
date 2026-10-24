const test = require('node:test');
const assert = require('node:assert/strict');
const PaymentService = require('../modules/payment/payment.service');
const { createBookingMaintenanceJob } = require('../infrastructure/jobs/bookingMaintenanceJob');

test('payOS retry delay follows bounded exponential backoff', () => {
  const service = new PaymentService({
    repository: {}, transactionManager: {}, socket: () => ({ to: () => ({ emit() {} }), emit() {} }),
  });
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((attempt) => service._payosRetryDelayMs(attempt)),
    [60000, 120000, 240000, 480000, 960000, 960000]);
});

test('maintenance job uses one payOS worker and prevents overlapping ticks', async () => {
  let run;
  let active = 0;
  let calls = 0;
  const job = createBookingMaintenanceJob({
    cron: { schedule(_expression, callback) { run = callback; return {}; } },
    bookingService: { expireHoldingBookings: async () => ({ expiredCount: 0 }), reconcileStalePendingPayments: async () => { throw new Error('legacy poll should not run'); } },
    paymentService: { reconcilePayosCases: async () => { calls += 1; active += 1; await new Promise((resolve) => setTimeout(resolve, 20)); active -= 1; return { claimedCount: 1 }; } },
    environment: { ENABLE_PENDING_RECONCILIATION: 'true', PAYOS_RECONCILIATION_WORKER: 'true' },
    logger: { log() {}, error(error) { throw error; } },
  });
  job.start();
  await Promise.all([run(), run()]);
  assert.equal(calls, 1);
  assert.equal(active, 0);
});

test('maintenance feature flags select exactly one reconciliation path', async () => {
  for (const enabled of ['false', 'true']) {
    for (const workerEnabled of ['false', 'true']) {
      let run;
      let legacy = 0;
      let worker = 0;
      const job = createBookingMaintenanceJob({
        cron: { schedule(_expression, callback) { run = callback; return {}; } },
        bookingService: {
          expireHoldingBookings: async () => ({ expiredCount: 0 }),
          reconcileStalePendingPayments: async () => { legacy += 1; return { reconciledCount: 0 }; },
        },
        paymentService: { reconcilePayosCases: async () => { worker += 1; return { claimedCount: 0 }; } },
        environment: { ENABLE_PENDING_RECONCILIATION: enabled, PAYOS_RECONCILIATION_WORKER: workerEnabled },
        logger: { log() {}, error() {} },
      });
      job.start();
      await run();
      if (enabled === 'false') {
        assert.equal(legacy, 0);
        assert.equal(worker, 0);
      } else if (workerEnabled === 'true') {
        assert.equal(legacy, 0);
        assert.equal(worker, 1);
      } else {
        assert.equal(legacy, 1);
        assert.equal(worker, 0);
      }
    }
  }
});
