'use strict';

const { before, after, afterEach, test } = require('node:test');
const assert = require('node:assert/strict');
const bookingService = require('../../services/booking.service');
const paymentService = require('../../services/payment.service');
const flightService = require('../../services/flight.service');
const { models, verifyConnectedDatabase } = require('./helpers/mysqlTestDatabase');
const { createFlightFixture, createPromotionFixture, trackBooking, trackPayment, cleanupTrackedFixtures } = require('./helpers/testFixtures');
const { signVnpayParams, signPayosDemoPayload } = require('../../utils/checksum.util');

process.env.PAYOS_MODE = 'demo';
paymentService._triggerBookingConfirmationEmail = async () => {};

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

async function fixture({ multiLeg = true } = {}) {
  // Create the later leg first, ensuring flight lock order differs from leg order.
  const second = multiLeg ? await createFlightFixture({ availableSeats: 2 }) : null;
  const first = await createFlightFixture({ availableSeats: 2 });
  if (second) {
    await second.flight.update({
      departure_airport_id: first.arrival.id,
      departure_time: new Date(new Date(first.flight.arrival_time).getTime() + 7200000),
      arrival_time: new Date(new Date(first.flight.arrival_time).getTime() + 14400000),
    });
  }
  const promo = await createPromotionFixture({ maxUses: 100 });
  const booking = trackBooking(await bookingService.createHoldingBooking({
    flight_id: first.flight.id, fare_class_id: first.fareClass.id,
    ...(second ? { trip_type: 'multi_city', itinerary_legs: [
      { flight_id: first.flight.id, fare_class_id: first.fareClass.id },
      { flight_id: second.flight.id, fare_class_id: second.fareClass.id },
    ] } : {}),
    promotion_code: promo.code, guest_email: `safety-${first.suffix}@example.test`,
    passengers: [{ passenger_name: 'Safety One' }, { passenger_name: 'Safety Two' }],
  }));
  return { first, second, promo, booking };
}

async function initiate(f, method) {
  const result = await paymentService.initiatePayment({ booking_id: f.booking.id,
    payment_method: method, guest_email: f.booking.guest_email });
  return trackPayment(await models.Payment.findOne({ where: { transaction_ref: result.transaction_ref } }));
}

function callback(payment, success = true) {
  if (payment.payment_method === 'vnpay') {
    const query = { vnp_TxnRef: payment.transaction_ref, vnp_TmnCode: process.env.VNP_TMN_CODE,
      vnp_Amount: String(Math.round(Number(payment.amount) * 100)),
      vnp_ResponseCode: success ? '00' : '24', vnp_TransactionStatus: success ? '00' : '24' };
    query.vnp_SecureHash = signVnpayParams(query, process.env.VNP_HASH_SECRET);
    return paymentService.handleVnpayIpn(query);
  }
  const body = { orderCode: Number(payment.transaction_ref), amount: Number(payment.amount),
    status: success ? 'success' : 'failed', timestamp: Date.now() };
  body.signature = signPayosDemoPayload(body, paymentService._getPayOSDemoSecret());
  return paymentService.handlePayosDemoWebhook(body);
}

async function reconcile(payment, status) {
  const row = await models.sequelize.transaction((transaction) => paymentService.repository.createOrFindCase({
    paymentId: payment.id, bookingId: payment.booking_id, provider: 'payos',
  }, { transaction }));
  await row.update({ state: 'active', lease_owner: paymentService.workerId,
    lease_expires_at: new Date(Date.now() + 60000), attempt_count: 1 });
  const original = paymentService.getPayosPaymentStatus;
  paymentService.getPayosPaymentStatus = async () => ({ status, orderCode: payment.transaction_ref, amount: payment.amount });
  try { await paymentService._processPayosReconciliationCase(row); }
  finally { paymentService.getPayosPaymentStatus = original; }
}

async function assertInventory(f, released = false) {
  for (const leg of [f.first, f.second].filter(Boolean)) {
    assert.equal((await models.Flight.findByPk(leg.flight.id)).available_seats, released ? 2 : 0);
  }
  assert.equal((await models.Promotion.findByPk(f.promo.id)).used_count, released ? 0 : 1);
}

before(async () => { await verifyConnectedDatabase(); });
afterEach(async () => { await cleanupTrackedFixtures(); });
after(async () => { await cleanupTrackedFixtures(); await models.sequelize.close(); });

for (const method of ['vnpay', 'payos']) {
  for (const state of ['cancelled', 'departed']) {
    test(`PAY02A MySQL ${method}: reject ${state} second leg before initiation`, { timeout: 20000 }, async () => {
      const f = await fixture();
      await f.second.flight.update(state === 'cancelled'
        ? { status: 'cancelled' } : { departure_time: new Date(0) });
      await assert.rejects(initiate(f, method), (error) => error.statusCode === 400);
      assert.equal((await models.Booking.findByPk(f.booking.id)).status, 'holding');
      assert.equal(await models.Payment.count({ where: { booking_id: f.booking.id } }), 0);
      await assertInventory(f);
    });
  }
}

for (const path of ['vnpay', 'payos', 'reconciliation']) {
  for (const state of ['single_valid', 'multi_valid', 'cancelled', 'departed']) {
    test(`PAY02A MySQL ${path}: ${state} at confirmation`, { timeout: 20000 }, async () => {
      const f = await fixture({ multiLeg: state !== 'single_valid' });
      const payment = await initiate(f, path === 'vnpay' ? 'vnpay' : 'payos');
      if (state === 'cancelled') await flightService.cancelFlight(f.second.flight.id);
      if (state === 'departed') await f.second.flight.update({ departure_time: new Date(0) });
      if (path === 'reconciliation') await reconcile(payment, 'PAID');
      else await callback(payment);
      assert.equal((await models.Booking.findByPk(f.booking.id)).status,
        state.endsWith('valid') ? 'confirmed' : 'pending_payment');
      assert.equal((await payment.reload()).status, 'success');
      await assertInventory(f);
    });
  }

  test(`PAY02A MySQL ${path}: second-leg cancellation commits while confirmation waits on its lock`, { timeout: 20000 }, async (t) => {
    const f = await fixture();
    const payment = await initiate(f, path === 'vnpay' ? 'vnpay' : 'payos');
    const locked = deferred(); const release = deferred(); const requested = deferred();
    const original = paymentService.repository.findLockedFlight.bind(paymentService.repository);
    t.mock.method(paymentService.repository, 'findLockedFlight', async (id, transaction) => {
      if (String(id) === String(f.second.flight.id)) requested.resolve();
      return original(id, transaction);
    });
    const cancellation = models.sequelize.transaction(async (transaction) => {
      const flight = await models.Flight.findByPk(f.second.flight.id, { transaction, lock: transaction.LOCK.UPDATE });
      await flight.update({ status: 'cancelled' }, { transaction });
      locked.resolve();
      await release.promise;
    });
    let confirmation;
    try {
      await Promise.race([locked.promise, cancellation]);
      confirmation = path === 'reconciliation' ? reconcile(payment, 'PAID') : callback(payment);
      await Promise.race([requested.promise, confirmation.then(() => {
        assert.fail('confirmation must reach the second-leg row lock');
      })]);
    } finally { release.resolve(); }
    await Promise.all([cancellation, confirmation]);
    assert.equal((await models.Booking.findByPk(f.booking.id)).status, 'pending_payment');
    assert.equal((await payment.reload()).status, 'success');
    await assertInventory(f);
  });
}

for (const method of ['vnpay', 'payos']) {
  for (const status of ['pending', 'success']) {
    test(`PAY02A MySQL ${method}: duplicate failure A preserves ${status} B`, { timeout: 20000 }, async () => {
      const f = await fixture(); const a = await initiate(f, method);
      await callback(a, false);
      const b = await initiate(f, method);
      if (status === 'success') await callback(b);
      else await f.booking.update({ hold_expires_at: new Date(0) });
      await Promise.all([callback(a, false), callback(a, false)]);
      assert.equal((await models.Booking.findByPk(f.booking.id)).status,
        status === 'success' ? 'confirmed' : 'pending_payment');
      assert.equal((await b.reload()).status, status);
      assert.equal((await a.reload()).status, 'failed');
      await assertInventory(f);
    });
  }

  test(`PAY02A MySQL ${method}: failure A races success B without deadlock or resource release`, { timeout: 20000 }, async () => {
    const f = await fixture(); const a = await initiate(f, method);
    await callback(a, false);
    const b = await initiate(f, method);
    await Promise.all([callback(a, false), callback(b), callback(b)]);
    assert.equal((await models.Booking.findByPk(f.booking.id)).status, 'confirmed');
    assert.equal((await a.reload()).status, 'failed'); assert.equal((await b.reload()).status, 'success');
    await assertInventory(f);
  });

  test(`PAY02A MySQL ${method}: duplicate failure A races B expiry, resources released once`, { timeout: 20000 }, async () => {
    const f = await fixture(); const a = await initiate(f, method);
    await callback(a, false);
    const b = await initiate(f, method);
    await f.booking.update({ hold_expires_at: new Date(0) });
    await Promise.all([callback(a, false), callback(b, false), callback(b, false)]);
    assert.equal((await models.Booking.findByPk(f.booking.id)).status, 'expired');
    await assertInventory(f, true);
  });

  test(`PAY02A MySQL ${method}: late success A never confirms B or emails twice`, { timeout: 20000 }, async (t) => {
    const f = await fixture(); const a = await initiate(f, method);
    await callback(a, false);
    const b = await initiate(f, method);
    const email = t.mock.method(paymentService, '_triggerBookingConfirmationEmail', async () => {});
    await Promise.all([callback(a), callback(b)]);
    assert.equal((await models.Booking.findByPk(f.booking.id)).status, 'confirmed');
    assert.equal((await a.reload()).status, 'success'); assert.equal((await b.reload()).status, 'success');
    assert.equal(email.mock.callCount(), 1);
    await assertInventory(f);
  });
}

for (const status of ['PAID', 'CANCELLED']) {
  test(`PAY02A MySQL payOS old pending lookup ${status} does not change latest booking`, { timeout: 20000 }, async () => {
    const f = await fixture(); const a = await initiate(f, 'payos');
    await callback(a, false);
    const b = await initiate(f, 'payos');
    // Simulate an out-of-order pending snapshot left by an older workflow.
    await models.Payment.update({ status: 'pending' }, { where: { id: a.id } });
    await a.reload();
    await f.booking.update({ hold_expires_at: new Date(0) });
    await reconcile(a, status);
    assert.equal((await a.reload()).status, status === 'PAID' ? 'success' : 'failed');
    assert.equal((await models.Booking.findByPk(f.booking.id)).status, 'pending_payment');
    assert.equal((await b.reload()).status, 'pending');
    await assertInventory(f);
  });
}

for (const method of ['vnpay', 'payos']) {
  for (const success of [false, true]) {
    test(`PAY02A MySQL ${method}: older pending ${success ? 'success' : 'failure'} races current success`, { timeout: 20000 }, async (t) => {
      const f = await fixture(); const a = await initiate(f, method);
      await callback(a, false);
      const b = await initiate(f, method);
      await models.Payment.update({ status: 'pending' }, { where: { id: a.id } });
      await a.reload();
      const email = t.mock.method(paymentService, '_triggerBookingConfirmationEmail', async () => {});
      await Promise.all([callback(a, success), callback(b)]);
      assert.equal((await models.Booking.findByPk(f.booking.id)).status, 'confirmed');
      assert.equal((await b.reload()).status, 'success');
      assert.equal(email.mock.callCount(), 1);
      await assertInventory(f);
    });
  }
}
