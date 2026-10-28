'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const PaymentService = require('../modules/payment/payment.service');
const { SequelizePaymentRepository } = require('../modules/payment/payment.repository');
const { signVnpayParams } = require('../utils/checksum.util');

function fixture({ multiLeg = true } = {}) {
  const booking = {
    id: 7, flight_id: 20, user_id: null, guest_email: 'safety@example.test',
    booking_code: 'SAFETY', total_amount: 100000, promotion_id: 8,
    status: 'holding', hold_expires_at: new Date(Date.now() + 900000), passengers: [{}, {}],
  };
  const flights = new Map([20, 10].map((id) => [id, {
    id, status: 'scheduled', departure_time: new Date(Date.now() + 86400000), available_seats: 0,
  }]));
  const payments = [];
  const locks = [];
  const writes = [];
  const review = [];
  const tx = { LOCK: { UPDATE: 'UPDATE' } };
  let emails = 0;
  const promotion = { used_count: 1 };
  const repository = {
    findLockedBooking: async () => booking,
    findLockedBookingWithPassengers: async () => { locks.push('Booking'); return booking; },
    findBookingSegments: async (_id, transaction) => {
      assert.equal(transaction, tx);
      return multiLeg ? [{ flight_id: 10 }] : [];
    },
    findLockedFlight: async (id, transaction) => {
      assert.equal(transaction, tx); locks.push(id); return flights.get(id);
    },
    createPayment: async (values) => {
      const payment = { id: payments.length + 1, ...values };
      payments.push(payment); return payment;
    },
    findPaymentWithBookingByRef: async (ref, method) => {
      const payment = payments.find((p) => p.transaction_ref === ref && p.payment_method === method);
      return payment ? { ...payment, booking: { ...booking } } : null;
    },
    findPaymentByPk: async (id) => payments.find((p) => p.id === id),
    findLockedPaymentById: async (id) => { locks.push('Payment'); return payments.find((p) => p.id === id); },
    findLatestPaymentAttempt: async (id, transaction) => {
      assert.equal(transaction, tx); assert.equal(id, booking.id);
      assert.ok(locks.includes('Booking'));
      return payments.at(-1);
    },
    save: async (row) => { writes.push(row); },
    findLockedPromotion: async () => promotion,
    decrement: async (row) => { row.used_count--; },
    resolveCase: async () => review.push('resolved'),
    markManualReview: async () => review.push('manual_review'),
  };
  let queue = Promise.resolve();
  const transactionManager = { transaction(run) {
    const work = queue.then(() => run(tx));
    queue = work.catch(() => {});
    return work;
  } };
  const service = new PaymentService({ repository, transactionManager, logger: { log() {}, warn() {} } });
  service._emitSeatUpdates = async () => {};
  service._triggerBookingConfirmationEmail = () => { emails++; };
  // Exercise the real public webhook handler with an injected verifier, no SDK I/O.
  service._getPayOSClient = () => ({ webhooks: { verify: async (body) => body.data } });
  const attempt = (method, status = 'pending') => {
    booking.status = 'pending_payment';
    const payment = { id: payments.length + 1, booking_id: booking.id, amount: 100000,
      payment_method: method, status, transaction_ref: String(1000 + payments.length) };
    payments.push(payment); return payment;
  };
  return { service, repository, booking, flights, payments, locks, writes, review, promotion, attempt,
    get emails() { return emails; } };
}

async function callback(f, method, payment, success = true) {
  if (method === 'payos') {
    return f.service.handlePayosWebhook({ success, code: success ? '00' : '01',
      data: { orderCode: Number(payment.transaction_ref), amount: payment.amount, code: success ? '00' : '01' } });
  }
  const query = {
    vnp_TxnRef: payment.transaction_ref, vnp_TmnCode: process.env.VNP_TMN_CODE,
    vnp_Amount: String(payment.amount * 100), vnp_ResponseCode: success ? '00' : '24',
    vnp_TransactionStatus: success ? '00' : '24',
  };
  query.vnp_SecureHash = signVnpayParams(query, process.env.VNP_HASH_SECRET);
  return f.service.handleVnpayIpn(query);
}

for (const method of ['vnpay', 'payos']) {
  for (const multiLeg of [false, true]) {
    test(`${method}: ${multiLeg ? 'multi' : 'single'}-leg initiation validates every locked flight`, async (t) => {
      const f = fixture({ multiLeg });
      t.mock.method(f.service, '_getPayOSMode', () => 'demo');
      await f.service.initiatePayment({ booking_id: 7, payment_method: method, guest_email: f.booking.guest_email });
      assert.deepEqual(f.locks.filter(Number.isInteger), multiLeg ? [10, 20] : [20]);
      assert.equal(f.booking.status, 'pending_payment');
      assert.equal(f.payments.length, 1);
    });
  }
  for (const invalid of ['cancelled', 'departed', 'missing', 'invalid_date']) {
    test(`${method}: initiation rejects second leg ${invalid} before state/payment writes`, async (t) => {
      const f = fixture();
      t.mock.method(f.service, '_getPayOSMode', () => 'demo');
      if (invalid === 'cancelled') f.flights.get(10).status = 'cancelled';
      if (invalid === 'departed') f.flights.get(10).departure_time = new Date(0);
      if (invalid === 'invalid_date') f.flights.get(10).departure_time = 'invalid';
      if (invalid === 'missing') f.flights.delete(10);
      await assert.rejects(f.service.initiatePayment({ booking_id: 7, payment_method: method,
        guest_email: f.booking.guest_email }), (error) => error.statusCode === 400);
      assert.equal(f.booking.status, 'holding');
      assert.equal(f.payments.length, 0);
      assert.equal(f.writes.length, 0);
      assert.deepEqual(f.locks.filter(Number.isInteger), [10, 20]);
    });
  }
}

for (const path of ['vnpay', 'payos', 'reconciliation']) {
  for (const state of ['single_valid', 'multi_valid', 'cancelled', 'departed']) {
    test(`${path}: confirmation rechecks ${state} itinerary under sorted flight locks`, async () => {
      const f = fixture({ multiLeg: state !== 'single_valid' });
      const method = path === 'vnpay' ? 'vnpay' : 'payos';
      const payment = f.attempt(method);
      // These changes occur after initiation has already created the attempt.
      if (state === 'cancelled') f.flights.get(10).status = 'cancelled';
      if (state === 'departed') f.flights.get(10).departure_time = new Date(0);
      if (path === 'reconciliation') {
        f.service.getPayosPaymentStatus = async () => ({ status: 'PAID', orderCode: payment.transaction_ref, amount: payment.amount });
        await f.service._processPayosReconciliationCase({ id: 9, payment_id: payment.id });
      } else await callback(f, method, payment);
      const valid = state.endsWith('valid');
      assert.equal(f.booking.status, valid ? 'confirmed' : 'pending_payment');
      assert.equal(payment.status, 'success', 'preserve the verified charge even for an invalid itinerary');
      assert.deepEqual(f.locks.filter(Number.isInteger), state === 'single_valid' ? [20] : [10, 20]);
      assert.equal(f.flights.get(20).available_seats, 0);
      assert.equal(f.promotion.used_count, 1);
      if (!valid) assert.equal(f.emails, 0);
      if (path === 'reconciliation') assert.deepEqual(f.review, [valid ? 'resolved' : 'manual_review']);
    });
  }
}

for (const method of ['vnpay', 'payos']) {
  for (const newStatus of ['pending', 'success']) {
    for (const expired of [false, true]) {
      test(`${method}: failed A replay preserves ${newStatus} B, expired hold=${expired}`, async () => {
        const f = fixture(); const old = f.attempt(method, 'failed'); const current = f.attempt(method, newStatus);
        if (newStatus === 'success') f.booking.status = 'confirmed';
        if (expired) f.booking.hold_expires_at = new Date(0);
        const before = f.booking.status;
        await callback(f, method, old, false);
        await callback(f, method, old, false);
        assert.equal(f.booking.status, before); assert.equal(current.status, newStatus);
        assert.equal(old.status, 'failed'); assert.equal(f.promotion.used_count, 1);
        assert.equal(f.flights.get(20).available_seats, 0); assert.equal(f.writes.length, 0);
      });
    }
  }
  test(`${method}: duplicate failure is idempotent and B can still confirm`, async () => {
    const f = fixture(); const old = f.attempt(method);
    await callback(f, method, old, false);
    assert.equal(f.booking.status, 'holding'); assert.equal(old.status, 'failed');
    const current = f.attempt(method);
    await Promise.all([callback(f, method, old, false), callback(f, method, current)]);
    assert.equal(f.booking.status, 'confirmed'); assert.equal(current.status, 'success');
    assert.equal(f.emails, 1); assert.equal(f.promotion.used_count, 1);
  });
  for (const success of [false, true]) {
    test(`${method}: out-of-order pending A ${success ? 'success' : 'failure'} cannot change B booking`, async () => {
      const f = fixture(); const old = f.attempt(method); const current = f.attempt(method);
      f.booking.hold_expires_at = new Date(0);
      await callback(f, method, old, success);
      assert.equal(old.status, success ? 'success' : 'failed');
      assert.equal(current.status, 'pending'); assert.equal(f.booking.status, 'pending_payment');
      assert.equal(f.promotion.used_count, 1); assert.equal(f.flights.get(20).available_seats, 0);
      assert.equal(f.emails, 0);
    });
  }
  test(`${method}: two pending attempts cannot both confirm and duplicate success emails once`, async () => {
    const f = fixture(); const old = f.attempt(method); const current = f.attempt(method);
    await Promise.all([callback(f, method, old), callback(f, method, current)]);
    await callback(f, method, current);
    assert.equal(f.booking.status, 'confirmed'); assert.equal(f.emails, 1);
    assert.equal(current.status, 'success'); assert.equal(f.promotion.used_count, 1);
  });
  test(`${method}: callback rechecks failed/expired state after the initial pending snapshot`, async () => {
    const f = fixture(); const old = f.attempt(method);
    const original = f.repository.findLockedPaymentById;
    f.repository.findLockedPaymentById = async (...args) => {
      old.status = 'failed'; f.booking.status = 'expired'; return original(...args);
    };
    await callback(f, method, old, false);
    assert.equal(f.booking.status, 'expired'); assert.equal(f.writes.length, 0);
    assert.equal(f.flights.get(20).available_seats, 0); assert.equal(f.promotion.used_count, 1);
  });
}

test('payOS cancellation return cannot fail a newer attempt or release its resources', async () => {
  const f = fixture(); const old = f.attempt('payos'); const current = f.attempt('payos');
  f.booking.hold_expires_at = new Date(0);
  await f.service._markPayosPaymentFailed(old.id, f.booking.id);
  assert.equal(f.booking.status, 'pending_payment'); assert.equal(current.status, 'pending');
  assert.equal(f.promotion.used_count, 1); assert.equal(f.flights.get(20).available_seats, 0);
});

for (const status of ['PAID', 'CANCELLED']) {
  test(`payOS reconciliation ${status} for older pending attempt leaves active booking intact`, async () => {
    const f = fixture(); const old = f.attempt('payos'); const current = f.attempt('payos');
    f.booking.hold_expires_at = new Date(0);
    f.service.getPayosPaymentStatus = async () => ({ status, orderCode: old.transaction_ref, amount: old.amount });
    await f.service._processPayosReconciliationCase({ id: 9, payment_id: old.id });
    assert.equal(f.booking.status, 'pending_payment'); assert.equal(current.status, 'pending');
    assert.equal(f.promotion.used_count, 1); assert.equal(f.flights.get(20).available_seats, 0);
  });
}

test('latest-attempt read uses deterministic id order without acquiring sibling Payment locks', async () => {
  let options;
  const repository = new SequelizePaymentRepository({ Payment: { findOne: async (value) => { options = value; } },
    Booking: {}, Flight: {}, BookingPassenger: {}, Promotion: {}, User: {} });
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  await repository.findLatestPaymentAttempt(7, transaction);
  assert.deepEqual(options, { where: { booking_id: 7 }, order: [['id', 'DESC']], transaction });
});

for (const method of ['vnpay', 'payos']) {
  test(`${method}: initiation rechecks hold after waiting for itinerary locks`, async (t) => {
    const now = Date.now();
    t.mock.timers.enable({ apis: ['Date'], now });
    const f = fixture();
    t.mock.method(f.service, '_getPayOSMode', () => 'demo');
    const original = f.repository.findLockedFlight;
    f.repository.findLockedFlight = async (...args) => {
      const flight = await original(...args);
      t.mock.timers.setTime(now + 900001);
      return flight;
    };
    await assert.rejects(f.service.initiatePayment({ booking_id: 7, payment_method: method,
      guest_email: f.booking.guest_email }), /hold duration has expired/);
    assert.equal(f.booking.status, 'holding'); assert.equal(f.payments.length, 0);
  });
}

for (const path of ['vnpay', 'payos', 'reconciliation']) {
  test(`${path}: confirmation rechecks its time window after waiting on flight locks`, async (t) => {
    const now = Date.now();
    t.mock.timers.enable({ apis: ['Date'], now });
    const f = fixture(); const payment = f.attempt(path === 'vnpay' ? 'vnpay' : 'payos');
    const original = f.repository.findLockedFlight;
    f.repository.findLockedFlight = async (...args) => {
      const flight = await original(...args);
      t.mock.timers.setTime(now + 3600000);
      return flight;
    };
    if (path === 'reconciliation') {
      f.service.getPayosPaymentStatus = async () => ({ status: 'PAID', orderCode: payment.transaction_ref, amount: payment.amount });
      await f.service._processPayosReconciliationCase({ id: 9, payment_id: payment.id });
    } else await callback(f, path, payment);
    assert.equal(f.booking.status, 'pending_payment'); assert.equal(payment.status, 'success');
    assert.equal(f.emails, 0);
  });
}
