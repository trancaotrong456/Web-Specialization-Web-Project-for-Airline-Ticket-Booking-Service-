const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { SequelizeFareClassRepository } = require('../modules/fare-class/fareClass.repository');
const FareClassService = require('../modules/fare-class/fareClass.service');
const FareClassController = require('../modules/fare-class/fareClass.controller');
const { createFareClassModule, getDefaultFareClassModule } = require('../modules/fare-class');
const { buildContainer } = require('../application/buildContainer');
const validators = require('../validators/fareClass.validator');
const validate = require('../middlewares/validate.middleware');

test('FareClass repository preserves price ordering, Flight association and Booking count options', async () => {
  const calls = [];
  const instance = { update: async (data) => { calls.push(['update', data]); return data; }, destroy: async () => { calls.push(['destroy']); } };
  const repository = new SequelizeFareClassRepository({
    FareClass: {
      findAll: async (options) => { calls.push(['findAll', options]); return [instance]; },
      findByPk: async (id, options) => { calls.push(['findByPk', id, options]); return instance; },
      create: async (data) => { calls.push(['create', data]); return instance; },
    },
    Flight: { findByPk: async (id) => { calls.push(['flight', id]); return { id }; } },
    Booking: { count: async (options) => { calls.push(['count', options]); return 0; } },
  });
  assert.deepEqual(await repository.findByFlight('8'), [instance]);
  assert.equal(await repository.findById('3'), instance);
  assert.deepEqual(await repository.findFlightById('8'), { id: '8' });
  assert.equal(await repository.countBookingsByFareClassId('3'), 0);
  await repository.create({ flight_id: 8 });
  await repository.update(instance, { price: 100 });
  await repository.delete(instance);
  assert.deepEqual(calls, [
    ['findAll', { where: { flight_id: '8' }, order: [['price', 'ASC']] }],
    ['findByPk', '3', { include: [{ model: repository.Flight, as: 'flight' }] }],
    ['flight', '8'], ['count', { where: { fare_class_id: '3' } }],
    ['create', { flight_id: 8 }], ['update', { price: 100 }], ['destroy'],
  ]);
});

test('FareClass service preserves normalization, nullable quota and 409 booking protection', async () => {
  const calls = [];
  let bookings = 1;
  const fare = { update: async (value) => value };
  const service = new FareClassService({ repository: {
    findByFlight: async () => [],
    findById: async () => fare,
    findFlightById: async () => ({ id: 8 }),
    create: async (value) => { calls.push(['create', value]); return value; },
    update: async (_instance, value) => { calls.push(['update', value]); return value; },
    countBookingsByFareClassId: async (id) => { calls.push(['count', id]); return bookings; },
    delete: async () => { calls.push(['delete']); },
  } });
  assert.deepEqual(await service.create({ flight_id: '8', class_name: ' Economy ', price: '250.5' }), {
    flight_id: 8, class_name: 'Economy', price: 250.5, seat_quota: null,
  });
  assert.deepEqual(await service.update('3', { seat_quota: null, price: '300' }), { seat_quota: null, price: 300 });
  await assert.rejects(service.update('3', { flight_id: 9 }), (error) => error.statusCode === 400);
  await assert.rejects(service.delete('3'), (error) => error.statusCode === 409);
  bookings = 0;
  assert.deepEqual(await service.delete('3'), { message: 'Fare class deleted' });
  assert.deepEqual(calls, [
    ['create', { flight_id: 8, class_name: 'Economy', price: 250.5, seat_quota: null }],
    ['update', { price: 300, seat_quota: null }], ['count', '3'], ['count', '3'], ['delete'],
  ]);
});

test('FareClass getByFlight retains its async service contract for direct callers', async () => {
  const rows = [{ id: 1 }];
  const service = new FareClassService({ repository: { findByFlight: () => rows } });
  const result = service.getByFlight('8');
  assert.ok(result instanceof Promise);
  assert.deepEqual(await result, rows);
});

test('FareClass module preserves route order, middleware identity and bound controller context', async () => {
  const methods = ['getByFlight', 'getById', 'create', 'update', 'delete'];
  const controller = Object.fromEntries(methods.map((method) => [method, function (_req, res, next) {
    if (this !== controller) return next(new Error('controller binding lost'));
    return res.json({ ok: true });
  }]));
  const authenticate = () => {};
  const roles = [];
  const authorizers = [];
  const guards = { authenticate, authorize: (...names) => { roles.push(names); const guard = () => {}; authorizers.push(guard); return guard; } };
  const module = createFareClassModule({ controller, guards, validation: { validate }, validators });
  const routes = module.router.stack.filter((layer) => layer.route).map((layer) => layer.route);
  assert.deepEqual(routes.map((route) => [route.path, Object.keys(route.methods)[0]]), [
    ['/flight/:flightId', 'get'], ['/:id', 'get'], ['/', 'post'], ['/:id', 'put'], ['/:id', 'delete'],
  ]);
  assert.deepEqual(roles, [['admin', 'staff'], ['admin', 'staff'], ['admin']]);
  assert.equal(routes[0].stack[0].handle, validators.flightIdParamValidator[0]);
  assert.equal(routes[0].stack[1].handle, validate);
  assert.equal(routes[2].stack[0].handle, authenticate);
  assert.equal(routes[2].stack[2].handle, validators.createFareClassValidator[0]);
  assert.equal(routes[4].stack[1].handle, authorizers[2]);
  const app = express();
  app.use('/fare-classes', module.router);
  const server = await new Promise((resolve) => { const opened = app.listen(0, '127.0.0.1', () => resolve(opened)); });
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/fare-classes/flight/8`);
    assert.equal(response.status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('FareClass legacy adapters and Composition Root share one canonical module once', () => {
  const module = getDefaultFareClassModule();
  const container = buildContainer();
  assert.equal(require('../services/fareClass.service'), module.service);
  assert.equal(require('../controllers/fareClass.controller'), module.controller);
  assert.equal(require('../routes/fareClass.route'), module.router);
  assert.equal(container.fareClassModule, module);
  assert.equal(container.apiRouter.stack.filter((layer) => layer.handle === module.router).length, 1);
  const injected = createFareClassModule({ controller: module.controller, guards: { authenticate() {}, authorize: () => () => {} }, validation: { validate }, validators });
  const different = buildContainer({ fareClassModule: injected });
  assert.equal(different.apiRouter.stack.filter((layer) => layer.handle === injected.router).length, 1);
});

test('FareClass controller forwards errors to Express next', async () => {
  const error = new Error('query failed');
  const controller = new FareClassController({ service: { getById: async () => { throw error; } } });
  let caught;
  await controller.getById({ params: { id: '1' } }, {}, (value) => { caught = value; });
  assert.equal(caught, error);
});
