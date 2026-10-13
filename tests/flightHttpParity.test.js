const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const authorize = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const validators = require('../validators/flight.validator');
const { createFlightModule } = require('../modules/flight');
const ApiResponse = require('../utils/apiResponse');
const createErrorFilter = require('../shared/http/filters/createErrorFilter');
const createErrorHandlerAdapter = require('../shared/http/filters/errorHandlerAdapter');

test('Flight HTTP routes preserve public search/detail, Staff operations, Admin create/delete and validation', async () => {
  const flight = { id: 8, departure_time: '2099-10-13T10:00:00Z', arrival_time: '2099-10-13T12:00:00Z', status: 'scheduled', available_seats: 10 };
  const tx = { LOCK: { UPDATE: 'UPDATE' } };
  const repository = {
    searchPage: async () => ({ count: 1, rows: [flight] }),
    findDetail: async (id) => id === '404' ? null : flight,
    findAdminPage: async () => ({ count: 1, rows: [flight] }),
    findById: async () => flight,
    findAirlineById: async () => ({ id: 1 }),
    findAirportById: async () => ({ id: 2 }),
    create: async () => flight,
    update: async (_instance, data) => Object.assign(flight, data),
    transaction: async (work) => work(tx),
    countBookings: async () => 0,
    deleteFareClasses: async () => {},
    deleteFlight: async () => {},
  };
  const authenticate = (req, res, next) => {
    const role = req.get('x-test-role');
    if (!role) return ApiResponse.error(res, 'Authentication token missing or invalid format', 401);
    req.user = { role: { name: role } };
    next();
  };
  const module = createFlightModule({ repository, getIO: () => { throw Error('not initialized'); }, guards: { authenticate, authorize }, validation: { validate }, validators });
  const app = express();
  app.use(express.json());
  app.use('/api/v1/flights', module.router);
  app.use(createErrorHandlerAdapter({ filter: createErrorFilter(), apiResponse: ApiResponse, logger: { error() {} } }));
  const server = await new Promise((resolve) => { const opened = app.listen(0, '127.0.0.1', () => resolve(opened)); });
  const url = `http://127.0.0.1:${server.address().port}/api/v1/flights`;
  const headers = (role) => ({ 'Content-Type': 'application/json', 'x-test-role': role });
  try {
    const search = await fetch(`${url}/search?departure_airport_id=1&arrival_airport_id=2`);
    assert.equal(search.status, 200);
    assert.equal((await search.json()).message, 'Flights retrieved successfully');
    assert.equal((await fetch(`${url}/404`)).status, 404);
    assert.equal((await fetch(`${url}/search?min_seats=-1`)).status, 422);
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { headers: headers('staff') })).status, 200);
    const createBody = { airline_id: 1, departure_airport_id: 2, arrival_airport_id: 3, departure_time: '2099-10-13T10:00:00Z', arrival_time: '2099-10-13T12:00:00Z', total_seats: 10 };
    const post = (role) => fetch(url, { method: 'POST', headers: headers(role), body: JSON.stringify(createBody) });
    assert.equal((await post('staff')).status, 403);
    assert.equal((await post('admin')).status, 201);
    const update = await fetch(`${url}/8`, { method: 'PUT', headers: headers('staff'), body: JSON.stringify({ status: 'completed' }) });
    assert.equal(update.status, 200);
    assert.equal((await update.json()).message, 'Flight updated successfully');
    const cancel = await fetch(`${url}/8/cancel`, { method: 'PUT', headers: headers('staff') });
    assert.equal(cancel.status, 200);
    assert.equal((await cancel.json()).message, 'Flight cancelled');
    assert.equal((await fetch(`${url}/8`, { method: 'DELETE', headers: headers('staff') })).status, 403);
    assert.equal((await fetch(`${url}/8`, { method: 'DELETE', headers: headers('admin') })).status, 200);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
