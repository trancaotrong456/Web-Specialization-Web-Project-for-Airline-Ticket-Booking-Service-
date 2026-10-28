'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const PaymentService = require('../modules/payment/payment.service');

function fixture(gatewayResult) {
  const payment = { id: 9, amount: 100000, payment_method: 'vnpay', status: 'success', transaction_ref: 'TXN_9' };
  const booking = { id: 20, status: 'expired', promotion_id: null };
  const operation = { id: 3, request_id: 'RFD_1', status: 'pending', attempt_count: 0, save: async function () { return this; } };
  const repository = {
    findPaymentByPk: async () => payment,
    findLockedPaymentById: async () => payment,
    findRefundBooking: async () => booking,
    findLockedFlight: async () => null,
    findGatewayOperation: async () => null,
    findRefundGatewayOperation: async () => null,
    createGatewayOperation: async (values) => Object.assign(operation, values),
    findLockedGatewayOperation: async () => operation,
    findLockedPromotion: async () => null,
    save: async (entity) => { Object.assign(entity, entity); return entity; },
  };
  const transactionManager = { transaction: async (fn) => fn({ LOCK: { UPDATE: 'UPDATE' } }) };
  const gateway = { refund: async () => gatewayResult };
  return { payment, operation, repository, transactionManager, gateway };
}

test('VNPay refund marks payment refunded only after verified success', async () => {
  const f = fixture({ status: 'success', response: { vnp_ResponseCode: '00' }, transactionRef: 'TXN_9' });
  const service = new PaymentService({ repository: f.repository, transactionManager: f.transactionManager, vnpayGateway: f.gateway, socket: { emit() {} } });
  const result = await service.refundVnpayPayment(9, 'approved', { id: 1 });
  assert.equal(result.status, 'success');
  assert.equal(f.payment.status, 'refunded');
  assert.equal(f.operation.status, 'success');
});

test('VNPay refund keeps payment successful after unknown gateway outcome', async () => {
  const f = fixture({ status: 'unknown', response: {}, transactionRef: 'TXN_9' });
  const service = new PaymentService({ repository: f.repository, transactionManager: f.transactionManager, vnpayGateway: f.gateway, socket: { emit() {} } });
  const result = await service.refundVnpayPayment(9, 'timeout', { id: 1 });
  assert.equal(result.status, 'unknown');
  assert.equal(f.payment.status, 'success');
  assert.equal(f.operation.status, 'unknown');
});
