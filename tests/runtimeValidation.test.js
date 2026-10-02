const test = require('node:test');
const assert = require('node:assert/strict');
const { validateRuntimeConfiguration } = require('../config/runtimeValidation');

const validProductionEnvironment = (overrides = {}) => ({
  NODE_ENV: 'production',
  PAYOS_MODE: 'disabled',
  JWT_SECRET: 'access-secret-for-production',
  JWT_REFRESH_SECRET: 'refresh-secret-for-production',
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
      JWT_SECRET: 'shared-secret',
      JWT_REFRESH_SECRET: 'shared-secret',
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
