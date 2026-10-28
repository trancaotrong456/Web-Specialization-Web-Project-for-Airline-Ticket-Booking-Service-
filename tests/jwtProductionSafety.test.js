'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('../utils/jwt.util');

const original = {
  nodeEnv: process.env.NODE_ENV,
  access: process.env.JWT_SECRET,
  refresh: process.env.JWT_REFRESH_SECRET,
};

test.after(() => {
  process.env.NODE_ENV = original.nodeEnv;
  process.env.JWT_SECRET = original.access;
  process.env.JWT_REFRESH_SECRET = original.refresh;
});

test('production JWT signing rejects missing secrets instead of using defaults', () => {
  process.env.NODE_ENV = 'production';
  delete process.env.JWT_SECRET;
  delete process.env.JWT_REFRESH_SECRET;
  assert.throws(() => jwt.generateAccessToken({ id: 1 }), /JWT_SECRET/);
  assert.throws(() => jwt.generateRefreshToken({ id: 1 }), /JWT_REFRESH_SECRET/);
});

test('configured access and refresh JWT secrets remain compatible', () => {
  process.env.NODE_ENV = 'production';
  process.env.JWT_SECRET = 'access-secret-that-is-long-enough-for-production-123';
  process.env.JWT_REFRESH_SECRET = 'refresh-secret-that-is-long-enough-for-production-456';
  const payload = { id: 7, role: 'admin' };
  const access = jwt.generateAccessToken(payload);
  const refresh = jwt.generateRefreshToken(payload);
  assert.equal(jwt.verifyAccessToken(access).id, 7);
  assert.equal(jwt.verifyRefreshToken(refresh).id, 7);
});
