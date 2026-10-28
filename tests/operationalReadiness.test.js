'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const PaymentService = require('../modules/payment/payment.service');
const { createBookingMaintenanceJob } = require('../infrastructure/jobs/bookingMaintenanceJob');
const { evaluateReconciliationAlerts } = require('../infrastructure/observability/reconciliationObservability');

test('IT-45 feature flags select one reconciliation path', async () => {
  let run; let legacy = 0; let worker = 0;
  const job = createBookingMaintenanceJob({
    cron: { schedule(_expression, callback) { run = callback; return { stop() {} }; } },
    bookingService: { expireHoldingBookings: async () => ({ expiredCount: 0 }), reconcileStalePendingPayments: async () => { legacy += 1; return { reconciledCount: 0 }; } },
    paymentService: { reconcilePayosCases: async () => { worker += 1; return { claimedCount: 0 }; } },
    environment: { ENABLE_PENDING_RECONCILIATION: 'true', PAYOS_RECONCILIATION_WORKER: 'true' }, logger: { log() {}, error() {} },
  });
  job.start(); await run();
  assert.equal(worker, 1); assert.equal(legacy, 0);
  await job.stop(1000);
});

test('IT-46 shutdown stops new ticks and waits for an in-flight worker', async () => {
  let run; let release; const pending = new Promise((resolve) => { release = resolve; });
  const job = createBookingMaintenanceJob({
    cron: { schedule(_expression, callback) { run = callback; return { stop() {} }; } },
    bookingService: { expireHoldingBookings: async () => { await pending; return { expiredCount: 0 }; } },
    environment: {}, logger: { log() {}, error() {} },
  });
  job.start(); const tick = run(); await new Promise((resolve) => setImmediate(resolve));
  const stopping = job.stop(1000); release(); await tick; assert.equal(await stopping, true); assert.equal(job.isRunning(), false);
});

test('IT-52 metrics are database-derived and alert cooldown suppresses duplicates', async () => {
  const service = new PaymentService({
    repository: { getReconciliationMetrics: async () => ({ activeCases: 2, manualReviewCases: 12, oldestUnresolvedAt: new Date(Date.now() - 7200000), pendingPaymentsBeyondSla: 3 }) },
    transactionManager: {}, logger: { log() {} },
  });
  const result = await service.getReconciliationMetrics({ pendingSlaMinutes: 30 });
  assert.equal(result.metrics.active_reconciliation_cases, 2);
  assert.ok(result.metrics.oldest_unresolved_age_minutes >= 120);
  assert.ok(result.alerts.some((alert) => alert.code === 'MANUAL_REVIEW_QUEUE_HIGH'));
  const alertNow = Date.now() + 1000000000;
  const first = evaluateReconciliationAlerts(result.metrics, { RECONCILIATION_ALERT_COOLDOWN_MS: '60000' }, alertNow);
  const second = evaluateReconciliationAlerts(result.metrics, { RECONCILIATION_ALERT_COOLDOWN_MS: '60000' }, alertNow + 1);
  assert.ok(first.length > 0); assert.equal(second.length, 0);
  assert.ok(evaluateReconciliationAlerts(result.metrics, { RECONCILIATION_ALERT_MANUAL_REVIEW: 'invalid' }, alertNow + 400000).length > 0);
});
