const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createUserModule } = require('../modules/user');
const { createRoleModule } = require('../modules/role');
const validate = require('../middlewares/validate.middleware');

async function withServer(app, run) {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

const guards = {
  authenticate(req, _res, next) { req.user = { id: 1, role: { name: req.headers['x-test-role'] || 'admin' } }; next(); },
  authorize() { return (req, res, next) => req.user.role.name === 'admin' ? next() : res.sendStatus(403); },
};

test('User HTTP routes use injected controller context, keep Admin gate and validation', async () => {
  const calls = [];
  const service = {
    async getAllUsers(query) { calls.push(['list', query.page]); return { total: 1, page: query.page || 1, limit: 20, data: [{ id: 7 }] }; },
    async updateUserProfile(id, profile) { calls.push(['profile', id, profile.full_name]); return { id: 7, full_name: profile.full_name, phone: null }; },
    async updateUserStatus(id, status, actorId) { calls.push(['status', id, status, actorId]); return { id: 7, status }; },
    async getUserById() {}, async updateUserRole() {}, async deleteUser() {},
  };
  const module = createUserModule({ service, guards, validation: { validate }, validators: require('../validators/user.validator') });
  const app = express(); app.use(express.json()); app.use('/users', module.router);
  await withServer(app, async (base) => {
    const list = await fetch(`${base}/users?page=2`);
    assert.equal(list.status, 200);
    assert.equal((await list.json()).data[0].id, 7);
    const profile = await fetch(`${base}/users/7`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: 'Updated Name' }) });
    assert.equal(profile.status, 200);
    assert.equal((await profile.json()).data.full_name, 'Updated Name');
    const forbiddenProfile = await fetch(`${base}/users/7`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-test-role': 'customer' },
      body: JSON.stringify({ full_name: 'Forbidden Name' }) });
    assert.equal(forbiddenProfile.status, 403);
    const unsafeProfile = await fetch(`${base}/users/7`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: 'Unsafe Name', role_id: 3 }) });
    assert.equal(unsafeProfile.status, 422);
    const update = await fetch(`${base}/users/7/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'locked' }) });
    assert.equal(update.status, 200);
    const forbidden = await fetch(`${base}/users`, { headers: { 'x-test-role': 'staff' } });
    assert.equal(forbidden.status, 403);
    const invalid = await fetch(`${base}/users/7/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'unsupported' }) });
    assert.equal(invalid.status, 422);
    assert.deepEqual(calls, [['list', '2'], ['profile', '7', 'Updated Name'], ['status', '7', 'locked', 1]]);
  });
});

test('Role HTTP routes use injected controller context, keep Admin gate and response status', async () => {
  const calls = [];
  const service = {
    async getAllRoles() { calls.push('list'); return [{ id: 3, name: 'admin' }]; },
    async createRole(values) { calls.push(['create', values.name]); return { id: 4, name: values.name }; },
    async getRoleById() {}, async updateRole() {}, async deleteRole() {},
  };
  const module = createRoleModule({ service, guards, validation: { validate }, validators: require('../validators/role.validator') });
  const app = express(); app.use(express.json()); app.use('/roles', module.router);
  await withServer(app, async (base) => {
    const list = await fetch(`${base}/roles`);
    assert.equal(list.status, 200);
    assert.equal((await list.json()).data[0].name, 'admin');
    const create = await fetch(`${base}/roles`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'auditor' }) });
    assert.equal(create.status, 201);
    const forbidden = await fetch(`${base}/roles`, { headers: { 'x-test-role': 'customer' } });
    assert.equal(forbidden.status, 403);
    assert.deepEqual(calls, ['list', ['create', 'auditor']]);
  });
});
