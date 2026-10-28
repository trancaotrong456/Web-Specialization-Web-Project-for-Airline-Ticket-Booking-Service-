'use strict';

const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const emailService = require('../../services/email.service');
const paymentService = require('../../services/payment.service');
const { models, verifyConnectedDatabase } = require('./helpers/mysqlTestDatabase');

before(async () => { await verifyConnectedDatabase(); });
after(async () => { await models.sequelize.close(); });

test('IT-50 test email provider prevents external Resend calls', async () => {
  const oldFetch = global.fetch;
  const oldMode = process.env.EMAIL_DELIVERY_MODE;
  let calls = 0;
  process.env.NODE_ENV = 'test';
  process.env.EMAIL_DELIVERY_MODE = 'live';
  global.fetch = async () => { calls += 1; throw new Error('external email call'); };
  try {
    const result = await emailService.sendMail({ to: 'integration@example.test', subject: 'test', html: '<p>test</p>' });
    assert.equal(result.skipped, true);
    assert.equal(calls, 0);
  } finally {
    global.fetch = oldFetch;
    if (oldMode === undefined) delete process.env.EMAIL_DELIVERY_MODE; else process.env.EMAIL_DELIVERY_MODE = oldMode;
    emailService.resetAdapter();
  }
});

test('IT-51 email failure after commit is contained by the post-commit notifier', async () => {
  const original = emailService.sendBookingConfirmation;
  const originalError = console.error;
  let logged = 0;
  emailService.sendBookingConfirmation = async () => { throw new Error('delivery unavailable'); };
  console.error = () => { logged += 1; };
  try {
    await paymentService._triggerBookingConfirmationEmail(987654);
    assert.equal(logged, 1);
  } finally {
    emailService.sendBookingConfirmation = original;
    console.error = originalError;
  }
});
