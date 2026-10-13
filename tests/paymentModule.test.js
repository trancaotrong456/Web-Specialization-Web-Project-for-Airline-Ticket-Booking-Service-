const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const { signVnpayParams } = require('../utils/checksum.util');

test('Payment module has an injected controller, service, repository and one router', () => {
  const { createPaymentModule } = require('../modules/payment');
  const repository = { findPayment: async () => null };
  const module = createPaymentModule({ repository, transactionManager: { transaction: async () => {} } });
  assert.equal(module.repository, repository);
  assert.equal(module.service.repository, repository);
  assert.equal(module.controller.service, module.service);
  assert.equal(typeof module.router, 'function');
});

test('legacy Payment imports resolve the canonical module graph', () => {
  const { getDefaultPaymentModule } = require('../modules/payment');
  const module = getDefaultPaymentModule();
  assert.equal(require('../services/payment.service'), module.service);
  assert.equal(require('../controllers/payment.controller'), module.controller);
  assert.equal(require('../routes/payment.route'), module.router);
  const routes = module.router.stack.filter((layer) => layer.route).map((layer) => [layer.route.stack[0].method, layer.route.path]);
  assert.deepEqual(routes, [
    ['get', '/'], ['post', '/initiate'], ['get', '/vnpay/return'], ['get', '/vnpay/ipn'],
    ['get', '/payos/return'], ['post', '/payos/webhook'], ['post', '/payos/demo-webhook'],
    ['get', '/revenue'], ['get', '/:id'], ['post', '/bookings/:id/refund'],
  ]);
  const ipn = module.router.stack.find((layer) => layer.route?.path === '/vnpay/ipn');
  assert.equal(ipn.route.stack.at(-1).handle, module.controller.vnpayIpn);
});

test('Payment repository preserves webhook Payment then Booking lock order and transaction identity', async () => {
  const { SequelizePaymentRepository } = require('../modules/payment/payment.repository');
  const calls = [];
  const Payment = { findOne: async (options) => { calls.push(['payment', options]); return null; } };
  const Booking = { findOne: async (options) => { calls.push(['booking', options]); return null; } };
  const repository = new SequelizePaymentRepository({ Payment, Booking, Flight: {}, BookingPassenger: {}, Promotion: {}, User: {} });
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  await repository.findLockedPaymentById(4, transaction);
  await repository.findLockedBookingWithPassengers(7, transaction);
  assert.deepEqual(calls.map(([name]) => name), ['payment', 'booking']);
  assert.equal(calls[0][1].lock, 'UPDATE');
  assert.equal(calls[1][1].lock, 'UPDATE');
  assert.equal(calls[0][1].transaction, transaction);
  assert.equal(calls[1][1].transaction, transaction);
  assert.equal(calls[1][1].include[0].as, 'passengers');
});

test('Payment repository keeps refund locks and successful-payment filter', async () => {
  const { SequelizePaymentRepository } = require('../modules/payment/payment.repository');
  const calls = [];
  const Payment = { findOne: async (options) => { calls.push(['payment', options]); return null; } };
  const Booking = { findOne: async (options) => { calls.push(['booking', options]); return null; } };
  const repository = new SequelizePaymentRepository({ Payment, Booking, Flight: {}, BookingPassenger: {}, Promotion: {}, User: {} });
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  await repository.findRefundBooking(2, transaction);
  await repository.findSuccessfulPaymentForRefund(2, transaction);
  assert.deepEqual(calls.map(([name]) => name), ['booking', 'payment']);
  assert.deepEqual(calls[0][1].include.map((item) => item.as), ['passengers', 'payments']);
  assert.deepEqual(calls[1][1].where, { booking_id: 2, status: 'success' });
  assert.equal(calls[0][1].transaction, transaction);
  assert.equal(calls[1][1].transaction, transaction);
});

test('Payment revenue repository aggregates successful payments over half-open date range', async () => {
  const { SequelizePaymentRepository } = require('../modules/payment/payment.repository');
  const calls = [];
  const Payment = {
    findAll: async (options) => { calls.push(options); return [{ date: '2026-10-15', revenue: '120' }]; },
    sum: async (field, options) => { calls.push({ field, ...options }); return 120; },
  };
  const sequelize = { literal: (value) => value, fn: (...parts) => parts, col: (value) => value };
  const repository = new SequelizePaymentRepository({ Payment, Booking: {}, Flight: {}, BookingPassenger: {}, Promotion: {}, User: {} });
  const result = await repository.aggregateRevenue({ startDate: '2026-10-15 00:00:00', endDate: '2026-10-16 00:00:00', groupBy: 'day', sequelize });
  assert.deepEqual(result, { rows: [{ date: '2026-10-15', revenue: '120' }], totalRevenue: 120 });
  assert.equal(calls[0].where.status, 'success');
  assert.deepEqual(calls[0].where[Op.and], ["paid_at >= '2026-10-15 00:00:00'", "paid_at < '2026-10-16 00:00:00'"]);
  assert.equal(calls[1].field, 'amount');
  assert.equal(calls[1].where, calls[0].where);
});

for (const gateway of ['vnpay', 'payos']) {
test(`two concurrent ${gateway} callbacks recheck locked state and trigger one confirmation email`, async () => {
  const PaymentService = require('../modules/payment/payment.service');
  const tx = { LOCK: { UPDATE: 'UPDATE' } };
  const booking = { id: 7, status: 'pending_payment' };
  const payment = { id: 4, booking_id: 7, amount: 120000, status: 'pending' };
  const lockOrder = [];
  let reads = 0;
  let releaseReads;
  const bothRead = new Promise((resolve) => { releaseReads = resolve; });
  const repository = {
    async findPaymentWithBookingByRef() {
      reads++;
      if (reads === 2) releaseReads();
      await bothRead;
      return { ...payment, status: 'pending', booking: { ...booking, status: 'pending_payment' } };
    },
    async findLockedPaymentById(id, transaction) {
      assert.equal(id, 4); assert.equal(transaction, tx); lockOrder.push('Payment'); return payment;
    },
    async findLockedBookingWithPassengers(id, transaction) {
      assert.equal(id, 7); assert.equal(transaction, tx); lockOrder.push('Booking'); return booking;
    },
    async save(row, options) { assert.equal(options.transaction, tx); return row; },
  };
  let queue = Promise.resolve();
  const transactionManager = { transaction(run) {
    const result = queue.then(() => run(tx));
    queue = result.catch(() => {});
    return result;
  } };
  const service = new PaymentService({ repository, transactionManager });
  let emails = 0;
  service._triggerBookingConfirmationEmail = () => { emails++; };
  const query = { vnp_TxnRef: 'TXN4', vnp_Amount: '12000000', vnp_ResponseCode: '00' };
  query.vnp_SecureHash = signVnpayParams(query, process.env.VNP_HASH_SECRET || 'SECRETKEYVNPAY2026DEMO');
  const invoke = gateway === 'vnpay'
    ? () => service.handleVnpayIpn(query)
    : () => service._processVerifiedPayosWebhook({ orderCode: 'TXN4', amount: 120000, isSuccess: true });
  const results = await Promise.all([invoke(), invoke()]);
  if (gateway === 'vnpay') {
    assert.deepEqual(results.map((result) => result.RspCode).sort(), ['00', '02']);
  } else {
    // Both entered with pending snapshots; the second exits under the row
    // locks without side effects, while preserving the legacy acknowledgment.
    assert.deepEqual(results.map((result) => result.message), ['Processed successfully', 'Processed successfully']);
  }
  assert.deepEqual(lockOrder, ['Payment', 'Booking', 'Payment', 'Booking']);
  assert.equal(emails, 1);
  assert.equal(payment.status, 'success');
  assert.equal(booking.status, 'confirmed');
});
}
