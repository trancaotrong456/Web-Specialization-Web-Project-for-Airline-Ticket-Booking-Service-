const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const authorize = require('../middlewares/rbac.middleware');
const { createSeatSelectionModule } = require('../modules/seat-selection');
const createErrorFilter = require('../shared/http/filters/createErrorFilter');
const createErrorHandlerAdapter = require('../shared/http/filters/errorHandlerAdapter');
const ApiResponse = require('../utils/apiResponse');

const listen = async (app) => {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  return { server, url: `http://127.0.0.1:${server.address().port}/api/v1/seat-selection` };
};

test('Seat Selection HTTP routes keep map reads public, protect template/map writes, and preserve response shapes', async () => {
  const calls = [];
  const service = {
    async listTemplates() { calls.push(['list']); return [{ id: 1 }]; },
    async createTemplate(body) { calls.push(['create', body]); return { id: 2, ...body }; },
    async updateTemplate(id, body) { calls.push(['update', id, body]); return { id: Number(id), ...body }; },
    async deleteTemplate(id) { calls.push(['delete', id]); return { message: 'Seat map template archived' }; },
    async assignTemplateToFlight(flightId, templateId, mapping) { calls.push(['assign', flightId, templateId, mapping]); return { flight_id: Number(flightId) }; },
    async getFlightMap(flightId) { calls.push(['map', flightId]); return { supported: false, flight_id: Number(flightId), seats: [] }; },
  };
  const authenticate = (req, res, next) => {
    const role = req.get('x-test-role');
    if (!role) return ApiResponse.error(res, 'Authentication token missing or invalid format', 401);
    req.user = { role: { name: role } };
    next();
  };
  const module = createSeatSelectionModule({ repository: {}, transactionManager: {}, service, guards: { authenticate, authorize } });
  const app = express();
  app.use(express.json());
  app.use('/api/v1/seat-selection', module.router);
  app.use(createErrorHandlerAdapter({ filter: createErrorFilter(), apiResponse: ApiResponse, logger: { error() {} } }));
  const { server, url } = await listen(app);
  const admin = { 'Content-Type': 'application/json', 'x-test-role': 'admin' };
  try {
    const publicMap = await fetch(`${url}/flights/17/map`);
    assert.equal(publicMap.status, 200);
    assert.deepEqual((await publicMap.json()).data, { supported: false, flight_id: 17, seats: [] });

    assert.equal((await fetch(`${url}/templates`)).status, 401);
    assert.equal((await fetch(`${url}/templates`, { headers: { 'x-test-role': 'staff' } })).status, 403);
    assert.equal((await fetch(`${url}/templates`, { headers: { 'x-test-role': 'admin' } })).status, 200);

    const template = { name: 'A320', aircraft_type: 'A320', layout: { row_count: 1, column_count: 1, aisle_after: [], seats: [] } };
    const created = await fetch(`${url}/templates`, { method: 'POST', headers: admin, body: JSON.stringify(template) });
    assert.equal(created.status, 201);
    assert.deepEqual((await created.json()).data, { id: 2, ...template });
    assert.equal((await fetch(`${url}/templates/2`, { method: 'PUT', headers: admin, body: JSON.stringify(template) })).status, 200);
    assert.equal((await fetch(`${url}/templates/2`, { method: 'DELETE', headers: { 'x-test-role': 'admin' } })).status, 200);
    assert.equal((await fetch(`${url}/flights/17/map`, { method: 'PUT', headers: admin, body: JSON.stringify({ template_id: 2, zone_fare_classes: { economy: 5 } }) })).status, 200);
    assert.deepEqual(calls.map(([operation]) => operation), ['map', 'list', 'create', 'update', 'delete', 'assign']);
    assert.deepEqual(calls.at(-1), ['assign', '17', 2, { economy: 5 }]);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
