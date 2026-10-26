'use strict';

const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const { VnpayGateway } = require('../../modules/payment/vnpay.gateway');
const paymentService = require('../../services/payment.service');
const bookingService = require('../../services/booking.service');
const { signVnpayParams } = require('../../utils/checksum.util');
const { merchantResponseHash } = require('../../modules/payment/vnpay.gateway');
const { models, verifyConnectedDatabase } = require('./helpers/mysqlTestDatabase');
const {
  cleanupTrackedFixtures, createFlightFixture, createPromotionFixture,
  trackBooking, trackPayment,
} = require('./helpers/testFixtures');

process.env.VNPAY_MODE ||= 'sandbox';
process.env.VNP_TMN_CODE ||= 'TEST_TMN';
process.env.CLIENT_URL ||= 'http://localhost:5173';
process.env.VNP_HASH_SECRET ||= 'integration-test-secret';
process.env.VNP_API_URL ||= 'https://sandbox.invalid/merchant_webapi/api/transaction';
paymentService._triggerBookingConfirmationEmail = async () => {};

const adminUser = { id: 1, email: 'integration-admin@example.test' };

function makeGateway({ refundCode = '00', queryCode = '00', failLocalResponse = false } = {}) {
  const calls = [];
  const httpClient = async (_url, options) => {
    const request = JSON.parse(options.body);
    calls.push(request);
    if (failLocalResponse) {
      const error = new Error('simulated gateway timeout');
      error.name = 'AbortError';
      throw error;
    }
    const isRefund = request.vnp_Command === 'refund';
    const code = isRefund ? refundCode : queryCode;
    const response = {
      vnp_ResponseId: `RESP-${request.vnp_RequestId}`,
      vnp_Command: request.vnp_Command,
      vnp_TmnCode: process.env.VNP_TMN_CODE,
      vnp_TxnRef: request.vnp_TxnRef,
      vnp_Amount: request.vnp_Amount || '100000000',
      vnp_Message: code === '00' ? 'Success' : 'Rejected',
      vnp_BankCode: 'NCB',
      vnp_PayDate: '20261021050000',
      vnp_ResponseCode: code,
      vnp_TransactionStatus: code,
      vnp_TransactionNo: isRefund ? 'REFUND-IT' : 'QUERY-IT',
      vnp_TransactionType: isRefund ? '02' : '01',
      vnp_OrderInfo: request.vnp_OrderInfo,
    };
    if (!isRefund) { response.vnp_PromotionCode = ''; response.vnp_PromotionAmount = ''; }
    response.vnp_SecureHash = merchantResponseHash(response, request.vnp_Command, process.env.VNP_HASH_SECRET);
    return { ok: true, status: 200, text: async () => JSON.stringify(response) };
  };
  return { gateway: new VnpayGateway({ httpClient, timeoutMs: 1000 }), calls };
}

async function createPaidPayment(suffix, { promotionCode } = {}) {
  const fixture = await createFlightFixture({ availableSeats: 1, totalSeats: 1 });
  const booking = trackBooking(await bookingService.createHoldingBooking({
    flight_id: fixture.flight.id,
    fare_class_id: fixture.fareClass.id,
    promotion_code: promotionCode,
    passengers: [{ passenger_name: `VNPay ${suffix}`, passport_no: `P-${suffix}` }],
    guest_email: `vnpay-${suffix}-${Date.now()}@example.test`,
  }));
  const initiated = await paymentService.initiatePayment({
    booking_id: booking.id, payment_method: 'vnpay', guest_email: booking.guest_email,
  });
  const payment = trackPayment(await models.Payment.findOne({ where: { transaction_ref: initiated.transaction_ref } }));
  await paymentService.handleVnpayIpn({
    vnp_TxnRef: payment.transaction_ref,
    vnp_TmnCode: process.env.VNP_TMN_CODE,
    vnp_Amount: Math.round(Number(payment.amount) * 100),
    vnp_ResponseCode: '00', vnp_TransactionStatus: '00',
    vnp_SecureHash: signVnpayParams({
      vnp_TxnRef: payment.transaction_ref, vnp_TmnCode: process.env.VNP_TMN_CODE,
      vnp_Amount: Math.round(Number(payment.amount) * 100),
      vnp_ResponseCode: '00', vnp_TransactionStatus: '00',
    }, process.env.VNP_HASH_SECRET),
  });
  return { fixture, booking, payment };
}

function installGateway(gateway) {
  const previous = paymentService.vnpayGateway;
  paymentService.vnpayGateway = gateway;
  return () => { paymentService.vnpayGateway = previous; };
}

before(async () => { await verifyConnectedDatabase(); });
after(async () => { await cleanupTrackedFixtures(); await models.sequelize.close(); });

test('IT-10 verified successful Refund updates Payment and operation', { timeout: 20000 }, async () => {
  const { gateway, calls } = makeGateway(); const restore = installGateway(gateway);
  try {
    const { booking, payment } = await createPaidPayment('IT10');
    const result = await paymentService.refundVnpayPayment(payment.id, 'IT-10', adminUser);
    const operation = await models.PaymentGatewayOperation.findOne({ where: { payment_id: payment.id, operation_type: 'refund' } });
    const storedPayment = await models.Payment.findByPk(payment.id);
    const storedBooking = await models.Booking.findByPk(booking.id);
    assert.equal(result.status, 'success'); assert.equal(calls.length, 1);
    assert.equal(storedPayment.status, 'refunded'); assert.equal(operation.status, 'success');
    assert.equal(operation.attempt_count, 1); assert.equal(storedBooking.status, 'cancelled');
  } finally { restore(); await cleanupTrackedFixtures(); }
});

test('IT-11 rejected Refund preserves successful Payment', { timeout: 20000 }, async () => {
  const { gateway, calls } = makeGateway({ refundCode: '12' }); const restore = installGateway(gateway);
  try {
    const { payment } = await createPaidPayment('IT11');
    const result = await paymentService.refundVnpayPayment(payment.id, 'IT-11', adminUser);
    const operation = await models.PaymentGatewayOperation.findOne({ where: { payment_id: payment.id, operation_type: 'refund' } });
    assert.equal(result.status, 'failed'); assert.equal(calls.length, 1);
    assert.equal((await models.Payment.findByPk(payment.id)).status, 'success'); assert.equal(operation.status, 'failed');
  } finally { restore(); await cleanupTrackedFixtures(); }
});

test('IT-12 timeout records unknown operation and preserves Payment', { timeout: 20000 }, async () => {
  const { gateway, calls } = makeGateway({ failLocalResponse: true }); const restore = installGateway(gateway);
  try {
    const { payment } = await createPaidPayment('IT12');
    await assert.rejects(() => paymentService.refundVnpayPayment(payment.id, 'IT-12', adminUser), /timeout/i);
    const operation = await models.PaymentGatewayOperation.findOne({ where: { payment_id: payment.id, operation_type: 'refund' } });
    assert.equal(calls.length, 1); assert.equal(operation.status, 'unknown');
    assert.equal((await models.Payment.findByPk(payment.id)).status, 'success');
  } finally { restore(); await cleanupTrackedFixtures(); }
});

test('IT-13 concurrent Refund requests make one gateway call', { timeout: 20000 }, async () => {
  const { gateway, calls } = makeGateway(); const restore = installGateway(gateway);
  try {
    const { payment } = await createPaidPayment('IT13');
    const results = await Promise.allSettled([
      paymentService.refundVnpayPayment(payment.id, 'A', adminUser),
      paymentService.refundVnpayPayment(payment.id, 'B', adminUser),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
    assert.equal(calls.length, 1);
    assert.equal((await models.Payment.findByPk(payment.id)).status, 'refunded');
  } finally { restore(); await cleanupTrackedFixtures(); }
});

test('IT-14 QueryDR persists a verified reconciliation result', { timeout: 20000 }, async () => {
  const { gateway, calls } = makeGateway(); const restore = installGateway(gateway);
  try {
    const { payment } = await createPaidPayment('IT14');
    const result = await paymentService.queryVnpayPayment(payment.id);
    const duplicate = await paymentService.queryVnpayPayment(payment.id);
    const operation = await models.PaymentGatewayOperation.findOne({ where: { payment_id: payment.id, operation_type: 'querydr' } });
    assert.equal(result.status, 'success'); assert.equal(calls[0].vnp_Command, 'querydr');
    assert.equal(duplicate.status, 'success'); assert.equal(calls.length, 1);
    assert.equal(operation.status, 'success'); assert.equal(operation.response_json.vnp_ResponseCode, '00');
  } finally { restore(); await cleanupTrackedFixtures(); }
});

test('IT-15 local update failure leaves one unknown operation and retry sends no second Refund', { timeout: 20000 }, async () => {
  const { gateway, calls } = makeGateway(); const restoreGateway = installGateway(gateway);
  const repository = paymentService.repository; const originalSave = repository.save.bind(repository); let injected = false;
  repository.save = async (entity, options) => {
    if (!injected && entity.operation_type === 'refund' && entity.status === 'success') { injected = true; throw new Error('simulated local commit failure'); }
    return originalSave(entity, options);
  };
  try {
    const { payment } = await createPaidPayment('IT15');
    await assert.rejects(() => paymentService.refundVnpayPayment(payment.id, 'IT-15', adminUser), /simulated local commit failure/);
    assert.equal(calls.length, 1);
    await assert.rejects(() => paymentService.refundVnpayPayment(payment.id, 'IT-15 retry', adminUser), /already unknown/);
    assert.equal(calls.length, 1);
    assert.equal((await models.Payment.findByPk(payment.id)).status, 'success');
  } finally { repository.save = originalSave; restoreGateway(); await cleanupTrackedFixtures(); }
});

test('IT-16 repeated operation key is idempotent', { timeout: 20000 }, async () => {
  const { gateway, calls } = makeGateway(); const restore = installGateway(gateway);
  try {
    const { payment } = await createPaidPayment('IT16');
    await paymentService.refundVnpayPayment(payment.id, 'IT-16', adminUser);
    await assert.rejects(() => paymentService.refundVnpayPayment(payment.id, 'IT-16 duplicate', adminUser), /already success/);
    assert.equal(calls.length, 1);
    assert.equal(await models.PaymentGatewayOperation.count({ where: { payment_id: payment.id, operation_type: 'refund' } }), 1);
  } finally { restore(); await cleanupTrackedFixtures(); }
});

test('IT-17 refund releases seat and promotion exactly once', { timeout: 20000 }, async () => {
  const promotion = await createPromotionFixture({ maxUses: 1 });
  const { gateway, calls } = makeGateway(); const restore = installGateway(gateway);
  try {
    const { fixture, booking, payment } = await createPaidPayment('IT17', { promotionCode: promotion.code });
    const before = await models.Flight.findByPk(fixture.flight.id);
    assert.equal(before.available_seats, 0);
    await paymentService.refundVnpayPayment(payment.id, 'IT-17', adminUser);
    const after = await models.Flight.findByPk(fixture.flight.id);
    const storedPromotion = await models.Promotion.findByPk(promotion.id);
    assert.equal(calls.length, 1); assert.equal(after.available_seats, 1); assert.equal(storedPromotion.used_count, 0);
    assert.equal((await models.Booking.findByPk(booking.id)).status, 'cancelled');
  } finally { restore(); await cleanupTrackedFixtures(); }
});

test('IT-18 WebSocket emission failure after commit does not change successful refund', { timeout: 20000 }, async () => {
  const { gateway, calls } = makeGateway(); const restoreGateway = installGateway(gateway);
  const originalEmit = paymentService._emitSeatUpdates;
  try {
    const { payment } = await createPaidPayment('IT18');
    paymentService._emitSeatUpdates = async () => { throw new Error('simulated WebSocket failure'); };
    const result = await paymentService.refundVnpayPayment(payment.id, 'IT-18', adminUser);
    const operation = await models.PaymentGatewayOperation.findOne({ where: { payment_id: payment.id, operation_type: 'refund' } });
    assert.equal(result.status, 'success');
    assert.equal(calls.length, 1);
    assert.equal((await models.Payment.findByPk(payment.id)).status, 'refunded');
    assert.equal(operation.status, 'success');
  } finally {
    paymentService._emitSeatUpdates = originalEmit;
    restoreGateway();
    await cleanupTrackedFixtures();
  }
});

test('IT-19 payOS refund is rejected without changing payment, booking, seats or promotion', { timeout: 20000 }, async () => {
  const promotion = await createPromotionFixture({ maxUses: 1 });
  const { fixture, booking, payment } = await createPaidPayment('IT19', { promotionCode: promotion.code });
  const storedPayment = await models.Payment.findByPk(payment.id);
  storedPayment.payment_method = 'payos';
  await storedPayment.save();

  const beforeFlight = await models.Flight.findByPk(fixture.flight.id);
  const beforePromotion = await models.Promotion.findByPk(promotion.id);
  const beforeBooking = await models.Booking.findByPk(booking.id);

  await assert.rejects(
    () => paymentService.processRefund(booking.id, 'IT-19 payOS refund', adminUser),
    (error) => error.statusCode === 409 && /manual refund reconciliation/i.test(error.message),
  );

  const afterPayment = await models.Payment.findByPk(payment.id);
  const afterBooking = await models.Booking.findByPk(booking.id);
  const afterFlight = await models.Flight.findByPk(fixture.flight.id);
  const afterPromotion = await models.Promotion.findByPk(promotion.id);
  assert.equal(afterPayment.status, 'success');
  assert.equal(afterBooking.status, beforeBooking.status);
  assert.equal(afterFlight.available_seats, beforeFlight.available_seats);
  assert.equal(afterPromotion.used_count, beforePromotion.used_count);
});
