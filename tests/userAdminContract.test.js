const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const userRouter = require('../routes/user.route');
const userService = require('../services/user.service');
const { User, Role } = require('../models');

test('user administration exposes exactly the implemented report endpoints', () => {
  const globalMiddleware = userRouter.stack.filter((layer) => !layer.route);
  const routes = userRouter.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods),
    }));

  assert.equal(globalMiddleware.length, 2);
  assert.equal(globalMiddleware[0].name, 'authenticate');
  assert.deepEqual(routes, [
    { path: '/', methods: ['get'] },
    { path: '/:id', methods: ['get'] },
    { path: '/:id/status', methods: ['put'] },
    { path: '/:id/role', methods: ['put'] },
    { path: '/:id', methods: ['delete'] },
  ]);
});

test('user list applies pagination, search, status, safe fields, and role data', async () => {
  const originalFindAndCountAll = User.findAndCountAll;
  let receivedOptions;
  User.findAndCountAll = async (options) => {
    receivedOptions = options;
    return { count: 1, rows: [{ id: 7, email: 'member@example.com' }] };
  };

  try {
    const result = await userService.getAllUsers({
      page: '2',
      limit: '10',
      search: 'member',
      status: 'active',
    });

    assert.equal(receivedOptions.limit, 10);
    assert.equal(receivedOptions.offset, 10);
    assert.equal(receivedOptions.where.status, 'active');
    assert.equal(receivedOptions.where[Op.or].length, 2);
    assert.deepEqual(receivedOptions.attributes.exclude, [
      'password_hash',
      'refresh_token',
      'reset_token',
      'reset_token_expires_at',
    ]);
    assert.equal(receivedOptions.include[0].model, Role);
    assert.deepEqual(result, {
      total: 1,
      page: '2',
      limit: '10',
      data: [{ id: 7, email: 'member@example.com' }],
    });
  } finally {
    User.findAndCountAll = originalFindAndCountAll;
  }
});

test('user detail query excludes authentication and reset secrets', async () => {
  const originalFindByPk = User.findByPk;
  let receivedOptions;
  User.findByPk = async (_id, options) => {
    receivedOptions = options;
    return { id: 9, email: 'safe@example.com' };
  };

  try {
    await userService.getUserById(9);
    assert.deepEqual(receivedOptions.attributes.exclude, [
      'password_hash',
      'refresh_token',
      'reset_token',
      'reset_token_expires_at',
    ]);
  } finally {
    User.findByPk = originalFindByPk;
  }
});
