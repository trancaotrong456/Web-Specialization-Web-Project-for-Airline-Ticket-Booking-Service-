const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const authorize = require('../middlewares/rbac.middleware');
const { createAirportModule } = require('../modules/airport');
const createErrorFilter = require('../shared/http/filters/createErrorFilter');
const createErrorHandlerAdapter = require('../shared/http/filters/errorHandlerAdapter');
const ApiResponse = require('../utils/apiResponse');

const listen = async (app) => {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  return { server, url: `http://127.0.0.1:${server.address().port}/api/v1/airports` };
};

test('DI-created Airport HTTP routes preserve public reads, Admin-only writes, responses and errors', async () => {
  const saved = { id: 9, name: 'Test Airport', iata_code: 'TST', city: 'Test City' };
  const repository = {
    async findPage() { return { count: 1, rows: [saved] }; },
    async findById(id) { return id === '404' ? null : saved; },
    async create(data) { return { ...data, id: 10 }; },
    async update(_airport, data) { return { ...saved, ...data }; },
    async delete() {
      const error = new Error('foreign key');
      error.name = 'SequelizeForeignKeyConstraintError';
      throw error;
    },
  };
  const authenticate = (req, res, next) => {
    const role = req.get('x-test-role');
    if (!role) return ApiResponse.error(res, 'Authentication token missing or invalid format', 401);
    req.user = { role: { name: role } };
    next();
  };
  const module = createAirportModule({ repository, guards: { authenticate, authorize } });
  const app = express();
  app.use(express.json());
  app.use('/api/v1/airports', module.router);
  app.use(createErrorHandlerAdapter({
    filter: createErrorFilter(), apiResponse: ApiResponse, logger: { error() {} },
  }));
  const { server, url } = await listen(app);

  try {
    const list = await fetch(`${url}?page=2&limit=10&search=Hanoi`);
    assert.equal(list.status, 200);
    assert.deepEqual(await list.json(), {
      success: true, message: 'Success', data: [saved],
      pagination: { total: 1, page: 2, limit: 10, totalPages: 1, hasNextPage: false, hasPrevPage: true },
    });

    const detail = await fetch(`${url}/9`);
    assert.equal(detail.status, 200);
    assert.deepEqual((await detail.json()).data, saved);
    const missing = await fetch(`${url}/404`);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { success: false, message: 'Airport not found' });

    const unauthorized = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(unauthorized.status, 401);
    const forbidden = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-role': 'staff' }, body: JSON.stringify({ name: 'Nope' }),
    });
    assert.equal(forbidden.status, 403);
    const created = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-role': 'admin' },
      body: JSON.stringify({ name: 'Raw Airport', city: 'Raw City' }),
    });
    assert.equal(created.status, 201);
    assert.deepEqual((await created.json()).data, { name: 'Raw Airport', city: 'Raw City', id: 10 });

    const updated = await fetch(`${url}/9`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-test-role': 'admin' },
      body: JSON.stringify({ city: 'Updated City' }),
    });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).message, 'Airport updated');

    const fkDelete = await fetch(`${url}/9`, { method: 'DELETE', headers: { 'x-test-role': 'admin' } });
    assert.equal(fkDelete.status, 400);
    assert.deepEqual(await fkDelete.json(), { success: false, message: 'Invalid referenced resource ID' });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
