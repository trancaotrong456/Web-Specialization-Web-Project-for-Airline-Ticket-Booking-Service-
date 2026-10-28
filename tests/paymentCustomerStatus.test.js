const assert = require('node:assert/strict');
const test = require('node:test');
const PaymentService = require('../modules/payment/payment.service');

const makeService = (booking) => new PaymentService({
  repository: { findCustomerPaymentStatus: async () => booking },
  transactionManager: { transaction: async (callback) => callback({ id: 'test' }) },
});

test('customer payment status returns only the latest attempt and safe manual-review flag', async () => {
  const booking = {
    id: 7, booking_code: 'BK123', user_id: 11, guest_email: null, status: 'expired', total_amount: '2500000.00', hold_expires_at: null,
    payments: [
      { id: 22, payment_method: 'payos', status: 'pending', amount: '2500000.00', transaction_ref: 'new-ref', paid_at: null, reconciliationCase: null },
      { id: 21, payment_method: 'vnpay', status: 'success', amount: '2500000.00', transaction_ref: 'old-ref', paid_at: new Date(), reconciliationCase: { state: 'manual_review', manual_review_reason: 'internal' } },
    ],
  };
  const result = await makeService(booking).getCustomerPaymentStatus(7, { id: 11, role: { name: 'customer' } });
  assert.deepEqual(result.booking, { id: 7, booking_code: 'BK123', status: 'expired', total_amount: '2500000.00', hold_expires_at: null });
  assert.deepEqual(result.payment.active_attempt, { payment_method: 'payos', status: 'pending', amount: '2500000.00', transaction_ref: 'new-ref', paid_at: null });
  assert.deepEqual(result.payment.previous_attempts, [{ payment_method: 'vnpay', status: 'success', amount: '2500000.00', is_stale: true }]);
  assert.equal(result.payment.manual_review_required, true);
  assert.equal(result.payment.status_confidence, 'authoritative');
  assert.equal('id' in result.payment.active_attempt, false);
  assert.equal('manual_review_reason' in result.payment.previous_attempts[0], false);
});

test('customer payment status rejects a non-owner and never grants staff bypass', async () => {
  const booking = { id: 7, booking_code: 'BK123', user_id: 11, guest_email: null, status: 'holding', total_amount: '10.00', hold_expires_at: null, payments: [] };
  await assert.rejects(() => makeService(booking).getCustomerPaymentStatus(7, { id: 12, role: { name: 'customer' } }), (error) => error.statusCode === 403);
  await assert.rejects(() => makeService(booking).getCustomerPaymentStatus(7, { id: 99, role: { name: 'staff' } }), (error) => error.statusCode === 403);
});

test('guest payment status requires matching guest email and hides authorization failures', async () => {
  const booking = { id: 7, booking_code: 'BK123', user_id: null, guest_email: 'guest@example.com', status: 'holding', total_amount: '10.00', hold_expires_at: null, payments: [] };
  const service = makeService(booking);
  await assert.rejects(() => service.getCustomerPaymentStatus(7, null), (error) => error.statusCode === 404);
  await assert.rejects(() => service.getCustomerPaymentStatus(7, null, 'wrong@example.com'), (error) => error.statusCode === 404);
  const result = await service.getCustomerPaymentStatus(7, null, 'GUEST@example.com');
  assert.equal(result.payment.active_attempt, null);
});

test('missing booking returns 404 and does not call a gateway', async () => {
  const service = makeService(null);
  await assert.rejects(() => service.getCustomerPaymentStatus(999, null, 'guest@example.com'), (error) => error.statusCode === 404);
});
