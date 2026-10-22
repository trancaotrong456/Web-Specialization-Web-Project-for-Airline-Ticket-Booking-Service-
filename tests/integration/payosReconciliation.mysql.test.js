'use strict';

const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const paymentService = require('../../services/payment.service');
const bookingService = require('../../services/booking.service');
const { signPayosDemoPayload } = require('../../utils/checksum.util');
const { models, verifyConnectedDatabase } = require('./helpers/mysqlTestDatabase');
const {
  cleanupTrackedFixtures, createFlightFixture, trackBooking, trackPayment,
} = require('./helpers/testFixtures');

process.env.PAYOS_MODE = 'demo';
process.env.PAYOS_DEMO_SECRET ||= 'integration-demo-secret';
process.env.PAYMENT_PENDING_GRACE_MINUTES = '0';
paymentService._triggerBookingConfirmationEmail = async () => {};

const adminUser = { id: 1, email: 'integration-admin@example.test' };

async function createStalePayosBooking(suffix) {
  const fixture = await createFlightFixture({ availableSeats: 1, totalSeats: 1 });
  const booking = trackBooking(await bookingService.createHoldingBooking({
    flight_id: fixture.flight.id,
    fare_class_id: fixture.fareClass.id,
    passengers: [{ passenger_name: `payOS ${suffix}`, passport_no: `P-${suffix}` }],
    guest_email: `payos-${suffix}-${Date.now()}@example.test`,
  }));
  const initiated = await paymentService.initiatePayment({
    booking_id: booking.id, payment_method: 'payos', guest_email: booking.guest_email,
  });
  const payment = trackPayment(await models.Payment.findOne({ where: { transaction_ref: initiated.transaction_ref } }));
  await models.Booking.update({ hold_expires_at: new Date(0) }, { where: { id: booking.id } });
  return { fixture, booking, payment };
}

async function withStatus(status, callback) {
  const previous = bookingService.payosStatusLookup;
  bookingService.payosStatusLookup = async (transactionRef) => {
    if (status === 'TIMEOUT') throw new Error('simulated payOS timeout');
    const payment = await models.Payment.findOne({ where: { transaction_ref: transactionRef } });
    return { status, orderCode: transactionRef, amount: Number(payment.amount) };
  };
  try { return await callback(); } finally { bookingService.payosStatusLookup = previous; }
}

before(async () => { await verifyConnectedDatabase(); });
after(async () => { await cleanupTrackedFixtures(); await models.sequelize.close(); });

test('IT-20 payOS Payment Link timeout keeps pending attempt for reconciliation', { timeout: 20000 }, async () => {
  const previousGetClient = paymentService._getPayOSClient;
  const previousEnv = Object.fromEntries(['PAYOS_MODE', 'PAYOS_CLIENT_ID', 'PAYOS_API_KEY', 'PAYOS_CHECKSUM_KEY', 'PAYOS_RETURN_URL', 'PAYOS_CANCEL_URL']
    .map((key) => [key, process.env[key]]));
  process.env.PAYOS_MODE = 'live';
  process.env.PAYOS_CLIENT_ID = 'integration-client';
  process.env.PAYOS_API_KEY = 'integration-key';
  process.env.PAYOS_CHECKSUM_KEY = 'integration-checksum';
  process.env.PAYOS_RETURN_URL = 'https://integration.example/payos-return';
  process.env.PAYOS_CANCEL_URL = 'https://integration.example/payos-cancel';
  paymentService._getPayOSClient = () => ({ paymentRequests: { create: async () => { throw new Error('simulated create timeout'); } } });
  try {
    const fixture = await createFlightFixture({ availableSeats: 1, totalSeats: 1 });
    const booking = trackBooking(await bookingService.createHoldingBooking({
      flight_id: fixture.flight.id, fare_class_id: fixture.fareClass.id,
      passengers: [{ passenger_name: 'payOS IT20', passport_no: 'P-IT20' }],
      guest_email: `payos-it20-${Date.now()}@example.test`,
    }));
    let error;
    try {
      await paymentService.initiatePayment({
        booking_id: booking.id, payment_method: 'payos', guest_email: booking.guest_email,
      });
    } catch (caught) {
      error = caught;
    }
    assert.ok(error);
    const payment = trackPayment(await models.Payment.findOne({ where: { transaction_ref: error.transactionRef } }));
    assert.equal(payment.status, 'pending');
    assert.equal((await models.Booking.findByPk(booking.id)).status, 'pending_payment');
  } finally {
    paymentService._getPayOSClient = previousGetClient;
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await cleanupTrackedFixtures();
  }
});

test('IT-21 payOS PAID lookup records payment and expires booking without confirming it', { timeout: 20000 }, async () => {
  const { fixture, booking, payment } = await createStalePayosBooking('IT21');
  await withStatus('PAID', async () => {
    const result = await bookingService.reconcileStalePendingPayments();
    assert.equal(result.reconciledCount, 1);
  });
  assert.equal((await models.Payment.findByPk(payment.id)).status, 'success');
  assert.equal((await models.Booking.findByPk(booking.id)).status, 'expired');
  assert.equal((await models.Flight.findByPk(fixture.flight.id)).available_seats, 1);
});

test('IT-22 payOS PENDING lookup leaves payment and inventory unchanged', { timeout: 20000 }, async () => {
  const { fixture, booking, payment } = await createStalePayosBooking('IT22');
  await withStatus('PENDING', async () => { await bookingService.reconcileStalePendingPayments(); });
  assert.equal((await models.Payment.findByPk(payment.id)).status, 'pending');
  assert.equal((await models.Booking.findByPk(booking.id)).status, 'pending_payment');
  assert.equal((await models.Flight.findByPk(fixture.flight.id)).available_seats, 0);
});

test('IT-23 payOS CANCELLED lookup fails payment and releases inventory once', { timeout: 20000 }, async () => {
  const { fixture, booking, payment } = await createStalePayosBooking('IT23');
  await withStatus('CANCELLED', async () => { await bookingService.reconcileStalePendingPayments(); });
  assert.equal((await models.Payment.findByPk(payment.id)).status, 'failed');
  assert.equal((await models.Booking.findByPk(booking.id)).status, 'expired');
  assert.equal((await models.Flight.findByPk(fixture.flight.id)).available_seats, 1);
});

test('IT-24 payOS lookup timeout is unknown and preserves pending state', { timeout: 20000 }, async () => {
  const { fixture, booking, payment } = await createStalePayosBooking('IT24');
  await withStatus('TIMEOUT', async () => { await bookingService.reconcileStalePendingPayments(); });
  assert.equal((await models.Payment.findByPk(payment.id)).status, 'pending');
  assert.equal((await models.Booking.findByPk(booking.id)).status, 'pending_payment');
  assert.equal((await models.Flight.findByPk(fixture.flight.id)).available_seats, 0);
});

test('IT-25 concurrent payOS webhook and reconciliation do not duplicate confirmation or seat changes', { timeout: 20000 }, async () => {
  const { fixture, booking, payment } = await createStalePayosBooking('IT25');
  const payload = { orderCode: Number(payment.transaction_ref), amount: Number(payment.amount), status: 'success', timestamp: Date.now() };
  const body = { ...payload, signature: signPayosDemoPayload(payload, process.env.PAYOS_DEMO_SECRET) };
  await withStatus('PAID', async () => {
    await Promise.all([bookingService.reconcileStalePendingPayments(), paymentService.handlePayosDemoWebhook(body)]);
  });
  assert.equal((await models.Payment.findByPk(payment.id)).status, 'success');
  assert.equal((await models.Booking.findByPk(booking.id)).status, 'expired');
  assert.equal((await models.Flight.findByPk(fixture.flight.id)).available_seats, 1);
});

test('IT-26 repeated payOS reconciliation has no duplicate side effects', { timeout: 20000 }, async () => {
  const { fixture, booking, payment } = await createStalePayosBooking('IT26');
  await withStatus('PAID', async () => {
    assert.equal((await bookingService.reconcileStalePendingPayments()).reconciledCount, 1);
    assert.equal((await bookingService.reconcileStalePendingPayments()).reconciledCount, 0);
  });
  assert.equal((await models.Payment.findByPk(payment.id)).status, 'success');
  assert.equal((await models.Booking.findByPk(booking.id)).status, 'expired');
  assert.equal((await models.Flight.findByPk(fixture.flight.id)).available_seats, 1);
});
