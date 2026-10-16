const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Op } = require('sequelize');
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
  let createdUser = null;

  User.findOne = async () => null;
  Role.findOrCreate = async () => [{ id: 1, name: 'customer' }, true];
  User.create = async (payload) => {
    createdPayload = payload;
    createdUser = {
      id: 99,
      ...payload,
      async update(values) { Object.assign(this, values); },
    };
    return createdUser;
  };

  try {
    const result = await authService.register({
      email: '  Student@Example.COM ',
      password: 'StrongPassword123',
      full_name: 'Student Demo',
      phone: null,
    });
    assert.equal(createdPayload.email, 'student@example.com');
    assert.notEqual(createdPayload.password_hash, 'StrongPassword123');
    assert.equal(await bcrypt.compare('StrongPassword123', createdPayload.password_hash), true);
    assert.equal(typeof result.refreshToken, 'string');
    assert.equal(createdUser.refresh_token, crypto.createHash('sha256').update(result.refreshToken).digest('hex'));
    assert.notEqual(createdUser.refresh_token, result.refreshToken);
  } finally {
    User.findOne = originalFindOne;
    User.create = originalCreate;
    Role.findOrCreate = originalFindOrCreate;
  }
});

test('login returns the raw refresh token but persists only its SHA-256 digest', async () => {
  const originalFindOne = User.findOne;
  const oldHash = await bcrypt.hash('StrongPassword123', 4);
  const user = {
    id: 101,
    email: 'login@example.com',
    full_name: 'Login User',
    phone: null,
    status: 'active',
    password_hash: oldHash,
    role: { id: 1, name: 'customer' },
    async update(values) { Object.assign(this, values); },
  };
  User.findOne = async () => user;

  try {
    const result = await authService.login({ email: 'LOGIN@example.com', password: 'StrongPassword123' });
    assert.equal(typeof result.refreshToken, 'string');
    assert.equal(user.refresh_token, crypto.createHash('sha256').update(result.refreshToken).digest('hex'));
    assert.notEqual(user.refresh_token, result.refreshToken);
    assert.equal(result.user.email, user.email);
  } finally {
    User.findOne = originalFindOne;
  }
});

test('refresh accepts a stored digest without rotating the refresh token', async () => {
  const refreshToken = generateRefreshToken({ id: 202, email: 'digest@example.com', role: 'customer' });
  const digest = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const originalFindByPk = User.findByPk;
  const originalUpdate = User.update;
  const user = {
    id: 202,
    email: 'digest@example.com',
    status: 'active',
    refresh_token: digest,
    role: { id: 1, name: 'customer' },
  };
  let writes = 0;
  User.findByPk = async () => user;
  User.update = async () => { writes += 1; return [1]; };

  try {
    const result = await authService.refreshToken(refreshToken);
    assert.equal(typeof result.accessToken, 'string');
    assert.deepEqual(Object.keys(result), ['accessToken']);
    assert.equal(user.refresh_token, digest);
    assert.equal(writes, 0);
  } finally {
    User.findByPk = originalFindByPk;
    User.update = originalUpdate;
  }
});

test('refresh lazily upgrades a valid legacy raw token using compare-and-set', async () => {
  const refreshToken = generateRefreshToken({ id: 303, email: 'legacy@example.com', role: 'customer' });
  const digest = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const originalFindByPk = User.findByPk;
  const originalUpdate = User.update;
  const user = {
    id: 303,
    email: 'legacy@example.com',
    status: 'active',
    refresh_token: refreshToken,
    role: { id: 1, name: 'customer' },
  };
  let updateArgs;
  User.findByPk = async () => user;
  User.update = async (...args) => { updateArgs = args; return [1]; };

  try {
    const result = await authService.refreshToken(refreshToken);
    assert.equal(typeof result.accessToken, 'string');
    assert.equal(updateArgs[0].refresh_token, digest);
    assert.equal(updateArgs[1].where.id, user.id);
    const binaryComparison = updateArgs[1].where[Op.and];
    assert.equal(binaryComparison.attribute.fn, 'BINARY');
    assert.equal(binaryComparison.attribute.args[0].col, 'refresh_token');
    assert.equal(binaryComparison.logic, refreshToken);
  } finally {
    User.findByPk = originalFindByPk;
    User.update = originalUpdate;
  }
});

test('refresh rejects a legacy-token upgrade if its compare-and-set loses a revoke race', async () => {
  const refreshToken = generateRefreshToken({ id: 404, email: 'race@example.com', role: 'customer' });
  const originalFindByPk = User.findByPk;
  const originalUpdate = User.update;
  const user = {
    id: 404,
    status: 'active',
    refresh_token: refreshToken,
    role: { id: 1, name: 'customer' },
  };
  let reads = 0;
  User.findByPk = async () => {
    reads += 1;
    return reads === 1 ? user : { ...user, refresh_token: null };
  };
  User.update = async () => [0];

  try {
    await assert.rejects(
      authService.refreshToken(refreshToken),
      (error) => error.statusCode === 401 && error.message.includes('revoked'),
    );
    assert.equal(reads, 2);
  } finally {
    User.findByPk = originalFindByPk;
    User.update = originalUpdate;
  }
});

test('refresh rejects a legacy upgrade if another session replaced the stored token', async () => {
  const refreshToken = generateRefreshToken({ id: 405, email: 'replaced@example.com', role: 'customer' });
  const replacementToken = generateRefreshToken({ id: 405, email: 'replaced@example.com', role: 'staff' });
  const replacementDigest = crypto.createHash('sha256').update(replacementToken).digest('hex');
  const originalFindByPk = User.findByPk;
  const originalUpdate = User.update;
  const user = {
    id: 405,
    status: 'active',
    refresh_token: refreshToken,
    role: { id: 1, name: 'customer' },
  };
  let reads = 0;
  User.findByPk = async () => {
    reads += 1;
    return reads === 1 ? user : { ...user, refresh_token: replacementDigest };
  };
  User.update = async () => [0];

  try {
    await assert.rejects(
      authService.refreshToken(refreshToken),
      (error) => error.statusCode === 401 && error.message.includes('revoked'),
    );
  } finally {
    User.findByPk = originalFindByPk;
    User.update = originalUpdate;
  }
});

test('refresh rejects invalid, expired, and revoked token values', async () => {
  await assert.rejects(
    authService.refreshToken('not-a-jwt'),
    (error) => error.statusCode === 401 && error.message.includes('Invalid or expired'),
  );

  const expiredToken = generateRefreshToken({ id: 505, email: 'expired@example.com', role: 'customer' });
  const originalNow = Date.now;
  Date.now = () => originalNow() + (8 * 24 * 60 * 60 * 1000);
  try {
    await assert.rejects(
      authService.refreshToken(expiredToken),
      (error) => error.statusCode === 401 && error.message.includes('Invalid or expired'),
    );
  } finally {
    Date.now = originalNow;
  }

  const validToken = generateRefreshToken({ id: 506, email: 'revoked@example.com', role: 'customer' });
  const originalFindByPk = User.findByPk;
  User.findByPk = async () => ({
    id: 506,
    status: 'active',
    refresh_token: null,
    role: { id: 1, name: 'customer' },
  });
  try {
    await assert.rejects(
      authService.refreshToken(validToken),
      (error) => error.statusCode === 401 && error.message.includes('revoked'),
    );
  } finally {
    User.findByPk = originalFindByPk;
  }
});

test('logout revokes a digest-backed refresh session', async () => {
  const originalUpdate = User.update;
  let updateArgs;
  User.update = async (...args) => { updateArgs = args; return [1]; };

  try {
    const result = await authService.logout(607);
    assert.equal(result.message, 'Logged out successfully');
    assert.deepEqual(updateArgs, [{ refresh_token: null }, { where: { id: 607 } }]);
  } finally {
    User.update = originalUpdate;
  }
});

test('auth login and refresh paths do not log the raw refresh token', async () => {
  const originalFindOne = User.findOne;
  const originalFindByPk = User.findByPk;
  const originalConsole = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  const oldHash = await bcrypt.hash('StrongPassword123', 4);
  const user = {
    id: 708,
    email: 'nolog@example.com',
    full_name: 'No Log User',
    phone: null,
    status: 'active',
    password_hash: oldHash,
    refresh_token: null,
    role: { id: 1, name: 'customer' },
    async update(values) { Object.assign(this, values); },
  };
  const logged = [];
  User.findOne = async () => user;
  User.findByPk = async () => user;
  for (const method of Object.keys(originalConsole)) {
    console[method] = (...args) => logged.push(args.join(' '));
  }

  try {
    const loginResult = await authService.login({ email: user.email, password: 'StrongPassword123' });
    await authService.refreshToken(loginResult.refreshToken);
    assert.equal(logged.some((line) => line.includes(loginResult.refreshToken)), false);
  } finally {
    User.findOne = originalFindOne;
    User.findByPk = originalFindByPk;
    Object.assign(console, originalConsole);
  }
});
