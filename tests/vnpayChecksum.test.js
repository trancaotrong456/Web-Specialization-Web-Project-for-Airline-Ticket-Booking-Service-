'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { signVnpayParams, verifyVnpayChecksum } = require('../utils/checksum.util');

const secret = 'sandbox-test-secret';

function signed(overrides = {}) {
  const params = {
    vnp_TmnCode: 'TEST_TMN',
    vnp_TxnRef: 'TXN-1',
    vnp_Amount: '1000000',
    vnp_OrderInfo: 'Thanh toan + ve %20 Việt',
    vnp_ResponseCode: '00',
    ...overrides,
  };
  return { ...params, vnp_SecureHash: signVnpayParams(params, secret) };
}

test('verifies spaces, literal plus, percent text and Unicode after URL parsing', () => {
  const original = signed();
  const query = Object.fromEntries(new URLSearchParams(
    Object.entries(original).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&'),
  ));
  assert.equal(verifyVnpayChecksum(query, secret), true);
});

test('rejects a duplicate query parameter represented as an array', () => {
  const query = signed({ vnp_OrderInfo: 'one' });
  query.vnp_OrderInfo = ['one', 'two'];
  assert.equal(Array.isArray(query.vnp_OrderInfo), true);
  assert.equal(verifyVnpayChecksum(query, secret), false);
});

test('rejects a wrong secret and a missing secure hash', () => {
  const query = signed();
  assert.equal(verifyVnpayChecksum(query, 'different-secret'), false);
  const { vnp_SecureHash: _hash, ...withoutHash } = query;
  assert.equal(verifyVnpayChecksum(withoutHash, secret), false);
});
