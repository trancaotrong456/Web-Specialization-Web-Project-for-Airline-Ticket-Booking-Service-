const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const authorize = require('../middlewares/rbac.middleware');
const currentValidate = require('../middlewares/validate.middleware');
const validators = require('../validators/airline.validator');
const createValidationAdapter = require('../shared/http/validation/validationAdapter');
const { createAirlineModule } = require('../modules/airline');
const createErrorFilter = require('../shared/http/filters/createErrorFilter');
const createErrorHandlerAdapter = require('../shared/http/filters/errorHandlerAdapter');
const ApiResponse = require('../utils/apiResponse');

const listen = async (app) => {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  return {
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}/api/v1/airlines`,
  };
};

test('DI-created Airline HTTP handlers preserve responses, status, validation, and Admin RBAC', async () => {
  const repository = {
    async findPage() { return { count: 1, rows: [{ id: 1, name: 'Airline', iata_code: 'VN' }] }; },
    async findById(id) { return id === '404' ? null : { id: Number(id), name: 'Airline', iata_code: 'VN' }; },
    async findByIataCode() { return null; },
    async create(values) { return { id: 5, ...values }; },
    async update(airline, values) { return Object.assign(airline, values); },
    async countFlightsByAirlineId() { return 0; },
    async delete() {},
  };
  const authenticate = (req, _res, next) => {
    req.user = { role: { name: req.get('x-test-role') || 'staff' } };
    next();
  };
  const module = createAirlineModule({
    repository,
    guards: { authenticate, authorize },
    validation: { validate: createValidationAdapter(currentValidate) },
    validators,
  });
  const app = express();
  app.use(express.json());
  app.use('/api/v1/airlines', module.router);
  app.use(createErrorHandlerAdapter({
    filter: createErrorFilter(),
    apiResponse: ApiResponse,
    logger: { error() {} },
  }));
  const { server, baseUrl } = await listen(app);

  try {
    const list = await fetch(`${baseUrl}?page=1&limit=20`);
    assert.equal(list.status, 200);
    assert.deepEqual(await list.json(), {
      success: true,
      message: 'Success',
      data: [{ id: 1, name: 'Airline', iata_code: 'VN' }],
      pagination: { total: 1, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false },
    });

    const missing = await fetch(`${baseUrl}/404`);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { success: false, message: 'Airline not found' });

    const invalid = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-test-role': 'admin' },
      body: JSON.stringify({ name: 'x', iata_code: 'TOO-LONG' }),
    });
    assert.equal(invalid.status, 422);
    assert.equal((await invalid.json()).message, 'Validation error');

    const forbidden = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-test-role': 'staff' },
      body: JSON.stringify({ name: 'Airline', iata_code: 'VN' }),
    });
    assert.equal(forbidden.status, 403);

    const created = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-test-role': 'admin' },
      body: JSON.stringify({ name: 'New Airline', iata_code: 'NA' }),
    });
    assert.equal(created.status, 201);
    assert.deepEqual(await created.json(), {
      success: true,
      message: 'Airline created',
      data: { id: 5, name: 'New Airline', iata_code: 'NA', logo_url: null },
    });

    const updated = await fetch(`${baseUrl}/1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-test-role': 'admin' },
      body: JSON.stringify({ name: 'Updated Airline' }),
    });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).message, 'Airline updated');

    const deleted = await fetch(`${baseUrl}/1`, {
      method: 'DELETE',
      headers: { 'x-test-role': 'admin' },
    });
    assert.equal(deleted.status, 200);
    assert.equal((await deleted.json()).message, 'Airline deleted');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
