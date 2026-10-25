const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { updateUserProfileValidator, updateUserStatusValidator } = require('../validators/user.validator');
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

test('admin profile update accepts editable fields and rejects role, status, and security fields', async () => {
  const app = express();
  app.use(express.json());
  app.patch('/users/:id', updateUserProfileValidator, validate, (_req, res) => res.json({ reached: true }));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  try {
    const base = `http://127.0.0.1:${server.address().port}/users/4`;
    const allowed = await fetch(base, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ full_name: 'Updated Name', phone: '0912345678' }) });
    assert.equal(allowed.status, 200);
    for (const body of [
      { role_id: 3 }, { status: 'active' }, { password_hash: 'attacker-value' },
      { refresh_token: 'attacker-value' }, { email: 'new@example.com' }, {},
    ]) {
      const response = await fetch(base, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      assert.equal(response.status, 422, `must reject ${Object.keys(body).join(',') || 'empty payload'}`);
    }
    const invalidName = await fetch(base, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ full_name: ' ' }) });
    assert.equal(invalidName.status, 422);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
