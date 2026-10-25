const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const { createUserModule, getDefaultUserModule } = require('../modules/user');
const { SequelizeUserRepository } = require('../modules/user/user.repository');
const UserService = require('../modules/user/user.service');
const UserController = require('../modules/user/user.controller');

test('User repository preserves safe list query and role association', async () => {
  const Role = {};
  let options;
  const User = { findAndCountAll: async (query) => { options = query; return { count: 2, rows: [] }; } };
  const repository = new SequelizeUserRepository({ User, Role, Op });
  await repository.findPage({ page: '2', limit: '10', search: 'alice', status: 'active' });
  assert.equal(options.offset, 10);
  assert.equal(options.limit, 10);
  assert.equal(options.where.status, 'active');
  assert.deepEqual(options.where[Op.or], [
    { full_name: { [Op.like]: '%alice%' } },
    { email: { [Op.like]: '%alice%' } },
  ]);
  assert.deepEqual(options.attributes.exclude, ['password_hash', 'refresh_token', 'reset_token', 'reset_token_expires_at']);
  assert.equal(options.include[0].model, Role);
});

test('User service refuses custom role before loading target user', async () => {
  let loaded = false;
  const service = new UserService({ repository: {
    findRoleById: async () => ({ id: 7, name: 'custom' }),
    findById: async () => { loaded = true; return null; },
  } });
  await assert.rejects(service.updateUserRole(8, 7, 1), (error) => error.statusCode === 400);
  assert.equal(loaded, false);
});

test('User service revokes refresh token when locking another account', async () => {
  let saved = false;
  const user = { id: 8, status: 'active', refresh_token: 'session' };
  const service = new UserService({ repository: {
    findById: async () => user,
    save: async () => { saved = true; },
  } });
  assert.deepEqual(await service.updateUserStatus(8, 'locked', 1), { id: 8, status: 'locked' });
  assert.equal(user.refresh_token, null);
  assert.equal(saved, true);
});

test('User service updates only editable profile fields and returns no account secrets', async () => {
  const savedFields = [];
  const user = {
    id: 9,
    full_name: 'Old Name',
    phone: '0912345678',
    email: 'safe@example.com',
    role_id: 1,
    status: 'active',
    password_hash: 'password-secret',
    refresh_token: 'refresh-secret',
    reset_token: 'reset-secret',
    reset_token_expires_at: new Date('2030-01-01T00:00:00.000Z'),
  };
  const repository = {
    findById: async () => user,
    save: async (record) => { savedFields.push(record.full_name, record.phone); },
    findSafeById: async () => ({
      id: user.id,
      full_name: user.full_name,
      phone: user.phone,
      email: user.email,
      status: user.status,
      role: { id: user.role_id, name: 'customer' },
    }),
  };
  const service = new UserService({ repository });

  const updated = await service.updateUserProfile(9, { full_name: '  New Name  ' });

  assert.equal(user.full_name, 'New Name');
  assert.equal(user.phone, '0912345678');
  assert.equal(user.status, 'active');
  assert.equal(user.role_id, 1);
  assert.deepEqual(savedFields, ['New Name', '0912345678']);
  assert.equal('password_hash' in updated, false);
  assert.equal('refresh_token' in updated, false);
  assert.equal('reset_token' in updated, false);
});

test('User service rejects privileged and internal fields in admin profile updates', async () => {
  const service = new UserService({ repository: {
    findById: async () => ({ id: 9, full_name: 'Old Name', phone: null }),
    save: async () => assert.fail('invalid update must not be persisted'),
  } });

  await assert.rejects(
    service.updateUserProfile(9, { full_name: 'New Name', role_id: 3 }),
    (error) => error.statusCode === 400,
  );
});

test('User controller uses injected service with bound instance context', async () => {
  const service = { value: { id: 9 }, getUserById(id) { assert.equal(id, '9'); return this.value; } };
  const controller = new UserController({ service, apiResponse: { success: (_res, value) => value } });
  const response = await controller.getUserById({ params: { id: '9' } }, {}, (error) => { throw error; });
  assert.deepEqual(response, { id: 9 });
});

test('User module has one route for each legacy endpoint and shared adapters', () => {
  const module = getDefaultUserModule();
  assert.equal(require('../services/user.service'), module.service);
  assert.equal(require('../controllers/user.controller'), module.controller);
  assert.equal(require('../routes/user.route'), module.router);
  const routes = module.router.stack.filter((layer) => layer.route).map((layer) => [layer.route.path, Object.keys(layer.route.methods)[0]]);
  assert.deepEqual(routes, [['/', 'get'], ['/:id', 'get'], ['/:id', 'patch'], ['/:id/status', 'put'], ['/:id/role', 'put'], ['/:id', 'delete']]);
  assert.equal(routes.filter(([path]) => path === '/:id/status').length, 1);
  const injected = createUserModule({ repository: {}, guards: { authenticate() {}, authorize: () => () => {} }, validation: { validate() {} }, validators: {
    userListValidator: [], userIdValidator: [], updateUserProfileValidator: [], updateUserStatusValidator: [], updateUserRoleValidator: [],
  } });
  assert.notEqual(injected.service, module.service);
});
