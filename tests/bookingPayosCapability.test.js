'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const BookingService = require('../modules/booking/booking.service');

function makeService({ available, lookup }) {
  let lookupCalls = 0;
  const service = new BookingService({
    repository: {
      findStalePendingBookings: async () => [{ id: 9 }],
      findPendingPaymentSnapshotForReconciliation: async () => ({
        payment_method: 'payos', status: 'pending', transaction_ref: '9001', amount: 100,
      }),
      findPaymentForReconciliation: async () => ({
        payment_method: 'payos', status: 'pending', transaction_ref: '9001', amount: 100,
      }),
      findBookingForReconciliation: async () => ({ status: 'pending_payment', hold_expires_at: new Date(0) }),
    },
    transactionManager: { transaction: async (run) => run({ LOCK: { UPDATE: 'UPDATE' } }) },
    payosReconciliationAvailable: () => available,
    payosStatusLookup: async (...args) => { lookupCalls += 1; return lookup(...args); },
  });
  return { service, lookupCalls: () => lookupCalls };
}

for (const mode of ['disabled', 'demo']) {
  test(`stale payOS reconciliation skips gateway lookup in ${mode} capability mode`, async () => {
    const { service, lookupCalls } = makeService({ available: false, lookup: async () => ({ status: 'PAID' }) });
    const result = await service.reconcileStalePendingPayments();
    assert.equal(result.reconciledCount, 0);
    assert.equal(lookupCalls(), 0);
  });
}

test('stale payOS reconciliation still uses the gateway when live capability is available', async () => {
  const { service, lookupCalls } = makeService({ available: true, lookup: async () => ({ status: 'PENDING' }) });
  const result = await service.reconcileStalePendingPayments();
  assert.equal(result.reconciledCount, 0);
  assert.equal(lookupCalls(), 1);
});
