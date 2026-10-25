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
process.env.VNPAY_MODE ||= 'sandbox';
process.env.VNP_TMN_CODE ||= 'TEST_TMN';
process.env.CLIENT_URL ||= 'http://localhost:5173';
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
    vnp_TmnCode: process.env.VNP_TMN_CODE || 'TEST_TMN',
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

test('IT-05 concurrent legacy VNPay refunds fail closed without mutation', { timeout: 20000 }, async (t) => {
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
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 0);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 2);
    assertNoLockFailure(results);

    const [persistedBooking, persistedPayment, persistedFlight] = await Promise.all([
      models.Booking.findByPk(booking.id),
      models.Payment.findByPk(payment.id),
      models.Flight.findByPk(fixture.flight.id),
    ]);
    assert.equal(persistedBooking.status, 'confirmed');
    assert.equal(persistedPayment.status, 'success');
    assert.equal(persistedFlight.available_seats, 0);
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
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
    assertNoLockFailure(results);

    const [persistedBooking, persistedPayment, persistedFlight] = await Promise.all([
      models.Booking.findByPk(booking.id),
      models.Payment.findByPk(payment.id),
      models.Flight.findByPk(fixture.flight.id),
    ]);
    assert.equal(persistedBooking.status, 'confirmed');
    assert.equal(persistedPayment.status, 'success');
    assert.equal(persistedFlight.available_seats, 0);
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

test('IT-09 flight cancellation and payment initiation preserve commit order and reconciliation', { timeout: 30000 }, async (t) => {
  t.mock.method(emailService, 'sendBookingConfirmation', async () => ({ id: 'integration-email-disabled' }));
  let hookName;
  try {
    // Cancellation commits first: a later payment initiation must observe the
    // cancelled flight and leave the holding booking/payment state untouched.
    const cancelledFirst = await createFlightFixture({ availableSeats: 1, totalSeats: 1 });
    const cancelledFirstBooking = await createHoldingBooking(cancelledFirst, 'IT09A');
    await flightService.cancelFlight(cancelledFirst.flight.id, { reason: 'IT-09 cancellation before payment initiation' });
    await assert.rejects(
      paymentService.initiatePayment({
        booking_id: cancelledFirstBooking.id,
        payment_method: 'vnpay',
        guest_email: cancelledFirstBooking.guest_email,
      }),
      (error) => error.statusCode === 400 && /no longer scheduled/i.test(error.message)
    );
    const [bookingAfterEarlyCancellation, earlyPaymentCount] = await Promise.all([
      models.Booking.findByPk(cancelledFirstBooking.id),
      models.Payment.count({ where: { booking_id: cancelledFirstBooking.id } }),
    ]);
    assert.equal(bookingAfterEarlyCancellation.status, 'holding');
    assert.equal(earlyPaymentCount, 0);

    // Payment initiation owns the Flight lock first: it is valid to commit a
    // pending attempt before cancellation commits. The callback must retain a
    // later charge for review without confirming a booking on a cancelled flight.
    const paymentFirst = await createFlightFixture({ availableSeats: 1, totalSeats: 1 });
    const paymentFirstPromotion = await createPromotionFixture({ maxUses: 1 });
    const paymentFirstBooking = await createHoldingBooking(paymentFirst, 'IT09B', paymentFirstPromotion.code);
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
      booking_id: paymentFirstBooking.id,
      payment_method: 'vnpay',
      guest_email: paymentFirstBooking.guest_email,
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
    const cancelFlightPromise = flightService.cancelFlight(paymentFirst.flight.id, { reason: 'IT-09 cancellation racing payment initiation' });

    const results = await Promise.allSettled([initiatePromise, cancelFlightPromise]);
    models.sequelize.removeHook('afterQuery', hookName);
    hookName = null;
    assertNoLockFailure(results);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 2);
    const payment = await models.Payment.findOne({ where: { booking_id: paymentFirstBooking.id } });
    trackPayment(payment);
    let [persistedBooking, persistedFlight] = await Promise.all([
      models.Booking.findByPk(paymentFirstBooking.id),
      models.Flight.findByPk(paymentFirst.flight.id),
    ]);
    assert.equal(persistedFlight.status, 'cancelled');
    assert.equal(persistedBooking.status, 'pending_payment');
    assert.equal(payment.status, 'pending');

    const webhookResult = await paymentService.handleVnpayIpn(successfulVnpayIpn(payment));
    [persistedBooking, persistedFlight] = await Promise.all([
      models.Booking.findByPk(paymentFirstBooking.id),
      models.Flight.findByPk(paymentFirst.flight.id),
    ]);
    const chargedPayment = await models.Payment.findByPk(payment.id);
    assert.match(webhookResult.Message, /manual review/i);
    assert.equal(chargedPayment.status, 'success');
    assert.equal(persistedBooking.status, 'expired');
    assert.equal(persistedFlight.status, 'cancelled');
    assert.equal(persistedFlight.available_seats, 1);
    const persistedPromotion = await models.Promotion.findByPk(paymentFirstPromotion.id);
    assert.equal(persistedPromotion.used_count, 0);
    const reconciliationCase = await models.PaymentReconciliationCase.findOne({
      where: { payment_id: payment.id },
    });
    assert.ok(reconciliationCase, 'late PAID must create a durable reconciliation case');
    assert.equal(reconciliationCase.state, 'manual_review');
    assert.equal(reconciliationCase.provider, 'vnpay');
    assert.equal(reconciliationCase.booking_id, paymentFirstBooking.id);
    assert.equal(reconciliationCase.last_gateway_status, 'PAID');
    assert.match(reconciliationCase.manual_review_reason, /booking cannot be paid|late paid/i);

    await assert.rejects(
      () => paymentService.processRefund(paymentFirstBooking.id, 'IT-09 cancelled flight reconciliation', adminUser),
      (error) => error.statusCode === 409 && error.code === 'VNPAY_REFUND_REQUIRES_DEDICATED_ENDPOINT',
    );
    const [refundedBooking, refundedPayment, flightAfterRefund] = await Promise.all([
      models.Booking.findByPk(paymentFirstBooking.id),
      models.Payment.findByPk(payment.id),
      models.Flight.findByPk(paymentFirst.flight.id),
    ]);
    assert.equal(refundedBooking.status, 'expired');
    assert.equal(refundedPayment.status, 'success');
    assert.equal(flightAfterRefund.available_seats, 1);
    assert.equal((await models.Promotion.findByPk(paymentFirstPromotion.id)).used_count, 0);

    // A duplicate late PAID callback is idempotent: it cannot release seats or
    // restore the promotion a second time, and it keeps the durable case.
    const duplicateWebhook = await paymentService.handleVnpayIpn(successfulVnpayIpn(payment));
    assert.match(duplicateWebhook.Message, /already processed|already confirmed|success|manual review/i);
    const [afterDuplicateBooking, afterDuplicatePayment, afterDuplicateFlight, afterDuplicatePromotion, cases] = await Promise.all([
      models.Booking.findByPk(paymentFirstBooking.id),
      models.Payment.findByPk(payment.id),
      models.Flight.findByPk(paymentFirst.flight.id),
      models.Promotion.findByPk(paymentFirstPromotion.id),
      models.PaymentReconciliationCase.count({ where: { payment_id: payment.id } }),
    ]);
    assert.equal(afterDuplicateBooking.status, 'expired');
    assert.equal(afterDuplicatePayment.status, 'success');
    assert.equal(afterDuplicateFlight.available_seats, 1);
    assert.equal(afterDuplicatePromotion.used_count, 0);
    assert.equal(cases, 1);

    // Refund and Flight cancellation touch the Flight row from independent
    // workflows. They must serialize without deadlock or double seat release.
    const refundRace = await createFlightFixture({ availableSeats: 1, totalSeats: 1 });
    const refundRaceBooking = await createHoldingBooking(refundRace, 'IT09C');
    const refundRacePayment = await initiateVnpay(refundRaceBooking);
    await paymentService.handleVnpayIpn(successfulVnpayIpn(refundRacePayment.payment));
    const refundRaceResults = await Promise.allSettled([
      paymentService.processRefund(refundRaceBooking.id, 'IT-09 refund vs cancellation', adminUser),
      flightService.cancelFlight(refundRace.flight.id, { reason: 'IT-09 cancellation racing refund' }),
    ]);
    assertNoLockFailure(refundRaceResults);
    assert.equal(refundRaceResults.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(refundRaceResults.filter((result) => result.status === 'rejected').length, 1);
    const [raceBooking, racePayment, raceFlight] = await Promise.all([
      models.Booking.findByPk(refundRaceBooking.id),
      models.Payment.findByPk(refundRacePayment.payment.id),
      models.Flight.findByPk(refundRace.flight.id),
    ]);
    assert.equal(raceBooking.status, 'confirmed');
    assert.equal(racePayment.status, 'success');
    assert.equal(raceFlight.status, 'cancelled');
    assert.equal(raceFlight.available_seats, 0);
  } finally {
    if (hookName) models.sequelize.removeHook('afterQuery', hookName);
    await cleanupTrackedFixtures();
  }
});
