'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const PaymentService = require('../modules/payment/payment.service');

function fixture({ gatewayGet, localLookup } = {}) {
  const writes = [];
  const payment = {
    id: 4,
    booking_id: 7,
    payment_method: 'payos',
    status: 'pending',
    transaction_ref: '1004',
    amount: 1250000,
    booking: { id: 7, status: 'pending_payment' },
  };
  const service = new PaymentService({
    repository: {
      findPaymentWithBookingByRef: async (...args) => {
        if (localLookup) return localLookup(...args);
        return payment;
      },
      save: async () => writes.push('save'),
      findLockedPaymentById: async () => { writes.push('lock-payment'); return payment; },
      findLockedBookingWithPassengers: async () => { writes.push('lock-booking'); return payment.booking; },
    },
    transactionManager: { transaction: async (work) => work({ LOCK: { UPDATE: 'UPDATE' } }) },
    logger: { warn() {} },
    payOSFactory: () => ({ paymentRequests: { get: gatewayGet || (async () => ({ status: 'CANCELLED', orderCode: 1004 })) } }),
  });
  return { service, payment, writes };
}

async function live(run) {
  const previous = {
    PAYOS_MODE: process.env.PAYOS_MODE,
    NODE_ENV: process.env.NODE_ENV,
    PAYOS_CLIENT_ID: process.env.PAYOS_CLIENT_ID,
    PAYOS_API_KEY: process.env.PAYOS_API_KEY,
    PAYOS_CHECKSUM_KEY: process.env.PAYOS_CHECKSUM_KEY,
  };
  process.env.PAYOS_MODE = 'live';
  process.env.NODE_ENV = 'test';
  process.env.PAYOS_CLIENT_ID = 'test-client-id';
  process.env.PAYOS_API_KEY = 'test-api-key';
  process.env.PAYOS_CHECKSUM_KEY = 'test-checksum-key';
  try { await run(); } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

test('CANCELLED browser return is informational and never mutates local state', async () => {
  await live(async () => {
    const f = fixture();
    const result = await f.service.handlePayosReturn({ orderCode: '1004', cancel: 'true' });
    assert.deepEqual(result, { orderCode: '1004', status: 'CANCELLED', processed: false, bookingId: 7 });
    assert.deepEqual(f.writes, []);
  });
});

test('forged cancellation query is rejected by authoritative gateway status without mutation', async () => {
  await live(async () => {
    const f = fixture({ gatewayGet: async () => ({ status: 'PAID', orderCode: 1004, amount: 1250000 }) });
    const result = await f.service.handlePayosReturn({ orderCode: '1004', status: 'CANCELLED' });
    assert.equal(result.status, 'PAID');
    assert.equal(result.processed, false);
    assert.deepEqual(f.writes, []);
  });
});

test('duplicate and stale browser returns remain read-only', async () => {
  await live(async () => {
    const f = fixture();
    const first = await f.service.handlePayosReturn({ orderCode: '1004', cancel: 'true' });
    const second = await f.service.handlePayosReturn({ orderCode: '1004', cancel: 'true' });
    assert.equal(first.processed, false);
    assert.equal(second.processed, false);
    assert.deepEqual(f.writes, []);
  });
});

test('gateway failure returns safe unknown status without mutation', async () => {
  await live(async () => {
    const f = fixture({ gatewayGet: async () => { throw new Error('timeout'); } });
    const result = await f.service.handlePayosReturn({ orderCode: '1004', cancel: 'true' });
    assert.deepEqual(result, { orderCode: '1004', status: 'UNKNOWN', processed: false, verification: 'unavailable' });
    assert.deepEqual(f.writes, []);
  });
});

test('gateway order mismatch and local lookup failure remain informational', async () => {
  await live(async () => {
    const mismatch = fixture({ gatewayGet: async () => ({ status: 'CANCELLED', orderCode: 999 }) });
    assert.deepEqual(await mismatch.service.handlePayosReturn({ orderCode: '1004', cancel: 'true' }), {
      orderCode: '1004', status: 'UNKNOWN', processed: false, verification: 'mismatch',
    });
    assert.deepEqual(mismatch.writes, []);

    const lookupFailure = fixture({ localLookup: async () => { throw new Error('db unavailable'); } });
    const result = await lookupFailure.service.handlePayosReturn({ orderCode: '1004', cancel: 'true' });
    assert.deepEqual(result, { orderCode: '1004', status: 'CANCELLED', processed: false });
    assert.deepEqual(lookupFailure.writes, []);
  });
});
