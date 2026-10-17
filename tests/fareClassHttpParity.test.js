const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const authorize = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const validators = require('../validators/fareClass.validator');
const { createFareClassModule } = require('../modules/fare-class');
const ApiResponse = require('../utils/apiResponse');
const createErrorFilter = require('../shared/http/filters/createErrorFilter');
const createErrorHandlerAdapter = require('../shared/http/filters/errorHandlerAdapter');

test('FareClass HTTP contract preserves public reads, validation, Staff writes and Admin-only delete', async () => {
  const fare = { id: 3, flight_id: 8, class_name: 'Economy', price: 100, seat_quota: null };
  const repository = {
    findByFlight: async () => [fare],
    findById: async (id) => id === '404' ? null : fare,
    findFlightById: async () => ({ id: 8 }),
    create: async (data) => ({ id: 4, ...data }),
    update: async (_instance, data) => ({ ...fare, ...data }),
    countBookingsByFareClassId: async () => 0,
    delete: async () => {},
  };
  const authenticate = (req, res, next) => {
    const role = req.get('x-test-role');
    if (!role) return ApiResponse.error(res, 'Authentication token missing or invalid format', 401);
    req.user = { role: { name: role } };
    next();
  };
  const module = createFareClassModule({ repository, guards: { authenticate, authorize }, validation: { validate }, validators });
  const app = express();
  app.use(express.json());
  app.use('/api/v1/fare-classes', module.router);
  app.use(createErrorHandlerAdapter({ filter: createErrorFilter(), apiResponse: ApiResponse, logger: { error() {} } }));
  const server = await new Promise((resolve) => { const opened = app.listen(0, '127.0.0.1', () => resolve(opened)); });
  const url = `http://127.0.0.1:${server.address().port}/api/v1/fare-classes`;
  try {
    const list = await fetch(`${url}/flight/8`);
    assert.equal(list.status, 200);
    assert.deepEqual((await list.json()).data, [fare]);
    assert.equal((await fetch(`${url}/3`)).status, 200);
    assert.equal((await fetch(`${url}/404`)).status, 404);
    assert.equal((await fetch(`${url}/flight/not-a-number`)).status, 422);
    const data = { flight_id: 8, class_name: ' Business ', price: '250', seat_quota: null };
    const post = (role) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(role ? { 'x-test-role': role } : {}) }, body: JSON.stringify(data) });
    assert.equal((await post()).status, 401);
    assert.equal((await post('customer')).status, 403);
    const created = await post('staff');
    assert.equal(created.status, 201);
    assert.deepEqual((await created.json()).data, { id: 4, flight_id: 8, class_name: 'Business', price: 250, seat_quota: null });
    const update = await fetch(`${url}/3`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-test-role': 'staff' }, body: JSON.stringify({ price: '300' }) });
    assert.equal(update.status, 200);
    assert.equal((await update.json()).data.price, 300);
    const invalidUpdate = await fetch(`${url}/3`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-test-role': 'admin' }, body: JSON.stringify({ flight_id: 9 }) });
    assert.equal(invalidUpdate.status, 422);
    assert.equal((await fetch(`${url}/3`, { method: 'DELETE', headers: { 'x-test-role': 'staff' } })).status, 403);
    assert.equal((await fetch(`${url}/3`, { method: 'DELETE', headers: { 'x-test-role': 'admin' } })).status, 200);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
