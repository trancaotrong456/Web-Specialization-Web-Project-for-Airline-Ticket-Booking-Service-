const test = require('node:test');
const assert = require('node:assert/strict');
const { validationResult } = require('express-validator');
const { initiatePaymentValidator } = require('../validators/payment.validator');
const { resolvePaymentReturnUrl } = require('../utils/paymentReturnUrl.util');

async function validateReturnUrl(return_url) {
  const req = { body: { booking_id: 1, payment_method: 'vnpay', guest_email: 'guest@example.com', return_url } };
  for (const middleware of initiatePaymentValidator) await middleware(req, {}, () => {});
  return validationResult(req).array().filter((error) => error.path === 'return_url');
}

const ORIGINAL_ENV = { ...process.env };

test.afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test('accepts localhost return_url syntax for development frontend', async () => {
  assert.deepEqual(await validateReturnUrl('http://localhost:5173/payments/result'), []);

  process.env.NODE_ENV = 'development';
  process.env.CLIENT_URL = 'http://localhost:5173';
  assert.equal(
    resolvePaymentReturnUrl('http://localhost:5173/payments/result', 'http://localhost:3000/payments/result'),
    'http://localhost:5173/payments/result'
  );
});

test('uses the Vite localhost origin as the VNPay fallback in development', async () => {
  const oldClientUrl = process.env.CLIENT_URL;
  const oldVnpReturnUrl = process.env.VNP_RETURN_URL;
  delete process.env.CLIENT_URL;
  delete process.env.VNP_RETURN_URL;
  try {
    process.env.NODE_ENV = 'development';
    const { resolvePaymentReturnUrl } = require('../utils/paymentReturnUrl.util');
    assert.equal(
      resolvePaymentReturnUrl(undefined, undefined, 'http://localhost:5173/payments/result'),
      'http://localhost:5173/payments/result'
    );
  } finally {
    if (oldClientUrl === undefined) delete process.env.CLIENT_URL; else process.env.CLIENT_URL = oldClientUrl;
    if (oldVnpReturnUrl === undefined) delete process.env.VNP_RETURN_URL; else process.env.VNP_RETURN_URL = oldVnpReturnUrl;
  }
});

test('accepts an HTTPS return_url with a valid public hostname', async () => {
  assert.deepEqual(await validateReturnUrl('https://booking.example.com/payments/result'), []);
});

test('rejects a return_url with an unsupported protocol', async () => {
  const errors = await validateReturnUrl('ftp://localhost:5173/payment/vnpay-return');
  assert.ok(errors.some((error) => error.msg === 'return_url must be a valid URL'));
});

test('rejects an origin outside the configured return URL allowlist', () => {
  process.env.NODE_ENV = 'development';
  process.env.CLIENT_URL = 'http://localhost:5173';
  assert.throws(
    () => resolvePaymentReturnUrl(
      'https://untrusted.example/payments/result',
      'http://localhost:3000/payments/result'
    ),
    (error) => error.statusCode === 400 && error.message === 'return_url origin is not allowed'
  );
});
