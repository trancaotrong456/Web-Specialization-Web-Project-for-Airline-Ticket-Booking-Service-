const test = require('node:test');
const assert = require('node:assert/strict');
const roleService = require('../services/role.service');
const { Role, User } = require('../models');

const expectedAttributes = [
  'id',
  'name',
  'description',
  'created_at',
  'updated_at',
];

test('role list uses the documented fields and deterministic ordering', async () => {
  const originalFindAll = Role.findAll;
  let receivedOptions;
  const rows = [
    { id: 1, name: 'customer' },
    { id: 2, name: 'staff' },
    { id: 3, name: 'admin' },
  ];
  Role.findAll = async (options) => {
    receivedOptions = options;
    return rows;
  };

  try {
    const result = await roleService.getAllRoles();
    assert.equal(result, rows);
    assert.deepEqual(receivedOptions.attributes, expectedAttributes);
    assert.deepEqual(receivedOptions.order, [['id', 'ASC']]);
  } finally {
    Role.findAll = originalFindAll;
  }
});

test('role detail uses the documented fields', async () => {
  const originalFindByPk = Role.findByPk;
  let receivedId;
  let receivedOptions;
  const role = { id: 3, name: 'admin' };
  Role.findByPk = async (id, options) => {
    receivedId = id;
    receivedOptions = options;
    return role;
  };

  try {
    assert.equal(await roleService.getRoleById(3), role);
    assert.equal(receivedId, 3);
    assert.deepEqual(receivedOptions.attributes, expectedAttributes);
  } finally {
    Role.findByPk = originalFindByPk;
  }
});

test('role detail reports a missing role as 404', async () => {
  const originalFindByPk = Role.findByPk;
  Role.findByPk = async () => null;

  try {
    await assert.rejects(
      roleService.getRoleById(999),
      (error) => error.statusCode === 404 && error.message === 'Role not found',
    );
  } finally {
    Role.findByPk = originalFindByPk;
  }
});

test('role creation normalizes its name and rejects duplicates', async () => {
  const originalFindOne = Role.findOne;
  const originalCreate = Role.create;
  let createdValues;
  Role.findOne = async () => null;
  Role.create = async (values) => {
    createdValues = values;
    return { id: 4, ...values };
  };

  try {
    await roleService.createRole({ name: 'SUPPORT_AGENT', description: 'Support' });
    assert.deepEqual(createdValues, {
      name: 'support_agent',
      description: 'Support',
    });

    Role.findOne = async () => ({ id: 4 });
    await assert.rejects(
      roleService.createRole({ name: 'support_agent' }),
      (error) => error.statusCode === 409,
    );
  } finally {
    Role.findOne = originalFindOne;
    Role.create = originalCreate;
  }
});

test('role update changes allowed fields and rejects a duplicate name', async () => {
  const originalFindByPk = Role.findByPk;
  const originalFindOne = Role.findOne;
  let updatedValues;
  const role = {
    id: 4,
    name: 'support',
    async update(values) {
      updatedValues = values;
      Object.assign(this, values);
    },
  };
  Role.findByPk = async () => role;
  Role.findOne = async () => null;

  try {
    assert.equal(
      await roleService.updateRole(4, { name: 'SUPPORT_AGENT', description: 'Agent' }),
      role,
    );
    assert.deepEqual(updatedValues, {
      name: 'support_agent',
      description: 'Agent',
    });

    role.name = 'support';
    Role.findOne = async () => ({ id: 5, name: 'admin' });
    await assert.rejects(
      roleService.updateRole(4, { name: 'admin' }),
      (error) => error.statusCode === 409,
    );
  } finally {
    Role.findByPk = originalFindByPk;
    Role.findOne = originalFindOne;
  }
});

test('role deletion is blocked while users are assigned', async () => {
  const originalFindByPk = Role.findByPk;
  const originalCount = User.count;
  let destroyed = false;
  Role.findByPk = async () => ({
    id: 3,
    async destroy() { destroyed = true; },
  });
  User.count = async () => 2;

  try {
    await assert.rejects(
      roleService.deleteRole(3),
      (error) => error.statusCode === 409 && error.message.includes('assigned'),
    );
    assert.equal(destroyed, false);
  } finally {
    Role.findByPk = originalFindByPk;
    User.count = originalCount;
  }
});

test('unassigned roles can be deleted', async () => {
  const originalFindByPk = Role.findByPk;
  const originalCount = User.count;
  let destroyed = false;
  Role.findByPk = async () => ({
    id: 7,
    async destroy() { destroyed = true; },
  });
  User.count = async () => 0;

  try {
    assert.deepEqual(await roleService.deleteRole(7), { id: 7 });
    assert.equal(destroyed, true);
  } finally {
    Role.findByPk = originalFindByPk;
    User.count = originalCount;
  }
});
