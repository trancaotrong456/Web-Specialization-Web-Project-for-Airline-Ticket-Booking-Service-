'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const PaymentService = require('../modules/payment/payment.service');
const { signVnpayParams } = require('../utils/checksum.util');

const originalEnv = { ...process.env };
const secret = 'return-test-secret';

function makeQuery(overrides = {}) {
  const params = {
    vnp_TmnCode: 'RETURN_TEST_TMN',
    vnp_TxnRef: 'TXN-RETURN-1',
    vnp_Amount: '18000000',
    vnp_ResponseCode: '00',
    vnp_TransactionStatus: '00',
    vnp_OrderInfo: 'Thanh toan ve may bay BKRETURN',
    ...overrides,
  };
  return { ...params, vnp_SecureHash: signVnpayParams(params, secret) };
}

function makeService() {
  const booking = { id: 101273, booking_code: 'BKRETURN', status: 'confirmed' };
  const payment = { id: 7, amount: 180000, booking };
  return {
    booking,
    service: new PaymentService({
      repository: { findPaymentWithBookingByRef: async () => payment },
      transactionManager: { transaction: async (callback) => callback({}) },
    }),
  };
}

test.beforeEach(() => {
  process.env.NODE_ENV = 'test';
  process.env.VNPAY_MODE = 'sandbox';
  process.env.VNP_TMN_CODE = 'RETURN_TEST_TMN';
  process.env.VNP_HASH_SECRET = secret;
});

test.after(() => {
  process.env = { ...originalEnv };
});

test('VNPay Return with only signed vnp_* fields is valid', async () => {
  const { service } = makeService();
  const result = await service.handleVnpayReturn(makeQuery());
  assert.equal(result.isValidChecksum, true);
  assert.equal(result.isSuccess, true);
});

test('VNPay Return remains valid when frontend adds booking_id context', async () => {
  const { service } = makeService();
  const result = await service.handleVnpayReturn({ ...makeQuery(), booking_id: '101273' });
  assert.equal(result.isValidChecksum, true);
  assert.equal(result.isSuccess, true);
});

test('VNPay Return rejects a changed amount', async () => {
  const { service } = makeService();
  const result = await service.handleVnpayReturn({ ...makeQuery({ vnp_Amount: '19000000' }), booking_id: '101273' });
  assert.equal(result.isValidChecksum, true);
  assert.equal(result.isValidAmount, false);
  assert.equal(result.isSuccess, false);
});

test('VNPay Return rejects a changed transaction reference', async () => {
  const { service } = makeService();
  const result = await service.handleVnpayReturn({ ...makeQuery(), vnp_TxnRef: 'TXN-TAMPERED', booking_id: '101273' });
  assert.equal(result.isValidChecksum, false);
  assert.equal(result.isSuccess, false);
});

test('VNPay Return does not update Payment or Booking state', async () => {
  const { service, booking } = makeService();
  const before = JSON.stringify(booking);
  await service.handleVnpayReturn({ ...makeQuery(), booking_id: '101273' });
  assert.equal(JSON.stringify(booking), before);
});
