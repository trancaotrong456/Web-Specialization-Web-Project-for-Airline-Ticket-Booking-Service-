const test = require('node:test');
const assert = require('node:assert/strict');
const PaymentService = require('../modules/payment/payment.service');

function createFixture() {
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  const booking = {
    id: 81,
    booking_code: 'BK-IDEMPOTENT',
    status: 'holding',
    total_amount: 240000,
    hold_expires_at: new Date(Date.now() + 60_000),
    user_id: null,
    guest_email: 'traveler@example.com',
  };
  const payments = new Map();
  const calls = { created: 0, saved: 0, paymentResponsesSaved: 0 };
  const repository = {
    async findLockedBooking(id, tx) {
      assert.equal(id, booking.id);
      assert.equal(tx, transaction);
      return booking;
    },
    async findPaymentByIdempotencyKey(key, tx) {
      assert.equal(tx, transaction);
      return payments.get(key) || null;
    },
    async createPayment(values, options) {
      assert.equal(options.transaction, transaction);
      calls.created += 1;
      const payment = { id: calls.created, ...values };
      payments.set(values.idempotency_key, payment);
      return payment;
    },
    async save(payment, options) {
      assert.equal(options.transaction, transaction);
      calls.saved += 1;
      if (payment.idempotency_key) calls.paymentResponsesSaved += 1;
      return payment;
    },
  };
  let transactionTail = Promise.resolve();
  const transactionManager = {
    transaction(run) {
      const result = transactionTail.then(() => run(transaction));
      transactionTail = result.catch(() => {});
      return result;
    },
  };
  return { service: new PaymentService({ repository, transactionManager }), booking, payments, calls };
}

test('repeating the same payment request key replays one transaction response', async () => {
  const fixture = createFixture();
  const request = {
    booking_id: 81,
    payment_method: 'vnpay',
    guest_email: 'traveler@example.com',
    idempotency_key: 'phase3-payment-request-0001',
  };

  const first = await fixture.service.initiatePayment(request);
  const retry = await fixture.service.initiatePayment(request);

  assert.deepEqual(retry, first);
  assert.equal(fixture.calls.created, 1);
  assert.equal(fixture.calls.paymentResponsesSaved, 1);
  assert.equal(fixture.payments.get(request.idempotency_key).request_fingerprint.length, 64);
  assert.equal(fixture.booking.status, 'pending_payment');
});

test('reusing a payment request key with a different payload is rejected', async () => {
  const fixture = createFixture();
  const originalMode = process.env.PAYOS_MODE;
  process.env.PAYOS_MODE = 'demo';
  const request = {
    booking_id: 81,
    payment_method: 'vnpay',
    guest_email: 'traveler@example.com',
    idempotency_key: 'phase3-payment-request-0002',
  };

  try {
    await fixture.service.initiatePayment(request);
    await assert.rejects(
      fixture.service.initiatePayment({ ...request, payment_method: 'payos' }),
      (error) => error.statusCode === 409
    );
    assert.equal(fixture.calls.created, 1);
  } finally {
    if (originalMode === undefined) delete process.env.PAYOS_MODE;
    else process.env.PAYOS_MODE = originalMode;
  }
});

test('concurrent requests for one booking and key create at most one payment', async () => {
  const fixture = createFixture();
  const request = {
    booking_id: 81,
    payment_method: 'vnpay',
    guest_email: 'traveler@example.com',
    idempotency_key: 'phase3-payment-request-0003',
  };

  const results = await Promise.allSettled([
    fixture.service.initiatePayment(request),
    fixture.service.initiatePayment(request),
  ]);

  assert.equal(fixture.calls.created, 1);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 2);
  assert.deepEqual(results[0].value, results[1].value);
  const retry = await fixture.service.initiatePayment(request);
  assert.equal(retry.transaction_ref, fixture.payments.get(request.idempotency_key).transaction_ref);
  assert.equal(fixture.calls.created, 1);
});
