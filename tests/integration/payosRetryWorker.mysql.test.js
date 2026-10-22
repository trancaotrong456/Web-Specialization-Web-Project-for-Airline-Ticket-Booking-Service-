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
