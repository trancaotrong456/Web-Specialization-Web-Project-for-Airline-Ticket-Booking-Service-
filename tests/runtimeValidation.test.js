const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRuntimeConfiguration } = require('../config/runtimeValidation');

const validProductionEnvironment = (overrides = {}) => ({
  NODE_ENV: 'production',
  CLIENT_URL: 'https://app.example.com',
  PAYOS_MODE: 'disabled',
  DB_HOST: 'db.internal.example',
  DB_PORT: '3306',
  DB_NAME: 'airline_booking',
  DB_USER: 'airline_app',
  DB_PASS: 'database-password-from-secret-manager',
  JWT_SECRET: 'access-secret-for-production-with-at-least-32-chars',
  JWT_REFRESH_SECRET: 'refresh-secret-for-production-with-at-least-32-chars',
  VNP_HASH_SECRET: 'vnpay-secret-for-production',
  ...overrides,
});

test('accepts separate access and refresh secrets in production', () => {
  assert.doesNotThrow(() => {
    validateRuntimeConfiguration(validProductionEnvironment());
  });
});

test('rejects identical access and refresh secrets in production', () => {
  assert.throws(
    () => validateRuntimeConfiguration(validProductionEnvironment({
      JWT_SECRET: 'shared-secret-for-production-with-at-least-32-chars',
      JWT_REFRESH_SECRET: 'shared-secret-for-production-with-at-least-32-chars',
    })),
    /must be different/i,
  );
});

test('retains payOS production safety checks', () => {
  assert.throws(
    () => validateRuntimeConfiguration(validProductionEnvironment({ PAYOS_MODE: 'demo' })),
    /forbidden in production/i,
  );
  assert.throws(
    () => validateRuntimeConfiguration(validProductionEnvironment({ PAYOS_MODE: 'unexpected' })),
    /invalid PAYOS_MODE/i,
  );
});

test('requires live payOS credentials in production', () => {
  assert.throws(
    () => validateRuntimeConfiguration(validProductionEnvironment({ PAYOS_MODE: 'live' })),
    /PAYOS_CLIENT_ID.*PAYOS_API_KEY.*PAYOS_CHECKSUM_KEY/,
  );
});

test('accepts live payOS only with public HTTPS URLs and trusted hosts', () => {
  assert.doesNotThrow(() => validateRuntimeConfiguration(validProductionEnvironment({
    PAYOS_MODE: 'live',
    PAYOS_CLIENT_ID: 'client-from-secret-manager',
    PAYOS_API_KEY: 'api-key-from-secret-manager',
    PAYOS_CHECKSUM_KEY: 'checksum-from-secret-manager',
    PAYOS_BASE_URL: 'https://api-merchant.payos.vn',
    PAYOS_RETURN_URL: 'https://app.example.com/payments/result',
    PAYOS_CANCEL_URL: 'https://app.example.com/payments/result',
    PAYOS_WEBHOOK_URL: 'https://api.example.com/api/v1/payments/payos/webhook',
    PAYOS_TRUSTED_HOSTS: 'app.example.com,api.example.com',
  })));
});

test('rejects insecure, private and untrusted payOS callback configuration', () => {
  const base = {
    PAYOS_MODE: 'live', PAYOS_CLIENT_ID: 'client', PAYOS_API_KEY: 'key', PAYOS_CHECKSUM_KEY: 'checksum',
    PAYOS_BASE_URL: 'https://api-merchant.payos.vn', PAYOS_RETURN_URL: 'https://app.example.com/payments/result',
    PAYOS_CANCEL_URL: 'https://app.example.com/payments/result', PAYOS_WEBHOOK_URL: 'https://api.example.com/api/v1/payments/payos/webhook',
    PAYOS_TRUSTED_HOSTS: 'app.example.com,api.example.com',
  };
  assert.throws(() => validateRuntimeConfiguration(validProductionEnvironment({ ...base, PAYOS_RETURN_URL: 'http://app.example.com/return' })), /HTTPS/i);
  assert.throws(() => validateRuntimeConfiguration(validProductionEnvironment({ ...base, PAYOS_RETURN_URL: 'https://127.0.0.1/return' })), /localhost or a private network/i);
  assert.throws(() => validateRuntimeConfiguration(validProductionEnvironment({ ...base, PAYOS_WEBHOOK_URL: 'https://other.example.com/webhook' })), /not in PAYOS_TRUSTED_HOSTS/i);
  assert.throws(() => validateRuntimeConfiguration(validProductionEnvironment({ ...base, PAYOS_BASE_URL: 'http://api-merchant.payos.vn' })), /PAYOS_BASE_URL.*HTTPS/i);
});

test('requires the exact payOS callback path contract', () => {
  const base = {
    PAYOS_MODE: 'live', PAYOS_CLIENT_ID: 'client', PAYOS_API_KEY: 'key', PAYOS_CHECKSUM_KEY: 'checksum',
    PAYOS_BASE_URL: 'https://api-merchant.payos.vn', PAYOS_RETURN_URL: 'https://app.example.com/payments/result',
    PAYOS_CANCEL_URL: 'https://app.example.com/payments/result', PAYOS_WEBHOOK_URL: 'https://api.example.com/api/v1/payments/payos/webhook',
    PAYOS_TRUSTED_HOSTS: 'app.example.com,api.example.com',
  };
  assert.doesNotThrow(() => validateRuntimeConfiguration(validProductionEnvironment({
    ...base,
    PAYOS_RETURN_URL: 'https://app.example.com/customer/payments/result?source=payos#complete',
  })));
  assert.throws(() => validateRuntimeConfiguration(validProductionEnvironment({
    ...base,
    PAYOS_RETURN_URL: 'https://app.example.com/invalid?next=/payments/result',
  })), /PAYOS_RETURN_URL must end with \/payments\/result/i);
  assert.throws(() => validateRuntimeConfiguration(validProductionEnvironment({
    ...base,
    PAYOS_CANCEL_URL: 'https://app.example.com/payments/result/ignored',
  })), /PAYOS_CANCEL_URL must end with \/payments\/result/i);
  assert.throws(() => validateRuntimeConfiguration(validProductionEnvironment({
    ...base,
    PAYOS_WEBHOOK_URL: 'https://api.example.com/not-webhook?path=/api/v1/payments/payos/webhook',
  })), /PAYOS_WEBHOOK_URL must end with \/api\/v1\/payments\/payos\/webhook/i);
});

test('rejects embedded credentials in live callback URLs', () => {
  const base = {
    PAYOS_MODE: 'live', PAYOS_CLIENT_ID: 'client', PAYOS_API_KEY: 'key', PAYOS_CHECKSUM_KEY: 'checksum',
    PAYOS_BASE_URL: 'https://api-merchant.payos.vn', PAYOS_RETURN_URL: 'https://app.example.com/payments/result',
    PAYOS_CANCEL_URL: 'https://app.example.com/payments/result', PAYOS_WEBHOOK_URL: 'https://api.example.com/api/v1/payments/payos/webhook',
    PAYOS_TRUSTED_HOSTS: 'app.example.com,api.example.com',
  };
  assert.throws(() => validateRuntimeConfiguration(validProductionEnvironment({
    ...base,
    PAYOS_WEBHOOK_URL: 'https://user:password@api.example.com/api/v1/payments/payos/webhook',
  })), /HTTPS and must not contain credentials/i);
});

test('requires production Resend credentials and a valid sender when email is live', () => {
  const base = { EMAIL_DELIVERY_MODE: 'live' };
  assert.throws(() => validateRuntimeConfiguration(validProductionEnvironment(base)), /RESEND_API_KEY/i);
  assert.throws(() => validateRuntimeConfiguration(validProductionEnvironment({ ...base, RESEND_API_KEY: 'resend-key', EMAIL_FROM: 'invalid sender' })), /EMAIL_FROM/i);
  assert.doesNotThrow(() => validateRuntimeConfiguration(validProductionEnvironment({ ...base, RESEND_API_KEY: 'resend-key', EMAIL_FROM: 'Airline <no-reply@example.com>' })));
});
