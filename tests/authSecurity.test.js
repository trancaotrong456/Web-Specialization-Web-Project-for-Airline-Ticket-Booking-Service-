const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const bcrypt = require('bcryptjs');
const authService = require('../services/auth.service');
const { User } = require('../models');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} = require('../utils/jwt.util');
const {
  refreshTokenValidator,
  updateProfileValidator,
  registerValidator,
} = require('../validators/auth.validator');
const validate = require('../middlewares/validate.middleware');

test('refresh-token endpoint requires a non-empty token', async () => {
  const app = express();
  app.use(express.json());
  app.post('/refresh-token', refreshTokenValidator, validate, (_req, res) => res.json({ reached: true }));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/refresh-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(response.status, 422);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('access and refresh tokens are explicitly typed and cannot be interchanged', () => {
  const payload = { id: 5, email: 'typed@example.com', role: 'customer' };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  assert.equal(verifyAccessToken(accessToken).token_type, 'access');
  assert.equal(verifyRefreshToken(refreshToken).token_type, 'refresh');
  assert.throws(() => verifyAccessToken(refreshToken));
  assert.throws(() => verifyRefreshToken(accessToken));
});

test('profile update rejects an empty request body', async () => {
  const app = express();
  app.use(express.json());
  app.put('/me', updateProfileValidator, validate, (_req, res) => res.json({ reached: true }));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/me`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(response.status, 422);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('registration rejects passwords that bcrypt would silently truncate', async () => {
  const app = express();
  app.use(express.json());
  app.post('/register', registerValidator, validate, (_req, res) => res.json({ reached: true }));
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'long-password@example.com',
        password: 'a'.repeat(73),
        full_name: 'Long Password',
      }),
    });
    assert.equal(response.status, 422);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('a locked account cannot mint a new access token', async () => {
  const refreshToken = generateRefreshToken({ id: 42, email: 'locked@example.com', role: 'customer' });
  const originalFindByPk = User.findByPk;
  User.findByPk = async () => ({
    id: 42,
    status: 'locked',
    refresh_token: refreshToken,
    role: { id: 1, name: 'customer' },
  });

  try {
    await assert.rejects(
      authService.refreshToken(refreshToken),
      (error) => error.statusCode === 403 && error.message.includes('locked'),
    );
  } finally {
    User.findByPk = originalFindByPk;
  }
});

test('changing a password revokes the existing refresh token', async () => {
  const originalFindByPk = User.findByPk;
  const oldHash = await bcrypt.hash('OldPassword123', 4);
  const user = {
    id: 7,
    password_hash: oldHash,
    refresh_token: 'previous-session-token',
    async save() {},
  };
  User.findByPk = async () => user;

  try {
    await authService.changePassword(7, {
      current_password: 'OldPassword123',
      new_password: 'NewPassword456',
    });
    assert.equal(user.refresh_token, null);
    assert.equal(await bcrypt.compare('NewPassword456', user.password_hash), true);
  } finally {
    User.findByPk = originalFindByPk;
  }
});

test('changing a password rejects reusing the current password', async () => {
  const originalFindByPk = User.findByPk;
  const currentHash = await bcrypt.hash('SamePassword123', 4);
  const user = {
    id: 17,
    password_hash: currentHash,
    refresh_token: 'active-refresh-token',
    async save() { throw new Error('save must not be called'); },
  };
  User.findByPk = async () => user;

  try {
    await assert.rejects(
      authService.changePassword(17, {
        current_password: 'SamePassword123',
        new_password: 'SamePassword123',
      }),
      (error) => error.statusCode === 400 && error.message.includes('different'),
    );
    assert.equal(user.refresh_token, 'active-refresh-token');
  } finally {
    User.findByPk = originalFindByPk;
  }
});

test('registration normalizes email and never stores the plain-text password', async () => {
  const originalFindOne = User.findOne;
  const originalCreate = User.create;
  const { Role } = require('../models');
  const originalFindOrCreate = Role.findOrCreate;
  let createdPayload = null;

  User.findOne = async () => null;
  Role.findOrCreate = async () => [{ id: 1, name: 'customer' }, true];
  User.create = async (payload) => {
    createdPayload = payload;
    return {
      id: 99,
      ...payload,
      async update(values) { Object.assign(this, values); },
    };
  };

  try {
    await authService.register({
      email: '  Student@Example.COM ',
      password: 'StrongPassword123',
      full_name: 'Student Demo',
      phone: null,
    });
    assert.equal(createdPayload.email, 'student@example.com');
    assert.notEqual(createdPayload.password_hash, 'StrongPassword123');
    assert.equal(await bcrypt.compare('StrongPassword123', createdPayload.password_hash), true);
  } finally {
    User.findOne = originalFindOne;
    User.create = originalCreate;
    Role.findOrCreate = originalFindOrCreate;
  }
});
