const test = require('node:test');
const assert = require('node:assert/strict');
const { getVnpayConfig } = require('../config/vnpay');
const { validateRuntimeConfiguration } = require('../config/runtimeValidation');

const baseProduction = {
  NODE_ENV: 'production',
  JWT_SECRET: 'access-secret',
  JWT_REFRESH_SECRET: 'refresh-secret',
  VNPAY_MODE: 'production',
  VNP_TMN_CODE: 'merchant-code',
  VNP_HASH_SECRET: 'merchant-secret',
  VNP_URL: 'https://merchant.vnpayment.vn/paymentv2/vpcpay.html',
  PAYOS_MODE: 'disabled',
};

test('VNPay is disabled by default without credentials', () => {
  const config = getVnpayConfig({ NODE_ENV: 'development' });
  assert.equal(config.enabled, false);
});

test('production rejects sandbox mode and missing credentials', () => {
  assert.throws(
    () => getVnpayConfig({ NODE_ENV: 'production', VNPAY_MODE: 'sandbox', VNP_TMN_CODE: 'x', VNP_HASH_SECRET: 'y' }),
    /sandbox is forbidden/i,
  );
  assert.throws(
    () => validateRuntimeConfiguration({ ...baseProduction, VNP_TMN_CODE: '' }),
    /VNP_TMN_CODE/i,
  );
});

test('production rejects sandbox endpoint and insecure endpoint', () => {
  assert.throws(
    () => getVnpayConfig({ ...baseProduction, VNP_URL: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html' }),
    /non-sandbox HTTPS/i,
  );
  assert.throws(
    () => validateRuntimeConfiguration({ ...baseProduction, VNP_URL: 'http://merchant.example/payment' }),
    /non-sandbox HTTPS/i,
  );
});

test('sandbox requires explicit credentials and uses HTTPS endpoint', () => {
  assert.throws(
    () => getVnpayConfig({ NODE_ENV: 'development', VNPAY_MODE: 'sandbox' }),
    /Missing: VNP_TMN_CODE, VNP_HASH_SECRET/i,
  );
  const config = getVnpayConfig({ NODE_ENV: 'development', VNPAY_MODE: 'sandbox', VNP_TMN_CODE: 'TEST', VNP_HASH_SECRET: 'secret' });
  assert.equal(config.endpoint, 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html');
});
