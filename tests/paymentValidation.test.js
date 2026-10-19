const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { paymentListValidator } = require('../validators/payment.validator');
const { initiatePaymentValidator } = require('../validators/payment.validator');
const validate = require('../middlewares/validate.middleware');

test('payment history rejects unsupported filters before querying the database', async () => {
  const app = express();
  app.get('/payments', paymentListValidator, validate, (_req, res) => res.json({ reached: true }));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/payments?status=unknown`);
    const body = await response.json();
    assert.equal(response.status, 422);
    assert.equal(body.message, 'Validation error');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('payment initiation accepts a well-formed idempotency key and rejects unsafe key syntax', async () => {
  const app = express();
  app.post('/payments', express.json(), initiatePaymentValidator, validate, (_req, res) => res.json({ reached: true }));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  try {
    const body = { booking_id: 4, payment_method: 'vnpay', guest_email: 'guest@example.com' };
    const valid = await fetch(`http://127.0.0.1:${server.address().port}/payments`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': 'request-key-1234' }, body: JSON.stringify(body),
    });
    assert.equal(valid.status, 200);
    const invalid = await fetch(`http://127.0.0.1:${server.address().port}/payments`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': 'bad/key' }, body: JSON.stringify(body),
    });
    assert.equal(invalid.status, 422);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
