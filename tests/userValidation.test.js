const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { updateUserStatusValidator } = require('../validators/user.validator');
const validate = require('../middlewares/validate.middleware');

test('user administration rejects an unsupported account status', async () => {
  const app = express();
  app.use(express.json());
  app.put('/users/:id/status', updateUserStatusValidator, validate, (_req, res) => res.json({ reached: true }));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/users/4/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'deleted' }),
    });
    assert.equal(response.status, 422);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
