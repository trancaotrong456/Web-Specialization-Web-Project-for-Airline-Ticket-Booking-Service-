'use strict';

const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bookingService = require('../../services/booking.service');
const paymentService = require('../../services/payment.service');
const flightService = require('../../services/flight.service');
const emailService = require('../../services/email.service');
const { signVnpayParams } = require('../../utils/checksum.util');
const {
  models,
  verifyConnectedDatabase,
} = require('./helpers/mysqlTestDatabase');
const {
  cleanupTrackedFixtures,
  createFlightFixture,
  createPromotionFixture,
  trackBooking,
  trackPayment,
} = require('./helpers/testFixtures');

const adminUser = { email: 'integration-admin@example.test' };
process.env.VNP_HASH_SECRET ||= crypto.randomBytes(32).toString('hex');

async function createHoldingBooking(fixture, suffix, promotionCode = undefined) {
  const booking = await bookingService.createHoldingBooking({
    flight_id: fixture.flight.id,
    fare_class_id: fixture.fareClass.id,
    promotion_code: promotionCode,
    passengers: [{ passenger_name: `IT Passenger ${suffix}`, passport_no: `P${suffix}`.slice(0, 30) }],
    guest_email: `it-${suffix.toLowerCase()}-${Date.now()}@example.test`,
  });
  return trackBooking(booking);
}

async function initiateVnpay(booking) {
  const result = await paymentService.initiatePayment({
    booking_id: booking.id,
    payment_method: 'vnpay',
    guest_email: booking.guest_email,
  });
  const payment = await models.Payment.findOne({ where: { transaction_ref: result.transaction_ref } });
  trackPayment(payment);
  return { result, payment };
}

function successfulVnpayIpn(payment) {
  const params = {
    vnp_TxnRef: payment.transaction_ref,
    vnp_Amount: Math.round(Number(payment.amount) * 100),
    vnp_ResponseCode: '00',
    vnp_TransactionStatus: '00',
  };
  params.vnp_SecureHash = signVnpayParams(params, process.env.VNP_HASH_SECRET);
  return params;
}

function assertNoLockFailure(results) {
  for (const result of results) {
    if (result.status === 'rejected') {
      assert.notEqual(result.reason?.original?.errno, 1213, 'unexpected MySQL deadlock');
      assert.notEqual(result.reason?.original?.errno, 1205, 'unexpected MySQL lock timeout');
    }
  }
}

before(async () => {
  await verifyConnectedDatabase();
});

after(async () => {
  await cleanupTrackedFixtures();
  await models.sequelize.close();
});

test('IT-01 concurrent booking locks the flight and prevents overselling', { timeout: 20000 }, async () => {
  const { flight, fareClass } = await createFlightFixture({ availableSeats: 1, totalSeats: 1 });
  const transactionConnections = new Set();
  const hookName = `it01-connections-${Date.now()}`;
  models.sequelize.addHook('beforeQuery', hookName, (options) => {
    const threadId = options.transaction?.connection?.threadId;
    if (threadId !== undefined) transactionConnections.add(threadId);
  });

  try {
    const attempts = await Promise.allSettled([
      bookingService.createHoldingBooking({
        flight_id: flight.id,
        fare_class_id: fareClass.id,
        passengers: [{ passenger_name: 'IT Passenger One', passport_no: 'IT01P1' }],
        guest_email: `it01-one-${Date.now()}@example.test`,
      }),
      bookingService.createHoldingBooking({
        flight_id: flight.id,
        fare_class_id: fareClass.id,
        passengers: [{ passenger_name: 'IT Passenger Two', passport_no: 'IT01P2' }],
        guest_email: `it01-two-${Date.now()}@example.test`,
      }),
    ]);

    const fulfilled = attempts.filter((attempt) => attempt.status === 'fulfilled');
    const rejected = attempts.filter((attempt) => attempt.status === 'rejected');
    assert.equal(fulfilled.length, 1, 'exactly one booking must succeed');
    assert.equal(rejected.length, 1, 'exactly one booking must fail');
    assert.equal(rejected[0].reason.statusCode, 400);
    assert.match(rejected[0].reason.message, /not enough available seats/i);
    trackBooking(fulfilled[0].value);

    const [persistedFlight, bookings, passengerCount] = await Promise.all([
      models.Flight.findByPk(flight.id),
      models.Booking.findAll({ where: { flight_id: flight.id } }),
      models.BookingPassenger.count({
        include: [{ model: models.Booking, as: 'booking', where: { flight_id: flight.id }, required: true }],
      }),
    ]);
    bookings.forEach(trackBooking);

    assert.equal(persistedFlight.available_seats, 0);
    assert.equal(bookings.length, 1, 'failed transaction must not leave a booking');
    assert.equal(passengerCount, 1, 'failed transaction must not leave a passenger');
    assert.ok(transactionConnections.size >= 2, 'concurrent transactions must use independent MySQL connections');
  } finally {
    models.sequelize.removeHook('beforeQuery', hookName);
    await cleanupTrackedFixtures();
  }
});

test('IT-02 concurrent cancellation returns seats and promotion usage exactly once', { timeout: 20000 }, async () => {
  const fixture = await createFlightFixture({ availableSeats: 1, totalSeats: 1 });
  const promotion = await createPromotionFixture({ maxUses: 1 });
  try {
    const booking = await createHoldingBooking(fixture, 'IT02', promotion.code);
    const results = await Promise.allSettled([
      bookingService.cancelHoldingBooking(booking.id, null, booking.guest_email),
      bookingService.cancelHoldingBooking(booking.id, null, booking.guest_email),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
    assertNoLockFailure(results);

    const [persistedBooking, persistedFlight, persistedPromotion] = await Promise.all([
      models.Booking.findByPk(booking.id),
      models.Flight.findByPk(fixture.flight.id),
      models.Promotion.findByPk(promotion.id),
    ]);
    assert.equal(persistedBooking.status, 'cancelled');
    assert.equal(persistedFlight.available_seats, 1);
    assert.equal(persistedPromotion.used_count, 0);
  } finally {
    await cleanupTrackedFixtures();
  }
});

test('IT-03 duplicate successful VNPay webhooks are idempotent', { timeout: 20000 }, async (t) => {
  t.mock.method(emailService, 'sendBookingConfirmation', async () => ({ id: 'integration-email-disabled' }));
  const fixture = await createFlightFixture({ availableSeats: 1, totalSeats: 1 });
  try {
    const booking = await createHoldingBooking(fixture, 'IT03');
    const { payment } = await initiateVnpay(booking);
    const payload = successfulVnpayIpn(payment);
    const results = await Promise.allSettled([
      paymentService.handleVnpayIpn({ ...payload }),
      paymentService.handleVnpayIpn({ ...payload }),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 2);
    assertNoLockFailure(results);

    const [persistedBooking, persistedPayment, persistedFlight] = await Promise.all([
      models.Booking.findByPk(booking.id),
      models.Payment.findByPk(payment.id),
      models.Flight.findByPk(fixture.flight.id),
    ]);
    assert.equal(persistedBooking.status, 'confirmed');
    assert.equal(persistedPayment.status, 'success');
    assert.ok(persistedPayment.paid_at);
    assert.equal(persistedFlight.available_seats, 0);
    assert.equal(emailService.sendBookingConfirmation.mock.callCount(), 1);
  } finally {
    await cleanupTrackedFixtures();
  }
});

test('IT-04 successful webhook racing stale-payment reconciliation preserves the charge', { timeout: 20000 }, async (t) => {
  t.mock.method(emailService, 'sendBookingConfirmation', async () => ({ id: 'integration-email-disabled' }));
  const fixture = await createFlightFixture({ availableSeats: 1, totalSeats: 1 });
  const originalGrace = process.env.PAYMENT_PENDING_GRACE_MINUTES;
  process.env.PAYMENT_PENDING_GRACE_MINUTES = '0';
  try {
    const booking = await createHoldingBooking(fixture, 'IT04');
    const { payment } = await initiateVnpay(booking);
    await models.Booking.update(
      { hold_expires_at: new Date(Date.now() - 60 * 1000) },
      { where: { id: booking.id } }
    );

    const results = await Promise.allSettled([
      paymentService.handleVnpayIpn(successfulVnpayIpn(payment)),
      bookingService.reconcileStalePendingPayments(),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 2);
    assertNoLockFailure(results);

    const [persistedBooking, persistedPayment, persistedFlight] = await Promise.all([
      models.Booking.findByPk(booking.id),
      models.Payment.findByPk(payment.id),
      models.Flight.findByPk(fixture.flight.id),
    ]);
    assert.equal(persistedPayment.status, 'success', 'a signed successful charge must be retained');
    assert.ok(['pending_payment', 'expired'].includes(persistedBooking.status));
    assert.equal(
      persistedFlight.available_seats,
      persistedBooking.status === 'expired' ? 1 : 0,
      'seat release must match the final booking state exactly once'
    );
  } finally {
    if (originalGrace === undefined) delete process.env.PAYMENT_PENDING_GRACE_MINUTES;
    else process.env.PAYMENT_PENDING_GRACE_MINUTES = originalGrace;
    await cleanupTrackedFixtures();
  }
});

test('IT-05 concurrent refund refunds and releases seats exactly once', { timeout: 20000 }, async (t) => {
  t.mock.method(emailService, 'sendBookingConfirmation', async () => ({ id: 'integration-email-disabled' }));
  const fixture = await createFlightFixture({ availableSeats: 1, totalSeats: 1 });
  try {
    const booking = await createHoldingBooking(fixture, 'IT05');
    const { payment } = await initiateVnpay(booking);
    await paymentService.handleVnpayIpn(successfulVnpayIpn(payment));

    const results = await Promise.allSettled([
      paymentService.processRefund(booking.id, 'IT-05 concurrent refund A', adminUser),
      paymentService.processRefund(booking.id, 'IT-05 concurrent refund B', adminUser),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
    assertNoLockFailure(results);

    const [persistedBooking, persistedPayment, persistedFlight] = await Promise.all([
      models.Booking.findByPk(booking.id),
      models.Payment.findByPk(payment.id),
      models.Flight.findByPk(fixture.flight.id),
    ]);
    assert.equal(persistedBooking.status, 'cancelled');
    assert.equal(persistedPayment.status, 'refunded');
    assert.equal(persistedFlight.available_seats, 1);
  } finally {
    await cleanupTrackedFixtures();
  }
});

test('IT-06 refund racing a duplicate success webhook remains consistent', { timeout: 20000 }, async (t) => {
  t.mock.method(emailService, 'sendBookingConfirmation', async () => ({ id: 'integration-email-disabled' }));
  const fixture = await createFlightFixture({ availableSeats: 1, totalSeats: 1 });
  try {
    const booking = await createHoldingBooking(fixture, 'IT06');
    const { payment } = await initiateVnpay(booking);
    const payload = successfulVnpayIpn(payment);
    await paymentService.handleVnpayIpn(payload);

    const results = await Promise.allSettled([
      paymentService.processRefund(booking.id, 'IT-06 refund vs webhook', adminUser),
      paymentService.handleVnpayIpn({ ...payload }),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 2);
    assertNoLockFailure(results);

    const [persistedBooking, persistedPayment, persistedFlight] = await Promise.all([
      models.Booking.findByPk(booking.id),
      models.Payment.findByPk(payment.id),
      models.Flight.findByPk(fixture.flight.id),
    ]);
    assert.equal(persistedBooking.status, 'cancelled');
    assert.equal(persistedPayment.status, 'refunded');
    assert.equal(persistedFlight.available_seats, 1);
  } finally {
    await cleanupTrackedFixtures();
  }
});

test('IT-07 concurrent use of a one-use promotion never exceeds its limit', { timeout: 20000 }, async () => {
  const fixture = await createFlightFixture({ availableSeats: 2, totalSeats: 2 });
  const promotion = await createPromotionFixture({ maxUses: 1 });
  try {
    const results = await Promise.allSettled([
      createHoldingBooking(fixture, 'IT07A', promotion.code),
      createHoldingBooking(fixture, 'IT07B', promotion.code),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
    assertNoLockFailure(results);

    for (const result of results) {
      if (result.status === 'fulfilled') trackBooking(result.value);
    }
    const [persistedPromotion, persistedFlight, bookingCount, passengerCount] = await Promise.all([
      models.Promotion.findByPk(promotion.id),
      models.Flight.findByPk(fixture.flight.id),
      models.Booking.count({ where: { flight_id: fixture.flight.id, promotion_id: promotion.id } }),
      models.BookingPassenger.count({
        include: [{ model: models.Booking, as: 'booking', where: { flight_id: fixture.flight.id }, required: true }],
      }),
    ]);
    assert.equal(persistedPromotion.used_count, 1);
    assert.ok(persistedPromotion.used_count <= persistedPromotion.max_uses);
    assert.equal(persistedFlight.available_seats, 1);
    assert.equal(bookingCount, 1);
    assert.equal(passengerCount, 1);
  } finally {
    await cleanupTrackedFixtures();
  }
});

test('IT-08 stale successful payment attempt is recorded without confirming the newer attempt', { timeout: 20000 }, async (t) => {
  t.mock.method(emailService, 'sendBookingConfirmation', async () => ({ id: 'integration-email-disabled' }));
  const fixture = await createFlightFixture({ availableSeats: 1, totalSeats: 1 });
  try {
    const booking = await createHoldingBooking(fixture, 'IT08');
    const first = await initiateVnpay(booking);
    await models.sequelize.transaction(async (transaction) => {
      await models.Payment.update({ status: 'failed' }, { where: { id: first.payment.id }, transaction });
      await models.Booking.update({ status: 'holding' }, { where: { id: booking.id }, transaction });
    });
    const refreshedBooking = await models.Booking.findByPk(booking.id);
    const second = await initiateVnpay(refreshedBooking);

    const response = await paymentService.handleVnpayIpn(successfulVnpayIpn(first.payment));
    const [persistedBooking, oldPayment, newPayment, persistedFlight] = await Promise.all([
      models.Booking.findByPk(booking.id),
      models.Payment.findByPk(first.payment.id),
      models.Payment.findByPk(second.payment.id),
      models.Flight.findByPk(fixture.flight.id),
    ]);
    assert.match(response.Message, /manual review/i);
    assert.equal(oldPayment.status, 'success');
    assert.equal(newPayment.status, 'pending');
    assert.equal(persistedBooking.status, 'pending_payment');
    assert.equal(persistedFlight.available_seats, 0);
    assert.equal(emailService.sendBookingConfirmation.mock.callCount(), 0);
  } finally {
    await cleanupTrackedFixtures();
  }
});

test('IT-09 payment initiation racing flight cancellation cannot leave a new pending payment', { timeout: 20000 }, async () => {
  const fixture = await createFlightFixture({ availableSeats: 1, totalSeats: 1 });
  let hookName;
  try {
    const booking = await createHoldingBooking(fixture, 'IT09');
    let signalFlightLock;
    const flightLocked = new Promise((resolve) => { signalFlightLock = resolve; });
    hookName = `it09-flight-lock-${Date.now()}`;
    models.sequelize.addHook('afterQuery', hookName, (options, query) => {
      if (
        options.transaction
        && /FROM `flights` AS `Flight`/i.test(query.sql || '')
        && /FOR UPDATE/i.test(query.sql || '')
      ) signalFlightLock();
    });

    const initiatePromise = paymentService.initiatePayment({
      booking_id: booking.id,
      payment_method: 'vnpay',
      guest_email: booking.guest_email,
    });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Timed out waiting for payment flight lock')),
        5000
      );
      flightLocked.then(() => {
        clearTimeout(timeout);
        resolve();
      }, reject);
    });
    const cancelFlightPromise = flightService.updateFlight(fixture.flight.id, { status: 'cancelled' });

    const results = await Promise.allSettled([initiatePromise, cancelFlightPromise]);
    assertNoLockFailure(results);
    const [persistedBooking, persistedFlight, paymentCount] = await Promise.all([
      models.Booking.findByPk(booking.id),
      models.Flight.findByPk(fixture.flight.id),
      models.Payment.count({ where: { booking_id: booking.id } }),
    ]);
    assert.equal(persistedFlight.status, 'cancelled');
    assert.equal(paymentCount, 0, 'flight cancellation race must not leave a newly-created payment');
    assert.equal(persistedBooking.status, 'holding');
  } finally {
    if (hookName) models.sequelize.removeHook('afterQuery', hookName);
    await cleanupTrackedFixtures();
  }
});
