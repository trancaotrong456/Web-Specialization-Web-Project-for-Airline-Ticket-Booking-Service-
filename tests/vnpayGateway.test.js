'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { VnpayGateway, sanitizeResponse, merchantResponseHash } = require('../modules/payment/vnpay.gateway');

const config = { mode: 'sandbox', tmnCode: 'TEST_TMN', hashSecret: 'secret', apiUrl: 'https://sandbox.test/merchant_webapi/api/transaction' };
const payment = { id: 7, amount: '125000.00', transaction_ref: 'TXN_7_TEST', created_at: new Date('2026-10-20T05:00:00Z'), paid_at: new Date('2026-10-21T05:00:00Z') };
function response(overrides = {}, status = 200) {
  const body = { vnp_ResponseId: 'RESP_1', vnp_Command: 'querydr', vnp_TmnCode: config.tmnCode, vnp_TxnRef: payment.transaction_ref, vnp_Amount: '12500000', vnp_ResponseCode: '00', vnp_Message: 'Success', vnp_BankCode: 'NCB', vnp_PayDate: '20261021050000', vnp_TransactionNo: '9988', vnp_TransactionType: '01', vnp_TransactionStatus: '00', vnp_OrderInfo: 'Query', vnp_PromotionCode: '', vnp_PromotionAmount: '', ...overrides };
  body.vnp_SecureHash = merchantResponseHash(body, body.vnp_Command, config.hashSecret);
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

test('VNPay QueryDR signs request and validates success response', async () => {
  let request;
  const gateway = new VnpayGateway({ configProvider: () => config, httpClient: async (url, opts) => { request = { url, opts }; return response(); } });
  const result = await gateway.query({ payment, requestId: 'REQ_1' });
  assert.equal(result.status, 'success');
  assert.equal(request.url, config.apiUrl);
  assert.equal(request.opts.headers['Content-Type'], 'application/json');
  const payload = JSON.parse(request.opts.body);
  assert.equal(payload.vnp_Command, 'querydr');
  assert.equal(payload.vnp_TransactionDate, '20261020120000');
  assert.match(request.opts.body, /"vnp_SecureHash"/);
});

test('VNPay refund rejects invalid amount or signature', async () => {
  const gateway = new VnpayGateway({ configProvider: () => config, httpClient: async () => response({ vnp_Amount: '1' }) });
  await assert.rejects(() => gateway.refund({ payment, requestId: 'REQ_1', createBy: 'admin@example.test' }), /amount mismatch/);
  const bad = new VnpayGateway({ configProvider: () => config, httpClient: async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ vnp_ResponseId: 'RESP_BAD', vnp_Command: 'querydr', vnp_TmnCode: config.tmnCode, vnp_TxnRef: payment.transaction_ref, vnp_Amount: '12500000', vnp_ResponseCode: '00', vnp_SecureHash: 'bad' }) }) });
  await assert.rejects(() => bad.query({ payment, requestId: 'REQ_1' }), /signature is invalid/);
  const wrongReference = new VnpayGateway({ configProvider: () => config, httpClient: async () => response({ vnp_TxnRef: 'OTHER_TXN' }) });
  await assert.rejects(() => wrongReference.query({ payment, requestId: 'REQ_1' }), /reference mismatch/);
});

test('gateway timeout is classified as unknown and response is sanitized', async () => {
  const gateway = new VnpayGateway({ configProvider: () => config, timeoutMs: 1, httpClient: async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; } });
  await assert.rejects(() => gateway.query({ payment }), (error) => error.outcome === 'unknown');
  assert.deepEqual(sanitizeResponse({ secret: 'x', vnp_ResponseCode: '00' }), { vnp_ResponseCode: '00' });
});

test('VNPay merchant classifier requires transaction settlement status', () => {
  const base = { vnp_ResponseId: 'R', vnp_Command: 'refund', vnp_ResponseCode: '00', vnp_Message: 'Accepted', vnp_TmnCode: config.tmnCode, vnp_TxnRef: payment.transaction_ref, vnp_Amount: '12500000', vnp_BankCode: 'NCB', vnp_PayDate: '', vnp_TransactionNo: '9', vnp_TransactionType: '02', vnp_OrderInfo: 'Refund' };
  for (const [status, expected] of [['00', 'success'], ['01', 'pending'], ['05', 'pending'], ['06', 'pending'], ['09', 'failed']]) {
    const body = { ...base, vnp_TransactionStatus: status };
    body.vnp_SecureHash = merchantResponseHash(body, 'refund', config.hashSecret);
    const result = new VnpayGateway({ configProvider: () => config, httpClient: async () => ({ ok: true, status: 200, text: async () => JSON.stringify(body) }) });
    assert.equal(result._validateResponse(body, payment, 'refund').status, expected);
  }
  const missing = { ...base, vnp_TransactionStatus: '' };
  missing.vnp_SecureHash = merchantResponseHash(missing, 'refund', config.hashSecret);
  const gateway = new VnpayGateway({ configProvider: () => config, httpClient: async () => ({ ok: true, status: 200, text: async () => JSON.stringify(missing) }) });
  return gateway.refund({ payment, requestId: 'REQ_1', createBy: 'admin@example.test' }).then((result) => assert.equal(result.status, 'unknown'));
});
