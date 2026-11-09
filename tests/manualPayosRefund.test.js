const test = require('node:test');
const assert = require('node:assert/strict');
const PaymentService = require('../modules/payment/payment.service');

const tx = { LOCK: { UPDATE: 'UPDATE' } };
const manager = { transaction: async (fn) => fn(tx) };

function makeService({ status = 'success', method = 'payos', request = null } = {}) {
  const payment = { id: 7, booking_id: 9, amount: '2500.00', status, payment_method: method, save: async () => payment };
  const booking = { id: 9, status: 'confirmed', promotion_id: null, flight_id: 1, passengers: [{ id: 1 }], save: async () => booking };
  const audits = [];
  const repository = {
    findLockedPaymentById: async () => payment,
    findManualRefundRequestByPayment: async () => request,
    createManualRefundRequest: async (values) => ({ id: 3, ...values, toJSON() { return this; } }),
    createManualRefundAuditLog: async (values) => { audits.push(values); return values; },
    findLockedManualRefundRequest: async () => request,
    findManualRefundDetail: async () => request,
    findRefundBooking: async () => booking,
    saveManualRefundRequest: async (row) => row,
    save: async (row) => row,
    listManualRefundRequests: async () => ({ rows: [], count: 0 }),
    findLockedFlight: async () => null,
    findLockedPromotion: async () => null,
  };
  return { service: new PaymentService({ repository, transactionManager: manager, socket: { emit() {} } }), payment, booking, audits };
}

const admin = { id: 11, role: { name: 'admin' } };
const staff = { id: 12, role: { name: 'staff' } };

test('manual payOS refund requires admin and snapshots the successful payment amount', async () => {
  const f = makeService();
  await assert.rejects(() => f.service.createManualPayosRefund(7, { reason: 'Bank refund', evidence_reference: 'CASE-1' }, staff), /Admin authorization/);
  const created = await f.service.createManualPayosRefund(7, { reason: 'Bank refund', evidence_reference: 'CASE-1' }, admin);
  assert.equal(created.status, 'pending'); assert.equal(created.amount, '2500.00'); assert.equal(created.provider, 'payos'); assert.equal(f.audits[0].action, 'created');
});

test('manual payOS refund rejects non-success and non-payOS payments', async () => {
  await assert.rejects(() => makeService({ status: 'pending' }).service.createManualPayosRefund(7, { reason: 'Refund' }, admin), /Only successful/);
  await assert.rejects(() => makeService({ method: 'vnpay' }).service.createManualPayosRefund(7, { reason: 'Refund' }, admin), /only supported for payOS/);
});

test('rejected manual refund leaves Payment unchanged and records audit', async () => {
  const request = { id: 3, payment_id: 7, booking_id: 9, status: 'pending', payment: null, toJSON() { return this; } };
  const f = makeService({ request });
  const result = await f.service.rejectManualPayosRefund(3, { reason: 'Evidence invalid' }, admin);
  assert.equal(result.status, 'rejected'); assert.equal(f.payment.status, 'success'); assert.equal(f.booking.status, 'confirmed'); assert.equal(f.audits[0].action, 'rejected');
});

test('settlement requires evidence and changes Payment exactly once', async () => {
  const request = { id: 3, payment_id: 7, booking_id: 9, status: 'pending', toJSON() { return this; } };
  const f = makeService({ request });
  await assert.rejects(() => f.service.settleManualPayosRefund(3, { settlement_reference: 'SET-1' }, admin), /evidence/);
  const result = await f.service.settleManualPayosRefund(3, { evidence_reference: 'BANK-1', settlement_reference: 'SET-1' }, admin);
  assert.equal(result.status, 'settled'); assert.equal(f.payment.status, 'refunded'); assert.equal(f.booking.status, 'cancelled'); assert.equal(f.audits[0].action, 'settled');
});
