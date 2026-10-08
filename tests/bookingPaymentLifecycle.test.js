const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const models = require('../models');
const bookingService = require('../services/booking.service');
const paymentService = require('../services/payment.service');
const { signVnpayParams } = require('../utils/checksum.util');

// In-memory model boundary: exercise actual services without touching seeded data.
function fixture(t, overrides = {}) {
  const tx = { LOCK: { UPDATE: 'UPDATE' } };
  const writes = [];
  const row = (values) => ({ ...values, async save(options) {
    assert.equal(options.transaction, tx);
    writes.push(this);
  } });
  const booking = row({ id: 1, booking_code: 'BKTEST', user_id: null,
    guest_email: 'guest@example.com', flight_id: 2, promotion_id: 3,
    total_amount: 180000, status: 'holding', hold_expires_at: new Date(Date.now() + 900000),
    passengers: [{ passenger_name: 'An', passport_no: 'P1' }, { passenger_name: 'Binh' }], ...overrides });
  const flight = row({ id: 2, available_seats: 8, status: 'scheduled', departure_time: new Date(Date.now() + 86400000) });
  const promo = { id: 3, used_count: 1, max_uses: 10, discount_type: 'percent', discount_value: 10,
    valid_from: new Date(Date.now() - 86400000), valid_to: new Date(Date.now() + 86400000),
    async increment(_, options) { assert.equal(options.transaction, tx); this.used_count++; },
    async decrement(_, options) { assert.equal(options.transaction, tx); this.used_count--; } };
  const payment = row({ id: 4, booking_id: 1, amount: 180000, status: 'pending', payment_method: 'vnpay', booking });
  t.mock.method(models.sequelize, 'transaction', async (run) => run(tx));
  t.mock.method(models.Booking, 'findOne', async ({ where }) => {
    if (where.booking_code) return null;
    if (where.status && where.status !== booking.status) return null;
    return booking;
  });
  t.mock.method(models.Booking, 'findByPk', async () => booking);
  t.mock.method(models.Booking, 'findAll', async () => [booking]);
  t.mock.method(models.Flight, 'findOne', async (options) => {
    assert.equal(options.transaction, tx); assert.equal(options.lock, 'UPDATE'); return flight;
  });
  t.mock.method(models.FareClass, 'findOne', async () => ({ price: 100000 }));
  t.mock.method(models.Promotion, 'findOne', async () => promo);
  t.mock.method(models.Payment, 'findOne', async () => payment);
  t.mock.method(models.Payment, 'create', async (values, options) => {
    assert.equal(options.transaction, tx); Object.assign(payment, values); return payment;
  });
  t.mock.method(bookingService, '_emitSocketSeatUpdate', async () => {});
  t.mock.method(paymentService, '_emitSocketSeatUpdate', async () => {});
  const email = t.mock.method(paymentService, '_triggerBookingConfirmationEmail', async () => {});
  return { booking, flight, promo, payment, tx, writes, email };
}
const denied = (code) => (error) => error.statusCode === code;
function ipn(amount = 180000, response = '00') {
  const query = { vnp_TxnRef: 'TXN_TEST', vnp_Amount: String(amount * 100), vnp_ResponseCode: response };
  query.vnp_SecureHash = signVnpayParams(query, process.env.VNP_HASH_SECRET || 'SECRETKEYVNPAY2026DEMO');
  return query;
}

test('#30/#41 creation reserves seats, promo and passengers in one transaction for 15 minutes', async (t) => {
  const f = fixture(t);
  t.mock.method(models.Booking, 'create', async (values, options) => {
    assert.equal(options.transaction, f.tx); Object.assign(f.booking, values); return f.booking;
  });
  let passengers;
  t.mock.method(models.BookingPassenger, 'bulkCreate', async (values, options) => {
    assert.equal(options.transaction, f.tx); passengers = values;
  });
  const before = Date.now();
  const old = process.env.HOLDING_TIME_MINUTES;
  delete process.env.HOLDING_TIME_MINUTES;
  try {
    await bookingService.createHoldingBooking({ flight_id: 2, fare_class_id: 1, promotion_code: 'SALE',
      guest_email: 'guest@example.com', passengers: f.booking.passengers });
    assert.equal(f.flight.available_seats, 6);
    assert.equal(f.promo.used_count, 2);
    assert.equal(f.booking.total_amount, 180000);
    assert.equal(passengers[0].passport_no, 'P1');
    assert.equal(passengers.length, 2);
    assert.ok(f.booking.hold_expires_at - before >= 900000);
    assert.ok(f.booking.hold_expires_at - before < 901000);
  } finally { if (old === undefined) delete process.env.HOLDING_TIME_MINUTES; else process.env.HOLDING_TIME_MINUTES = old; }
});

for (const kind of ['expired', 'exhausted', 'missing', 'future']) {
  test(`#41 rejects ${kind} promotion before reserving seats`, async (t) => {
    const f = fixture(t);
    if (kind === 'expired') f.promo.valid_to = new Date(0);
    if (kind === 'future') f.promo.valid_from = new Date(Date.now() + 86400000);
    if (kind === 'exhausted') f.promo.used_count = 10;
    if (kind === 'missing') t.mock.method(models.Promotion, 'findOne', async () => null);
    await assert.rejects(bookingService.createHoldingBooking({ flight_id: 2, fare_class_id: 1,
      promotion_code: 'SALE', guest_email: 'guest@example.com', passengers: f.booking.passengers }), denied(kind === 'missing' ? 404 : 400));
    assert.equal(f.flight.available_seats, 8); assert.equal(f.writes.length, 0);
  });
}

test('#30 cancellation releases seats/promo once and enforces ownership', async (t) => {
  const f = fixture(t, { user_id: 7 });
  await assert.rejects(bookingService.cancelHoldingBooking(1, { id: 8 }), denied(403));
  assert.equal(f.writes.length, 0);
  await bookingService.cancelHoldingBooking(1, { id: 7 });
  assert.equal(f.booking.status, 'cancelled'); assert.equal(f.flight.available_seats, 10); assert.equal(f.promo.used_count, 0);
  await assert.rejects(bookingService.cancelHoldingBooking(1, { id: 7 }), denied(400));
  assert.equal(f.flight.available_seats, 10);
});

test('#32/#40 details and PNR enforce owner/admin and guest email; preserve passenger data', async (t) => {
  const f = fixture(t);
  t.mock.method(models.Booking, 'findOne', async () => f.booking);
  assert.equal((await bookingService.getBookingById(1, null, ' GUEST@example.com ')).passengers[0].passport_no, 'P1');
  await assert.rejects(bookingService.getBookingById(1, null, 'wrong@example.com'), denied(403));
  assert.equal(await bookingService.getBookingByCode('BKTEST', 'guest@example.com'), f.booking);
  await assert.rejects(bookingService.getBookingByCode('BKTEST', 'wrong@example.com'), denied(403));
  f.booking.user_id = 7;
  await assert.rejects(bookingService.getBookingByCode('BKTEST', 'guest@example.com'), denied(403));
  await assert.rejects(bookingService.getBookingById(1, { id: 8 }), denied(403));
  assert.equal(await bookingService.getBookingById(1, { id: 7 }), f.booking);
  assert.equal(await bookingService.getBookingById(1, { id: 8, role: { name: 'admin' } }), f.booking);
  t.mock.method(models.Booking, 'findOne', async () => null);
  await assert.rejects(bookingService.getBookingByCode('MISSING', 'guest@example.com'), denied(404));
});

for (const admin of [false, true]) {
  test(`#31 ${admin ? 'admin/staff' : 'customer'} list paginates distinct bookings and filters status`, async (t) => {
    let query;
    t.mock.method(models.Booking, 'findAndCountAll', async (options) => { query = options; return { count: 3, rows: [{ id: 1 }] }; });
    const result = admin ? await bookingService.getAllBookings({ page: 2, limit: 2, status: 'confirmed' })
      : await bookingService.getUserBookings(7, { page: 2, limit: 2, status: 'confirmed' });
    assert.equal(query.distinct, true); assert.equal(query.offset, 2); assert.equal(query.limit, 2);
    assert.equal(query.where.status, 'confirmed'); if (!admin) assert.equal(query.where.user_id, 7);
    assert.equal(result.total, 3);
  });
}

test('#33/#38 initiation creates pending payment and signed VNPay sandbox URL without emailing', async (t) => {
  const f = fixture(t);
  const result = await paymentService.initiatePayment({ booking_id: 1, payment_method: 'vnpay', guest_email: 'guest@example.com' });
  assert.equal(f.booking.status, 'pending_payment'); assert.equal(f.payment.status, 'pending');
  assert.equal(f.payment.amount, 180000); assert.equal(f.email.mock.callCount(), 0);
  const url = new URL(result.payment_url);
  assert.equal(url.searchParams.get('vnp_Amount'), '18000000'); assert.ok(url.searchParams.get('vnp_SecureHash'));
  await assert.rejects(paymentService.initiatePayment({ booking_id: 1, payment_method: 'vnpay', guest_email: 'guest@example.com' }), denied(400));
});

for (const gateway of ['vnpay', 'payos']) {
  for (const outcome of ['success', 'failed-valid', 'failed-expired']) {
    test(`#33/#36/#39 ${gateway} ${outcome} callback updates states and releases resources correctly`, async (t) => {
      const f = fixture(t, { status: 'pending_payment', hold_expires_at: new Date(Date.now() + (outcome === 'failed-expired' ? -60000 : 60000)) });
      const run = () => gateway === 'vnpay' ? paymentService.handleVnpayIpn(ipn(180000, outcome === 'success' ? '00' : '24'))
        : paymentService._processVerifiedPayosWebhook({ orderCode: 123, amount: 180000, isSuccess: outcome === 'success' });
      await run();
      assert.equal(f.payment.status, outcome === 'success' ? 'success' : 'failed');
      assert.equal(f.booking.status, outcome === 'success' ? 'confirmed' : outcome === 'failed-valid' ? 'holding' : 'expired');
      assert.equal(f.flight.available_seats, outcome === 'failed-expired' ? 10 : 8);
      assert.equal(f.promo.used_count, outcome === 'failed-expired' ? 0 : 1);
      assert.equal(f.email.mock.callCount(), outcome === 'success' ? 1 : 0);
      await run(); assert.equal(f.flight.available_seats, outcome === 'failed-expired' ? 10 : 8);
      assert.equal(f.email.mock.callCount(), outcome === 'success' ? 1 : 0);
    });
  }
}

test('#39 invalid signature and amount never update state', async (t) => {
  const f = fixture(t, { status: 'pending_payment' });
  assert.equal((await paymentService.handleVnpayIpn({ ...ipn(), vnp_SecureHash: 'bad' })).RspCode, '97');
  assert.equal((await paymentService.handleVnpayIpn(ipn(100))).RspCode, '04');
  await assert.rejects(paymentService._processVerifiedPayosWebhook({ orderCode: 123, amount: 100, isSuccess: true }), denied(400));
  t.mock.method(paymentService, '_getPayOSClient', () => ({ webhooks: { verify: async () => { throw new Error('bad signature'); } } }));
  await assert.rejects(paymentService.handlePayosWebhook({}), denied(400));
  assert.equal(f.writes.length, 0);
});

test('#35 expiry only selects holding and releases seats/promotion once', async (t) => {
  const f = fixture(t, { hold_expires_at: new Date(0) });
  t.mock.method(models.Booking, 'findAll', async (options) => { assert.equal(options.where.status, 'holding'); return [f.booking]; });
  assert.equal((await bookingService.expireHoldingBookings()).expiredCount, 1);
  assert.equal(f.booking.status, 'expired'); assert.equal(f.flight.available_seats, 10); assert.equal(f.promo.used_count, 0);
  assert.equal((await bookingService.expireHoldingBookings()).expiredCount, 0);
});

test('#35 stale pending reconciliation fails payment and releases resources once', async (t) => {
  const f = fixture(t, { status: 'pending_payment', hold_expires_at: new Date(0) });
  assert.equal((await bookingService.reconcileStalePendingPayments()).reconciledCount, 1);
  assert.equal(f.payment.status, 'failed'); assert.equal(f.booking.status, 'expired');
  assert.equal(f.flight.available_seats, 10); assert.equal(f.promo.used_count, 0);
  assert.equal((await bookingService.reconcileStalePendingPayments()).reconciledCount, 0);
});

test('#33 refund cancels confirmed booking, refunds payment and releases seats once', async (t) => {
  const f = fixture(t, { status: 'confirmed' }); f.payment.status = 'success';
  const result = await paymentService.processRefund(1, 'test', { email: 'admin@example.com' });
  assert.equal(result.refundedAmount, 180000); assert.equal(f.payment.status, 'refunded');
  assert.equal(f.booking.status, 'cancelled'); assert.equal(f.flight.available_seats, 10);
  await assert.rejects(paymentService.processRefund(1, 'test', { email: 'admin@example.com' }), denied(400));
  assert.equal(f.flight.available_seats, 10);
});

for (const group_by of ['day', 'month']) {
  test(`#37 revenue ${group_by} includes only successful payments in inclusive calendar range`, async (t) => {
    let query;
    t.mock.method(models.Payment, 'findAll', async (options) => { query = options; return [{ [group_by === 'day' ? 'date' : 'month']: '2026-10', revenue: '180000' }]; });
    t.mock.method(models.Payment, 'sum', async (_, options) => { assert.equal(options.where, query.where); return '180000'; });
    const result = await paymentService.getRevenue({ from_date: '2026-10-01', to_date: '2026-10-31', group_by });
    assert.equal(query.where.status, 'success');
    assert.match(query.where[Op.and][1].val, /2026-11-01 00:00:00/);
    assert.equal(result.total_revenue, 180000); assert.equal(result.data[0].revenue, 180000);
    await assert.rejects(paymentService.getRevenue({ from_date: '2026-11-01', to_date: '2026-10-01', group_by }), denied(400));
  });
}

test('#34 payment list filters/paginates and detail preserves transaction data', async (t) => {
  let query;
  t.mock.method(models.Payment, 'findAndCountAll', async (options) => { query = options; return { count: 4, rows: [{ transaction_ref: 'TXN' }] }; });
  const result = await paymentService.getAllPayments({ page: 2, limit: 2, status: 'success', payment_method: 'vnpay' });
  assert.equal(query.offset, 2); assert.deepEqual(query.where, { status: 'success', payment_method: 'vnpay' }); assert.equal(result.total, 4);
  t.mock.method(models.Payment, 'findByPk', async () => ({ transaction_ref: 'TXN', amount: 180000 }));
  assert.equal((await paymentService.getPaymentById(4)).transaction_ref, 'TXN');
  t.mock.method(models.Payment, 'findByPk', async () => null);
  await assert.rejects(paymentService.getPaymentById(404), denied(404));
});

test('#38 payOS demo creates QR and signed callback that confirms booking', async (t) => {
  const f = fixture(t);
  const previous = { PAYOS_MODE: process.env.PAYOS_MODE, NODE_ENV: process.env.NODE_ENV };
  process.env.PAYOS_MODE = 'demo'; process.env.NODE_ENV = 'test';
  try {
    const result = await paymentService.initiatePayment({ booking_id: 1, payment_method: 'payos', guest_email: 'guest@example.com' });
    assert.match(result.qr_code, /^data:image\/png;base64,/);
    assert.equal(JSON.parse(result.qr_payload).amount, 180000);
    assert.equal(f.booking.status, 'pending_payment');
    await assert.rejects(paymentService.handlePayosDemoWebhook({ ...result.demo_webhook.body, signature: 'bad' }), denied(400));
    await paymentService.handlePayosDemoWebhook(result.demo_webhook.body);
    assert.equal(f.payment.status, 'success'); assert.equal(f.booking.status, 'confirmed');
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});

test('#35 cron reconciles pending only when feature flag is true', async (t) => {
  const cron = require('node-cron');
  const { initExpireBookingsJob } = require('../jobs/expireBookings.job');
  let callback;
  t.mock.method(cron, 'schedule', (expression, run) => { assert.equal(expression, '* * * * *'); callback = run; });
  const expire = t.mock.method(bookingService, 'expireHoldingBookings', async () => ({ expiredCount: 0 }));
  const reconcile = t.mock.method(bookingService, 'reconcileStalePendingPayments', async () => ({ reconciledCount: 0 }));
  const old = process.env.ENABLE_PENDING_RECONCILIATION;
  try {
    process.env.ENABLE_PENDING_RECONCILIATION = 'false'; initExpireBookingsJob(); await callback();
    assert.equal(reconcile.mock.callCount(), 0);
    process.env.ENABLE_PENDING_RECONCILIATION = 'true'; await callback();
    assert.equal(reconcile.mock.callCount(), 1); assert.equal(expire.mock.callCount(), 2);
  } finally { if (old === undefined) delete process.env.ENABLE_PENDING_RECONCILIATION; else process.env.ENABLE_PENDING_RECONCILIATION = old; }
});

test('#36 email delivery failure is caught after payment confirmation', async (t) => {
  const emailService = require('../services/email.service');
  t.mock.method(emailService, 'sendBookingConfirmation', async () => { throw new Error('delivery unavailable'); });
  const log = t.mock.method(console, 'error', () => {});
  await paymentService._triggerBookingConfirmationEmail(1);
  assert.equal(log.mock.callCount(), 1);
});

for (const unavailable of ['seats', 'departed', 'cancelled-flight', 'wrong-fare']) {
  test(`#30 rejects ${unavailable} before any writes`, async (t) => {
    const f = fixture(t);
    if (unavailable === 'seats') f.flight.available_seats = 1;
    if (unavailable === 'departed') f.flight.departure_time = new Date(0);
    if (unavailable === 'cancelled-flight') f.flight.status = 'cancelled';
    if (unavailable === 'wrong-fare') t.mock.method(models.FareClass, 'findOne', async () => null);
    await assert.rejects(bookingService.createHoldingBooking({ flight_id: 2, fare_class_id: 1,
      guest_email: 'guest@example.com', passengers: f.booking.passengers }), denied(unavailable === 'wrong-fare' ? 404 : 400));
    assert.equal(f.writes.length, 0);
  });
}

test('#33 gateway link creation failure restores holding without returning reserved seats', async (t) => {
  const f = fixture(t, { status: 'pending_payment' });
  f.payment.destroy = async () => {};
  const destroy = t.mock.method(f.payment, 'destroy', async (options) => { assert.equal(options.transaction, f.tx); });
  await paymentService._restoreHoldingAfterGatewayFailure(1, 'TXN_TEST');
  assert.equal(f.booking.status, 'holding'); assert.equal(destroy.mock.callCount(), 1);
  assert.equal(f.flight.available_seats, 8); assert.equal(f.promo.used_count, 1);
});

test('#39 callback rechecks state under lock when another callback already confirmed payment', async (t) => {
  const f = fixture(t, { status: 'pending_payment' });
  const snapshot = { ...f.payment, booking: { ...f.booking } };
  t.mock.method(models.Payment, 'findOne', async (options) => {
    if (!options.transaction) return snapshot;
    f.payment.status = 'success'; f.booking.status = 'confirmed'; return f.payment;
  });
  assert.equal((await paymentService.handleVnpayIpn(ipn())).RspCode, '02');
  assert.equal(f.email.mock.callCount(), 0); assert.equal(f.writes.length, 0);
});

test('#41 fixed discount cannot produce a negative booking total', async (t) => {
  const f = fixture(t); f.promo.discount_type = 'amount'; f.promo.discount_value = 300000;
  t.mock.method(models.Booking, 'create', async (values) => { Object.assign(f.booking, values); return f.booking; });
  t.mock.method(models.BookingPassenger, 'bulkCreate', async () => {});
  await bookingService.createHoldingBooking({ flight_id: 2, fare_class_id: 1, promotion_code: 'SALE',
    guest_email: 'guest@example.com', passengers: f.booking.passengers });
  assert.equal(f.booking.total_amount, 0);
});
