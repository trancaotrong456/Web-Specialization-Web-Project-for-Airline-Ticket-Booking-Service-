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
  let searchedWith;
  const repository = {
    searchPage: async (filters) => { searchedWith = filters; return { count: 1, rows: [flight] }; },
    findDetail: async (id) => id === '404' ? null : flight,
    findStatusHistory: async () => history,
    findFlightForStatusUpdate: async (id, transaction) => id === '404' ? null : flight,
    createStatusHistory: async (entry) => { history.push({ ...entry, id: history.length + 1, created_at: new Date(), actor: { id: 4, full_name: 'Admin' } }); },
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
  const history = [];
  const authenticate = (req, res, next) => {
    const role = req.get('x-test-role');
    if (!role) return ApiResponse.error(res, 'Authentication token missing or invalid format', 401);
    req.user = { id: 4, role: { name: role } };
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
    const search = await fetch(`${url}/search?departure_airport_id=1&arrival_airport_id=2&airline_id=9`);
    assert.equal(search.status, 200);
    assert.equal((await search.json()).message, 'Flights retrieved successfully');
    assert.equal(searchedWith.airline_id, '9');
    assert.equal((await fetch(`${url}/404`)).status, 404);
    assert.equal((await fetch(`${url}/status/8`)).status, 200);
    assert.equal((await fetch(`${url}/search?min_seats=-1`)).status, 422);
    assert.equal((await fetch(`${url}/search?airline_id=not-a-number`)).status, 422);
    assert.equal((await fetch(url)).status, 401);
    assert.equal((await fetch(url, { headers: headers('staff') })).status, 200);
    const createBody = { airline_id: 1, departure_airport_id: 2, arrival_airport_id: 3, departure_time: '2099-10-13T10:00:00Z', arrival_time: '2099-10-13T12:00:00Z', total_seats: 10 };
    const post = (role) => fetch(url, { method: 'POST', headers: headers(role), body: JSON.stringify(createBody) });
    assert.equal((await post('staff')).status, 403);
    assert.equal((await post('admin')).status, 201);
    assert.equal((await fetch(`${url}/status/8`, { method: 'PATCH', headers: headers('staff'), body: JSON.stringify({ status: 'delayed', reason: 'Weather' }) })).status, 403);
    const update = await fetch(`${url}/status/8`, { method: 'PATCH', headers: headers('admin'), body: JSON.stringify({ status: 'delayed', departure_time: '2099-10-13T11:00:00Z', reason: 'Weather' }) });
    assert.equal(update.status, 200);
    assert.equal((await update.json()).message, 'Flight status updated');
    assert.equal(history.length, 1);
    assert.equal(history[0].actor_user_id, 4);
    const invalid = await fetch(`${url}/status/8`, { method: 'PATCH', headers: headers('admin'), body: JSON.stringify({ status: 'takeoff' }) });
    assert.equal(invalid.status, 422);
    const cancel = await fetch(`${url}/8/cancel`, { method: 'PUT', headers: headers('staff'), body: JSON.stringify({ reason: 'Operational safety' }) });
    assert.equal(cancel.status, 200);
    assert.equal((await cancel.json()).message, 'Flight cancelled');
    assert.equal(history.length, 2);
    assert.equal((await fetch(`${url}/status/8`)).status, 200);
    assert.equal((await fetch(`${url}/8`, { method: 'DELETE', headers: headers('staff') })).status, 403);
    assert.equal((await fetch(`${url}/8`, { method: 'DELETE', headers: headers('admin') })).status, 200);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
