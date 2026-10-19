const test = require('node:test');
const assert = require('node:assert/strict');
const { createRoleModule, getDefaultRoleModule } = require('../modules/role');
const { SequelizeRoleRepository } = require('../modules/role/role.repository');
const RoleService = require('../modules/role/role.service');

test('Role repository preserves list projection and assigned-user count', async () => {
  let options;
  const Role = { findAll: async (value) => { options = value; return []; } };
  const User = { count: async (value) => { assert.deepEqual(value, { where: { role_id: 7 } }); return 2; } };
  const repository = new SequelizeRoleRepository({ Role, User });
  assert.deepEqual(await repository.findAll(), []);
  assert.deepEqual(options.order, [['id', 'ASC']]);
  assert.deepEqual(options.attributes, ['id', 'name', 'description', 'created_at', 'updated_at']);
  assert.equal(await repository.countAssignedUsers(7), 2);
});

test('Role service blocks deletion of an assigned custom role', async () => {
  let destroyed = false;
  const service = new RoleService({ repository: {
    findById: async () => ({ id: 7, name: 'custom' }),
    countAssignedUsers: async () => 1,
    delete: async () => { destroyed = true; },
  } });
  await assert.rejects(service.deleteRole(7), (error) => error.statusCode === 409);
  assert.equal(destroyed, false);
});

test('Role module keeps legacy identity, Admin-only middleware and route order', () => {
  const module = getDefaultRoleModule();
  assert.equal(require('../services/role.service'), module.service);
  assert.equal(require('../controllers/role.controller'), module.controller);
  assert.equal(require('../routes/role.route'), module.router);
  const routes = module.router.stack.filter((layer) => layer.route).map((layer) => [layer.route.path, Object.keys(layer.route.methods)[0]]);
  assert.deepEqual(routes, [['/', 'post'], ['/', 'get'], ['/:id', 'get'], ['/:id', 'put'], ['/:id', 'delete']]);
  const injected = createRoleModule({ repository: {}, guards: { authenticate() {}, authorize: () => () => {} }, validation: { validate() {} }, validators: {
    roleIdValidator: [], createRoleValidator: [], updateRoleValidator: [],
  } });
  assert.notEqual(injected.service, module.service);
});
