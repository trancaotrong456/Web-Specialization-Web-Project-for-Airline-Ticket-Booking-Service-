'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { demoUsers, seedUsers } = require('./UserSeeder');
const { runDemoSeed } = require('./DatabaseSeeder');

test('UserSeeder keeps all three agreed local demo accounts easy to inspect', () => {
  assert.deepEqual(demoUsers.map(({ full_name, email, password, role, status }) => [full_name, email, password, role, status]), [
    ['Demo Admin', 'admin@airline-booking.local', 'DemoAdmin@2026!', 'admin', 'active'],
    ['Demo Staff', 'staff.demo@airline-booking.local', 'DemoStaff@2026!', 'staff', 'active'],
    ['Demo Customer', 'customer.demo@airline-booking.local', 'DemoCustomer@2026!', 'customer', 'active'],
  ]);
});

test('UserSeeder hashes new demo users and never overwrites an existing account', async () => {
  const users = [{ id: 1, email: demoUsers[0].email, password_hash: 'existing-hash', role_id: 99, status: 'locked' }];
  const roles = { admin: { id: 10 }, staff: { id: 20 }, customer: { id: 30 } };
  const createInputs = [];
  const models = {
    User: {
      async findOne({ where }) { return users.find((user) => user.email === where.email) || null; },
      async create(values, options) {
        createInputs.push({ values, options });
        const created = { id: users.length + 1, ...values };
        users.push(created);
        return created;
      },
    },
  };
  const transaction = { id: 'outer-demo-transaction' };

  const result = await seedUsers({ models, transaction, roles });

  assert.deepEqual(result, { existing: 1, created: 2 });
  assert.equal(users.length, 3);
  assert.deepEqual(users[0], { id: 1, email: demoUsers[0].email, password_hash: 'existing-hash', role_id: 99, status: 'locked' });
  for (const input of createInputs) {
    assert.equal(input.options.transaction, transaction);
    assert.notEqual(input.values.password_hash, input.values.password);
    assert.equal(Object.hasOwn(input.values, 'password'), false);
    const fixture = demoUsers.find((user) => user.email === input.values.email);
    assert.equal(await bcrypt.compare(fixture.password, input.values.password_hash), true);
    assert.equal(input.values.role_id, roles[fixture.role].id);
    assert.equal(input.values.status, fixture.status);
  }
});

test('DatabaseSeeder exposes the single transactional demo entrypoint', () => {
  assert.equal(typeof runDemoSeed, 'function');
});
