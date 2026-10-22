'use strict';

const { after, afterEach, before, test } = require('node:test');
const assert = require('node:assert/strict');
const paymentService = require('../../services/payment.service');
const bookingService = require('../../services/booking.service');
const { models, verifyConnectedDatabase } = require('./helpers/mysqlTestDatabase');
const { cleanupTrackedFixtures, createFlightFixture, trackBooking, trackPayment } = require('./helpers/testFixtures');

process.env.PAYOS_MODE = 'demo';

async function fixture(suffix) {
  const flight = await createFlightFixture({ availableSeats: 1, totalSeats: 1 });
  const booking = trackBooking(await bookingService.createHoldingBooking({
    flight_id: flight.flight.id, fare_class_id: flight.fareClass.id,
    passengers: [{ passenger_name: `Retry ${suffix}`, passport_no: `RETRY-${suffix}` }],
    guest_email: `retry-${suffix}-${Date.now()}@example.test`,
  }));
  const initiated = await paymentService.initiatePayment({
    booking_id: booking.id, payment_method: 'payos', guest_email: booking.guest_email,
  });
  const payment = trackPayment(await models.Payment.findOne({ where: { transaction_ref: initiated.transaction_ref } }));
  const reconciliationCase = await models.sequelize.transaction((transaction) => paymentService.repository.createOrFindCase({
    paymentId: payment.id, bookingId: booking.id, provider: 'payos', nextAttemptAt: new Date(0),
  }, { transaction }));
  return { flight, booking, payment, reconciliationCase };
}

before(async () => { await verifyConnectedDatabase(); });
afterEach(async () => { await cleanupTrackedFixtures(); });
after(async () => { await cleanupTrackedFixtures(); await models.sequelize.close(); });

test('IT-34 payOS worker resolves a verified PAID case exactly once', { timeout: 20000 }, async () => {
  const f = await fixture('IT34');
  const previous = paymentService.getPayosPaymentStatus;
  paymentService.getPayosPaymentStatus = async () => ({ status: 'PAID', orderCode: f.payment.transaction_ref, amount: f.payment.amount });
  try {
    const result = await paymentService.reconcilePayosCases({ now: new Date(), jitterRatio: 0 });
    assert.equal(result.claimedCount, 1);
    assert.equal((await models.Payment.findByPk(f.payment.id)).status, 'success');
    assert.equal((await models.Booking.findByPk(f.booking.id)).status, 'confirmed');
    assert.equal((await models.PaymentReconciliationCase.findByPk(f.reconciliationCase.id)).state, 'resolved');
    assert.equal((await paymentService.reconcilePayosCases({ now: new Date(), jitterRatio: 0 })).claimedCount, 0);
  } finally { paymentService.getPayosPaymentStatus = previous; }
});

test('IT-35 pending payOS attempts use persisted backoff and escalate after six attempts', { timeout: 30000 }, async () => {
  const f = await fixture('IT35');
  const previous = paymentService.getPayosPaymentStatus;
  paymentService.getPayosPaymentStatus = async () => ({ status: 'PENDING', orderCode: f.payment.transaction_ref, amount: f.payment.amount });
  try {
    let now = new Date();
    const expectedDelays = [60000, 120000, 240000, 480000, 960000];
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      await models.PaymentReconciliationCase.update({ next_attempt_at: now, lease_owner: null, lease_expires_at: null }, { where: { id: f.reconciliationCase.id } });
      assert.equal((await paymentService.reconcilePayosCases({ now, jitterRatio: 0 })).claimedCount, 1);
      const stored = await models.PaymentReconciliationCase.findByPk(f.reconciliationCase.id);
      if (attempt < 6) {
        assert.equal(stored.state, 'active');
        const observedDelay = new Date(stored.next_attempt_at).getTime() - now.getTime();
        assert.ok(Math.abs(observedDelay - expectedDelays[attempt - 1]) <= 1000,
          `expected ${expectedDelays[attempt - 1]}ms, observed ${observedDelay}ms`);
      }
      now = new Date(now.getTime() + (30 * 60 * 1000));
    }
    const stored = await models.PaymentReconciliationCase.findByPk(f.reconciliationCase.id);
    assert.equal(stored.state, 'manual_review');
    assert.equal((await models.Payment.findByPk(f.payment.id)).status, 'pending');
  } finally { paymentService.getPayosPaymentStatus = previous; }
});

test('IT-36 webhook racing a pending worker preserves success and resolves the case', { timeout: 30000 }, async () => {
  const f = await fixture('IT36');
  const previous = paymentService.getPayosPaymentStatus;
  let lookupStarted;
  const started = new Promise((resolve) => { lookupStarted = resolve; });
  paymentService.getPayosPaymentStatus = async () => {
    lookupStarted();
    await new Promise((resolve) => setTimeout(resolve, 25));
    return { status: 'PENDING', orderCode: f.payment.transaction_ref, amount: f.payment.amount };
  };
  try {
    const worker = paymentService.reconcilePayosCases({ now: new Date(), jitterRatio: 0 });
    await started;
    await paymentService._processVerifiedPayosWebhook({ orderCode: f.payment.transaction_ref, amount: f.payment.amount, isSuccess: true });
    await worker;
    assert.equal((await models.Payment.findByPk(f.payment.id)).status, 'success');
    assert.equal((await models.Booking.findByPk(f.booking.id)).status, 'confirmed');
    assert.equal((await models.PaymentReconciliationCase.findByPk(f.reconciliationCase.id)).state, 'resolved');
  } finally { paymentService.getPayosPaymentStatus = previous; }
});

test('IT-37 late PAID after manual review records payment without reallocating inventory', { timeout: 20000 }, async () => {
  const f = await fixture('IT37');
  await models.Booking.update({ status: 'expired' }, { where: { id: f.booking.id } });
  await models.PaymentReconciliationCase.update({ state: 'manual_review', manual_review_reason: 'LATE_PAID_AFTER_EXPIRY' }, { where: { id: f.reconciliationCase.id } });
  const beforeFlight = (await models.Flight.findByPk(f.flight.flight.id)).available_seats;
  const beforePayment = await models.Payment.findByPk(f.payment.id);
  const result = await paymentService._processVerifiedPayosWebhook({ orderCode: beforePayment.transaction_ref, amount: beforePayment.amount, isSuccess: true });
  const afterPayment = await models.Payment.findByPk(f.payment.id);
  assert.equal(afterPayment.status, 'success');
  assert.ok(afterPayment.paid_at);
  assert.equal((await models.Booking.findByPk(f.booking.id)).status, 'expired');
  assert.equal((await models.Flight.findByPk(f.flight.flight.id)).available_seats, beforeFlight);
  assert.equal((await models.PaymentReconciliationCase.findByPk(f.reconciliationCase.id)).state, 'manual_review');
  assert.match(result.message, /manual review/i);
  await paymentService._processVerifiedPayosWebhook({ orderCode: beforePayment.transaction_ref, amount: beforePayment.amount, isSuccess: true });
  assert.equal((await models.Payment.findByPk(f.payment.id)).status, 'success');
  assert.equal((await models.Flight.findByPk(f.flight.flight.id)).available_seats, beforeFlight);
});

test('IT-42 payOS worker does not claim a VNPay reconciliation case', { timeout: 20000 }, async () => {
  const f = await fixture('IT42');
  const repository = paymentService.repository;
  await models.PaymentReconciliationCase.destroy({ where: { payment_id: f.payment.id }, force: true });
  const vnpayCase = await models.sequelize.transaction((transaction) => repository.createOrFindCase({
    paymentId: f.payment.id, bookingId: f.booking.id, provider: 'vnpay', nextAttemptAt: new Date(0),
  }, { transaction }));
  const result = await models.sequelize.transaction((transaction) => repository.claimDueCases({
    owner: 'it42-payos-worker', provider: 'payos', now: new Date(), limit: 10,
  }, { transaction }));
  const stored = await models.PaymentReconciliationCase.findByPk(vnpayCase.id);
  assert.equal(result.length, 0);
  assert.equal(stored.provider, 'vnpay');
  assert.equal(stored.attempt_count, 0);
  assert.equal(stored.lease_owner, null);
});

test('IT-43 discovery finds a missing case after the first 100 existing cases', { timeout: 60000 }, async () => {
  const f = await createFlightFixture({ availableSeats: 1, totalSeats: 1 });
  const bookings = Array.from({ length: 101 }, (_, index) => ({
    booking_code: `B43${String(index).padStart(3, '0')}`,
    flight_id: f.flight.id, fare_class_id: f.fareClass.id, status: 'pending_payment',
    total_amount: 1000, hold_expires_at: new Date(Date.now() - 600000), guest_email: `it43-${index}@example.test`,
  }));
  const createdBookings = await models.Booking.bulkCreate(bookings);
  createdBookings.forEach(trackBooking);
  const payments = await models.Payment.bulkCreate(createdBookings.map((booking, index) => ({
    booking_id: booking.id, amount: 1000, payment_method: 'payos', status: 'pending',
    transaction_ref: `943${Date.now()}${String(index).padStart(3, '0')}`,
  })));
  payments.forEach(trackPayment);
  await models.PaymentReconciliationCase.bulkCreate(payments.slice(0, 100).map((payment) => ({
    payment_id: payment.id, booking_id: payment.booking_id, provider: 'payos', next_attempt_at: new Date(0),
  })));
  const created = await paymentService.ensurePayosReconciliationCases({ now: new Date(Date.now() + 60000), graceMinutes: 0, limit: 100 });
  assert.equal(created, 1);
  assert.equal(await models.PaymentReconciliationCase.count({ where: { payment_id: payments[100].id } }), 1);
});

test('IT-44 failed case persistence is recoverable on the next discovery run', { timeout: 20000 }, async () => {
  const f = await fixture('IT44');
  await models.PaymentReconciliationCase.destroy({ where: { payment_id: f.payment.id }, force: true });
  const repository = paymentService.repository;
  const previous = repository.createOrFindCase;
  let failed = true;
  repository.createOrFindCase = async (...args) => {
    if (failed) { failed = false; throw new Error('simulated case store outage'); }
    return previous.apply(repository, args);
  };
  try {
    assert.equal(await paymentService.ensurePayosReconciliationCases({ now: new Date(Date.now() + 60000), graceMinutes: 0 }), 0);
    assert.equal((await models.Payment.findByPk(f.payment.id)).status, 'pending');
    assert.equal(await models.PaymentReconciliationCase.count({ where: { payment_id: f.payment.id } }), 0);
    assert.equal(await paymentService.ensurePayosReconciliationCases({ now: new Date(Date.now() + 120000), graceMinutes: 0 }), 1);
    assert.equal(await models.PaymentReconciliationCase.count({ where: { payment_id: f.payment.id } }), 1);
  } finally { repository.createOrFindCase = previous; }
});

test('IT-47 gateway credentials are redacted before last_error persistence', { timeout: 20000 }, async () => {
  const f = await fixture('IT47');
  const repository = paymentService.repository;
  const claimed = await models.sequelize.transaction((transaction) => repository.claimDueCases({
    owner: 'it47-worker', provider: 'payos', now: new Date(), limit: 1,
  }, { transaction }));
  assert.equal(claimed.length, 1);
  await models.sequelize.transaction((transaction) => repository.completeAttempt(
    f.reconciliationCase.id,
    'it47-worker',
    { lastGatewayStatus: 'UNKNOWN', lastError: 'Authorization: Bearer secret-token https://gw.test/cb?apiKey=secret-key' },
    { transaction },
  ));
  const stored = await models.PaymentReconciliationCase.findByPk(f.reconciliationCase.id);
  assert.doesNotMatch(stored.last_error, /secret-token|secret-key/);
  assert.match(stored.last_error, /REDACTED/);
});
