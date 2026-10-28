'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const emailService = require('../services/email.service');
const paymentService = require('../services/payment.service');

test('IT-50 test email provider never calls Resend, even with live delivery configured', async () => {
  const oldEnv = { NODE_ENV: process.env.NODE_ENV, EMAIL_DELIVERY_MODE: process.env.EMAIL_DELIVERY_MODE, RESEND_API_KEY: process.env.RESEND_API_KEY };
  const oldFetch = global.fetch;
  let fetchCalls = 0;
  process.env.NODE_ENV = 'test';
  process.env.EMAIL_DELIVERY_MODE = 'live';
  process.env.RESEND_API_KEY = 'test-only-key';
  global.fetch = async () => { fetchCalls += 1; throw new Error('Resend must not be called in tests'); };
  try {
    const result = await emailService.sendMail({ to: 'test@example.test', subject: 'test', html: '<p>test</p>' });
    assert.equal(result.skipped, true);
    assert.equal(fetchCalls, 0);
  } finally {
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    global.fetch = oldFetch;
    emailService.resetAdapter();
  }
});

test('IT-51 email adapter failure is isolated from the caller after commit', async () => {
  const originalSend = emailService.sendBookingConfirmation;
  emailService.sendBookingConfirmation = async () => { throw new Error('delivery unavailable'); };
  const errors = [];
  const oldError = console.error;
  console.error = (...args) => errors.push(args);
  try {
    await paymentService._triggerBookingConfirmationEmail(987);
    assert.equal(errors.length, 1, 'email errors are logged without escaping the post-commit flow');
  } finally {
    emailService.sendBookingConfirmation = originalSend;
    console.error = oldError;
    emailService.resetAdapter();
  }
});
