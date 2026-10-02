const test = require('node:test');
const assert = require('node:assert/strict');
const roleService = require('../services/role.service');
const { Role } = require('../models');

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
