const test = require('node:test');
const assert = require('node:assert/strict');
const userService = require('../services/user.service');
const { User, Role } = require('../models');

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


test('custom roles without RBAC permission configuration cannot be assigned to users', async () => {
  const originalFindRole = Role.findByPk;
  const originalFindUser = User.findByPk;
  let loadedUser = false;
  Role.findByPk = async () => ({ id: 7, name: 'support' });
  User.findByPk = async () => { loadedUser = true; return null; };
  try {
    await assert.rejects(
      userService.updateUserRole(8, 7, 1),
      (error) => error.statusCode === 400 && /Only system roles/.test(error.message),
    );
    assert.equal(loadedUser, false, 'Do not modify the user for an unsupported role');
  } finally {
    Role.findByPk = originalFindRole;
    User.findByPk = originalFindUser;
  }
});
