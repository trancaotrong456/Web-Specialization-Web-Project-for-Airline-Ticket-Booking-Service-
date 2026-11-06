'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const paymentService = require('../services/payment.service');

test('checksum failure diagnostics are test-only and redact secrets/signatures', async (t) => {
  const old = {
    NODE_ENV: process.env.NODE_ENV,
    VNPAY_MODE: process.env.VNPAY_MODE,
    VNP_TMN_CODE: process.env.VNP_TMN_CODE,
    VNP_HASH_SECRET: process.env.VNP_HASH_SECRET,
  };
  process.env.NODE_ENV = 'test';
  process.env.VNPAY_MODE = 'sandbox';
  process.env.VNP_TMN_CODE = 'TEST_TMN';
  process.env.VNP_HASH_SECRET = 'sandbox-test-secret';
  const warnings = [];
  t.mock.method(console, 'warn', (...args) => warnings.push(args));
  try {
    const result = await paymentService.handleVnpayIpn({
      vnp_TmnCode: 'OTHER_TMN', vnp_TxnRef: 'TXN-1', vnp_Amount: '1000000',
      vnp_ResponseCode: '00', vnp_SecureHash: 'full-signature-must-not-log',
    });
    assert.equal(result.RspCode, '97');
    const entry = warnings.find(([message]) => String(message).includes('Checksum diagnostics'));
    assert.ok(entry);
    const details = entry[1];
    assert.equal(details.tmnCodeMatches, false);
    assert.equal(details.txnRef, 'TXN-1');
    assert.equal(details.amount, '1000000');
    assert.equal(details.secureHashPresent, true);
    assert.equal(details.fieldTypes.vnp_SecureHash, 'string');
    assert.equal(JSON.stringify(details).includes('full-signature-must-not-log'), false);
    assert.equal(JSON.stringify(details).includes('sandbox-test-secret'), false);
  } finally {
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});
