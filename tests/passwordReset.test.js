const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const authService = require('../services/auth.service');
const emailService = require('../services/email.service');
const { User } = require('../models');

test('forgot password stores only a token hash and emails the raw token', async () => {
  const originalFindOne = User.findOne;
  const originalSendMail = emailService.sendMail;
  const originalResetUrl = process.env.PASSWORD_RESET_URL;
  let sentEmail;
  const user = {
    email: 'member@example.com',
    status: 'active',
    reset_token: null,
    reset_token_expires_at: null,
    async save() {},
  };
  User.findOne = async () => user;
  emailService.sendMail = async (email) => { sentEmail = email; };
  process.env.PASSWORD_RESET_URL = 'https://app.example.com/reset-password';

  try {
    await authService.forgotPassword(' Member@Example.com ');
    const match = sentEmail.html.match(/token=([a-f0-9]{64})/);
    assert.ok(match, 'email must contain the raw reset token');
    const rawToken = match[1];
    const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    assert.equal(user.reset_token, expectedHash);
    assert.notEqual(user.reset_token, rawToken);
    assert.ok(user.reset_token_expires_at > new Date());
  } finally {
    User.findOne = originalFindOne;
    emailService.sendMail = originalSendMail;
    if (originalResetUrl === undefined) delete process.env.PASSWORD_RESET_URL;
    else process.env.PASSWORD_RESET_URL = originalResetUrl;
  }
});

test('forgot password does not reveal an unknown account', async () => {
  const originalFindOne = User.findOne;
  const originalSendMail = emailService.sendMail;
  let emailSent = false;
  User.findOne = async () => null;
  emailService.sendMail = async () => { emailSent = true; };

  try {
    const result = await authService.forgotPassword('missing@example.com');
    assert.match(result.message, /if the email is registered/i);
    assert.equal(emailSent, false);
  } finally {
    User.findOne = originalFindOne;
    emailService.sendMail = originalSendMail;
  }
});

test('forgot password does not restore or disclose a locked account', async () => {
  const originalFindOne = User.findOne;
  const originalSendMail = emailService.sendMail;
  let emailSent = false;
  let saveCalled = false;
  User.findOne = async () => ({
    email: 'locked@example.com',
    status: 'locked',
    async save() { saveCalled = true; },
  });
  emailService.sendMail = async () => { emailSent = true; };

  try {
    const result = await authService.forgotPassword('locked@example.com');
    assert.match(result.message, /if the email is registered/i);
    assert.equal(emailSent, false);
    assert.equal(saveCalled, false);
  } finally {
    User.findOne = originalFindOne;
    emailService.sendMail = originalSendMail;
  }
});

test('forgot password keeps the generic response when email delivery fails', async () => {
  const originalFindOne = User.findOne;
  const originalSendMail = emailService.sendMail;
  const originalConsoleError = console.error;
  const user = {
    email: 'member@example.com',
    status: 'active',
    async save() {},
  };
  User.findOne = async () => user;
  emailService.sendMail = async () => { throw new Error('provider unavailable'); };
  console.error = () => {};

  try {
    const result = await authService.forgotPassword('member@example.com');
    assert.match(result.message, /if the email is registered/i);
  } finally {
    User.findOne = originalFindOne;
    emailService.sendMail = originalSendMail;
    console.error = originalConsoleError;
  }
});

test('forgot password keeps the generic response when reset URL configuration is invalid', async () => {
  const originalFindOne = User.findOne;
  const originalSendMail = emailService.sendMail;
  const originalResetUrl = process.env.PASSWORD_RESET_URL;
  const originalConsoleError = console.error;
  let emailSent = false;
  User.findOne = async () => ({
    email: 'member@example.com',
    status: 'active',
    async save() {},
  });
  emailService.sendMail = async () => { emailSent = true; };
  process.env.PASSWORD_RESET_URL = 'not-a-valid-url';
  console.error = () => {};

  try {
    const result = await authService.forgotPassword('member@example.com');
    assert.match(result.message, /if the email is registered/i);
    assert.equal(emailSent, false);
  } finally {
    User.findOne = originalFindOne;
    emailService.sendMail = originalSendMail;
    console.error = originalConsoleError;
    if (originalResetUrl === undefined) delete process.env.PASSWORD_RESET_URL;
    else process.env.PASSWORD_RESET_URL = originalResetUrl;
  }
});

test('reset password atomically updates the hash and revokes all reset and session tokens', async () => {
  const originalFindOne = User.findOne;
  const originalUpdate = User.update;
  const rawToken = 'a'.repeat(64);
  const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  let receivedValues;
  let receivedOptions;
  User.update = async (values, options) => {
    receivedValues = values;
    receivedOptions = options;
    return [1];
  };
  User.findOne = async () => ({
    password_hash: 'old-hash',
    refresh_token: 'old-refresh-token',
    reset_token: expectedHash,
    reset_token_expires_at: new Date(Date.now() + 60_000),
    async save() {},
  });

  try {
    await authService.resetPassword(rawToken, 'NewPassword123');
    assert.equal(receivedOptions.where.reset_token, expectedHash);
    assert.ok(receivedOptions.where.reset_token_expires_at[Op.gt] instanceof Date);
    assert.equal(await bcrypt.compare('NewPassword123', receivedValues.password_hash), true);
    assert.equal(receivedValues.refresh_token, null);
    assert.equal(receivedValues.reset_token, null);
    assert.equal(receivedValues.reset_token_expires_at, null);
  } finally {
    User.findOne = originalFindOne;
    User.update = originalUpdate;
  }
});

test('reset password rejects an invalid or expired token', async () => {
  const originalFindOne = User.findOne;
  const originalUpdate = User.update;
  User.findOne = async () => null;
  User.update = async () => [0];
  try {
    await assert.rejects(
      authService.resetPassword('b'.repeat(64), 'NewPassword123'),
      (error) => error.statusCode === 400 && error.message.includes('expired'),
    );
  } finally {
    User.findOne = originalFindOne;
    User.update = originalUpdate;
  }
});

test('a reset token can be consumed successfully only once under concurrent requests', async () => {
  const originalFindOne = User.findOne;
  const originalUpdate = User.update;
  let findArrivals = 0;
  let releaseFinds;
  const bothFindsStarted = new Promise((resolve) => { releaseFinds = resolve; });
  let tokenAvailable = true;

  User.findOne = async () => {
    findArrivals += 1;
    if (findArrivals === 2) releaseFinds();
    await bothFindsStarted;
    return {
      password_hash: 'old-hash',
      refresh_token: 'old-refresh',
      reset_token: 'c'.repeat(64),
      reset_token_expires_at: new Date(Date.now() + 60_000),
      async save() {},
    };
  };
  User.update = async () => {
    if (!tokenAvailable) return [0];
    tokenAvailable = false;
    return [1];
  };

  try {
    const results = await Promise.allSettled([
      authService.resetPassword('c'.repeat(64), 'FirstPassword123'),
      authService.resetPassword('c'.repeat(64), 'SecondPassword123'),
    ]);
    assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1);
    assert.equal(results.filter(({ status }) => status === 'rejected').length, 1);
  } finally {
    User.findOne = originalFindOne;
    User.update = originalUpdate;
  }
});
