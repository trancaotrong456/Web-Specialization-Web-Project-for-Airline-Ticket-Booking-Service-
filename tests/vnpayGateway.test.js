'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { VnpayGateway, sanitizeResponse } = require('../modules/payment/vnpay.gateway');
const { signVnpayParams } = require('../utils/checksum.util');

const config = { mode: 'sandbox', tmnCode: 'TEST_TMN', hashSecret: 'secret', apiUrl: 'https://sandbox.test/merchant_webapi/api/transaction' };
const payment = { id: 7, amount: '125000.00', transaction_ref: 'TXN_7_TEST', paid_at: new Date('2026-10-21T05:00:00Z') };
function response(overrides = {}, status = 200) {
  const body = { vnp_RequestId: 'REQ_1', vnp_TmnCode: config.tmnCode, vnp_TxnRef: payment.transaction_ref, vnp_Amount: '12500000', vnp_ResponseCode: '00', vnp_TransactionNo: '9988', ...overrides };
  body.vnp_SecureHash = signVnpayParams(body, config.hashSecret);
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

test('VNPay QueryDR signs request and validates success response', async () => {
  let request;
  const gateway = new VnpayGateway({ configProvider: () => config, httpClient: async (url, opts) => { request = { url, opts }; return response(); } });
  const result = await gateway.query({ payment, requestId: 'REQ_1' });
  assert.equal(result.status, 'success');
  assert.equal(request.url, config.apiUrl);
  assert.match(request.opts.body, /vnp_Command=querydr/);
  assert.match(request.opts.body, /vnp_SecureHash=/);
});

test('VNPay refund rejects invalid amount or signature', async () => {
  const gateway = new VnpayGateway({ configProvider: () => config, httpClient: async () => response({ vnp_Amount: '1' }) });
  await assert.rejects(() => gateway.refund({ payment, requestId: 'REQ_1' }), /amount mismatch/);
  const bad = new VnpayGateway({ configProvider: () => config, httpClient: async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ vnp_TmnCode: config.tmnCode, vnp_TxnRef: payment.transaction_ref, vnp_ResponseCode: '00', vnp_SecureHash: 'bad' }) }) });
  await assert.rejects(() => bad.query({ payment, requestId: 'REQ_1' }), /signature is invalid/);
});

test('gateway timeout is classified as unknown and response is sanitized', async () => {
  const gateway = new VnpayGateway({ configProvider: () => config, timeoutMs: 1, httpClient: async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; } });
  await assert.rejects(() => gateway.query({ payment }), (error) => error.outcome === 'unknown');
  assert.deepEqual(sanitizeResponse({ secret: 'x', vnp_ResponseCode: '00' }), { vnp_ResponseCode: '00' });
});
