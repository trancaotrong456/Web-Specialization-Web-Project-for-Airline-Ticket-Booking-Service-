const test = require('node:test');
const assert = require('node:assert/strict');
const { resolvePaymentReturnUrl } = require('../utils/paymentReturnUrl.util');

const ORIGINAL_ENV = { ...process.env };

test.afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

test('accepts a client return URL on the configured frontend origin', () => {
  process.env.NODE_ENV = 'development';
  process.env.CLIENT_URL = 'http://localhost:3000';

  const result = resolvePaymentReturnUrl(
    'http://localhost:3000/payment/result?booking=123',
    'http://localhost:3000/payment/vnpay-return'
  );

  assert.equal(result, 'http://localhost:3000/payment/result?booking=123');
});

test('rejects a client return URL on an untrusted origin', () => {
  process.env.NODE_ENV = 'development';
  process.env.CLIENT_URL = 'http://localhost:3000';

  assert.throws(
    () => resolvePaymentReturnUrl(
      'https://evil.example/phishing',
      'http://localhost:3000/payment/vnpay-return'
    ),
    (error) => error.statusCode === 400 && error.message === 'return_url origin is not allowed'
  );
});

test('accepts an origin explicitly listed for payment redirects', () => {
  process.env.NODE_ENV = 'production';
  process.env.PAYMENT_RETURN_URL_ALLOWLIST = 'https://booking.example.com';

  const result = resolvePaymentReturnUrl(
    'https://booking.example.com/payment/result',
    'https://api.example.com/payment/return'
  );

  assert.equal(result, 'https://booking.example.com/payment/result');
});

test('rejects insecure and localhost return URLs in production', () => {
  process.env.NODE_ENV = 'production';

  assert.throws(
    () => resolvePaymentReturnUrl(null, 'http://booking.example.com/payment/result'),
    /must use HTTPS in production/
  );
  assert.throws(
    () => resolvePaymentReturnUrl(null, 'https://localhost/payment/result'),
    /must not point to localhost in production/
  );
});
