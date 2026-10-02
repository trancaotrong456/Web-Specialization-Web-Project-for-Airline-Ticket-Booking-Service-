const test = require('node:test');
const assert = require('node:assert/strict');
const paymentService = require('../services/payment.service');

const withEnvironment = async (updates, run) => {
  const original = {};
  for (const key of Object.keys(updates)) {
    original[key] = process.env[key];
    if (updates[key] === undefined) delete process.env[key];
    else process.env[key] = updates[key];
  }

  try {
    await run();
  } finally {
    for (const key of Object.keys(updates)) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
};

test('payOS demo mode is rejected before any booking mutation in production', async () => {
  await withEnvironment(
    { PAYOS_MODE: 'demo', NODE_ENV: 'production' },
    async () => {
      await assert.rejects(
        paymentService.initiatePayment({
          booking_id: 1,
          payment_method: 'payos',
          guest_email: 'guest@example.com',
        }),
        (error) => error.statusCode === 503 && error.message === 'payOS demo mode is forbidden in production.',
      );
    },
  );
});

test('an unknown payOS mode is treated as a server configuration error', async () => {
  await withEnvironment(
    { PAYOS_MODE: 'unsupported', NODE_ENV: 'development' },
    async () => {
      assert.throws(
        () => paymentService._getPayOSMode(),
        (error) => error.statusCode === 500 && error.message.includes('Invalid PAYOS_MODE'),
      );
    },
  );
});
