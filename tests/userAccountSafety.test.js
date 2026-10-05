const test = require('node:test');
const assert = require('node:assert/strict');
const userService = require('../services/user.service');
const { User } = require('../models');

test('locking another account revokes its refresh token', async () => {
  const originalFindByPk = User.findByPk;
  const user = {
    id: 8,
    status: 'active',
    refresh_token: 'active-session',
    async save() {},
  };
  User.findByPk = async () => user;

  try {
    const result = await userService.updateUserStatus(8, 'locked', 1);
    assert.equal(result.status, 'locked');
    assert.equal(user.refresh_token, null);
  } finally {
    User.findByPk = originalFindByPk;
  }
});

test('administrators cannot lock, demote, or delete their own account', async () => {
  await assert.rejects(userService.updateUserStatus(3, 'locked', 3), /cannot lock their own account/i);
  await assert.rejects(userService.updateUserRole(3, 1, 3), /cannot change their own role/i);
  await assert.rejects(userService.deleteUser(3, 3), /cannot delete their own account/i);
});
