const test = require('node:test');
const assert = require('node:assert/strict');
const { SequelizeFlightRepository } = require('../modules/flight/flight.repository');
const FlightService = require('../modules/flight/flight.service');
const { createFlightModule, getDefaultFlightModule } = require('../modules/flight');
const { buildContainer } = require('../application/buildContainer');
const validators = require('../validators/flight.validator');
const validate = require('../middlewares/validate.middleware');

test('Flight repository preserves scheduled search filters, distinct count, association projections and UTC window', async () => {
  const gte = Symbol('gte'); const lt = Symbol('lt');
  const calls = [];
  const models = {
    Flight: { findAndCountAll: async (options) => { calls.push(options); return { count: 1, rows: [{ id: 1 }] }; } },
    Airline: {}, Airport: {}, FareClass: {}, Booking: {}, sequelize: { transaction() {} }, Op: { gte, lt },
  };
  const repository = new SequelizeFlightRepository(models);
  const dateStart = new Date('2026-10-12T17:00:00.000Z');
  const dateEnd = new Date('2026-10-13T17:00:00.000Z');
  await repository.searchPage({ departure_airport_id: '1', arrival_airport_id: '2', airline_id: '9', min_seats: '3', dateStart, dateEnd, page: '2', limit: '7' });
  assert.deepEqual(calls[0], {
    where: { status: 'scheduled', departure_airport_id: '1', arrival_airport_id: '2', airline_id: '9', available_seats: { [gte]: 3 }, departure_time: { [gte]: dateStart, [lt]: dateEnd } },
    distinct: true, limit: 7, offset: 7, order: [['departure_time', 'ASC']],
    include: [
      { model: models.Airline, as: 'airline', attributes: ['id', 'name', 'iata_code', 'logo_url'] },
      { model: models.Airport, as: 'departureAirport', attributes: ['id', 'name', 'iata_code', 'city', 'country'] },
      { model: models.Airport, as: 'arrivalAirport', attributes: ['id', 'name', 'iata_code', 'city', 'country'] },
      { model: models.FareClass, as: 'fareClasses', attributes: ['id', 'class_name', 'price', 'seat_quota'] },
    ],
  });
  await repository.findAdminPage({ page: 1, limit: 20, status: 'cancelled' });
  assert.deepEqual(calls[1].where, { status: 'cancelled' });
  assert.equal(calls[1].distinct, true);
  assert.deepEqual(calls[1].include[3], { model: models.FareClass, as: 'fareClasses', attributes: ['id', 'class_name', 'price'] });
});

test('Flight status repository locks the flight and writes/reads history through the caller transaction', async () => {
  const calls = [];
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  const history = { findAll: async (options) => { calls.push(['history.findAll', options]); return []; }, create: async (values, options) => calls.push(['history.create', values, options]) };
  const repository = new SequelizeFlightRepository({
    sequelize: { transaction: async (work) => work(transaction) },
    Flight: { findByPk: async (id, options) => { calls.push(['Flight.findByPk', id, options]); return { id }; } },
    FlightStatusHistory: history, User: {}, Booking: {}, FareClass: {}, Airline: {}, Airport: {}, Op: {},
  });
  await repository.transaction(async (tx) => {
    await repository.findFlightForStatusUpdate(9, tx);
    await repository.createStatusHistory({ flight_id: 9, to_status: 'delayed' }, tx);
  });
  await repository.findStatusHistory(9);
  assert.deepEqual(calls[0], ['Flight.findByPk', 9, { lock: 'UPDATE', transaction }]);
  assert.deepEqual(calls[1], ['history.create', { flight_id: 9, to_status: 'delayed' }, { transaction }]);
  assert.equal(calls[2][1].where.flight_id, 9);
  assert.deepEqual(calls[2][1].order, [['created_at', 'DESC'], ['id', 'DESC']]);
  assert.deepEqual(calls[2][1].include, [{ model: {}, as: 'actor', attributes: ['id', 'full_name'] }]);
});

test('Flight search translates Vietnam day to UTC and preserves raw pagination', async () => {
  let query;
  const service = new FlightService({ repository: { searchPage: async (value) => { query = value; return { count: 1, rows: [{ id: 1 }] }; } }, getIO: () => { throw Error('not initialized'); } });
  assert.deepEqual(await service.searchFlights({ departure_airport_id: '1', arrival_airport_id: '2', airline_id: '9', departure_date: '2026-10-13', min_seats: '3', page: '2', limit: '7' }), {
    total: 1, page: '2', limit: '7', data: [{ id: 1 }],
  });
  assert.equal(query.dateStart.toISOString(), '2026-10-12T17:00:00.000Z');
  assert.equal(query.dateEnd.toISOString(), '2026-10-13T17:00:00.000Z');
  assert.equal(query.departure_airport_id, '1');
  assert.equal(query.airline_id, '9');
  assert.equal(query.min_seats, '3');
});

test('Flight delete propagates one transaction, row lock and operation order', async () => {
  const events = [];
  const transaction = { LOCK: { UPDATE: Symbol('update') } };
  const flight = { destroy: async () => { throw new Error('repository must own destroy'); } };
  const repository = {
    transaction: async (work) => { events.push('begin'); const result = await work(transaction); events.push('commit'); return result; },
    findById: async (id, options) => { events.push(['findById', id, options]); return flight; },
    countBookings: async (id, tx) => { events.push(['countBookings', id, tx]); return 0; },
    deleteFareClasses: async (id, tx) => { events.push(['deleteFareClasses', id, tx]); },
    deleteFlight: async (instance, tx) => { events.push(['deleteFlight', instance, tx]); },
  };
  const service = new FlightService({ repository, getIO: () => {} });
  assert.deepEqual(await service.deleteFlight('8'), { message: 'Flight deleted successfully' });
  assert.deepEqual(events, ['begin', ['findById', '8', { lock: transaction.LOCK.UPDATE, transaction }], ['countBookings', '8', transaction], ['deleteFareClasses', '8', transaction], ['deleteFlight', flight, transaction], 'commit']);
});

test('Flight delete rejects booked flights and rolls back without deleting fares or flight', async () => {
  const events = [];
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  const repository = {
    transaction: async (work) => { try { return await work(transaction); } catch (error) { events.push('rollback'); throw error; } },
    findById: async () => ({ id: 8 }),
    countBookings: async (_id, tx) => { assert.equal(tx, transaction); events.push('count'); return 1; },
    deleteFareClasses: async () => { events.push('fare delete'); },
    deleteFlight: async () => { events.push('flight delete'); },
  };
  const service = new FlightService({ repository, getIO: () => {} });
  await assert.rejects(service.deleteFlight('8'), (error) => error.statusCode === 409);
  assert.deepEqual(events, ['count', 'rollback']);
});

test('Flight delete rolls back when fare-class deletion fails before flight destruction', async () => {
  const calls = [];
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  const repository = {
    transaction: async (work) => { try { return await work(transaction); } catch (error) { calls.push('rollback'); throw error; } },
    findById: async (_id, options) => { assert.equal(options.transaction, transaction); return { id: 8 }; },
    countBookings: async (_id, tx) => { assert.equal(tx, transaction); return 0; },
    deleteFareClasses: async (_id, tx) => { assert.equal(tx, transaction); calls.push('fare delete'); throw new Error('FK failure'); },
    deleteFlight: async () => { calls.push('flight delete'); },
  };
  const service = new FlightService({ repository });
  await assert.rejects(service.deleteFlight('8'), /FK failure/);
  assert.deepEqual(calls, ['fare delete', 'rollback']);
});

test('Flight Sequelize repository uses one transaction and deletes FareClasses before Flight', async () => {
  const calls = [];
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  const flight = { destroy: async (options) => { calls.push(['flight.destroy', options]); } };
  const repository = new SequelizeFlightRepository({
    sequelize: { transaction: async (work) => { calls.push('transaction'); return work(transaction); } },
    Flight: { findByPk: async (id, options) => { calls.push(['findByPk', id, options]); return flight; } },
    Booking: { count: async (options) => { calls.push(['Booking.count', options]); return 0; } },
    FareClass: { destroy: async (options) => { calls.push(['FareClass.destroy', options]); } },
    Airline: {}, Airport: {}, Op: {},
  });
  const service = new FlightService({ repository });
  assert.deepEqual(await service.deleteFlight('8'), { message: 'Flight deleted successfully' });
  assert.deepEqual(calls, [
    'transaction', ['findByPk', '8', { lock: 'UPDATE', transaction }],
    ['Booking.count', { where: { flight_id: '8' }, transaction }],
    ['FareClass.destroy', { where: { flight_id: '8' }, transaction }],
    ['flight.destroy', { transaction }],
  ]);
});

test('Flight update and seat warning retain room, event names and payloads', async () => {
  const originalThreshold = process.env.SEAT_WARNING_THRESHOLD;
  process.env.SEAT_WARNING_THRESHOLD = '5';
  const events = [];
  const flight = { id: 8, departure_time: '2026-10-13T10:00:00Z', arrival_time: '2026-10-13T12:00:00Z', actual_departure_time: null, actual_arrival_time: null, status_reason: null, status: 'scheduled', available_seats: 3 };
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  const repository = {
    findById: async () => flight,
    update: async (_instance, value) => Object.assign(flight, value),
    findDetail: async () => flight,
    transaction: async (work) => work(transaction),
    findFlightForStatusUpdate: async (_id, tx) => { assert.equal(tx, transaction); return flight; },
    createStatusHistory: async () => {},
    findSeatSnapshot: async (_id) => ({ id: 8, available_seats: 3 }),
  };
  const io = { to(room) { return { emit(name, payload) { events.push([room, name, payload]); } }; } };
  const service = new FlightService({ repository, getIO: () => io });
  try {
    await service.updateFlight('8', { status: 'cancelled', reason: 'Safety' });
    await service.checkAndEmitSeatWarning('8');
    assert.deepEqual(events, [
      ['flight_8', 'flight_updated', { flight_id: 8, status: 'cancelled', available_seats: 3, departure_time: new Date('2026-10-13T10:00:00Z'), arrival_time: new Date('2026-10-13T12:00:00Z'), actual_departure_time: null, actual_arrival_time: null, status_reason: 'Safety' }],
      ['flight_8', 'seat-warning', { flightId: 8, availableSeats: 3, message: 'Chỉ còn 3 ghế!' }],
    ]);
  } finally {
    if (originalThreshold === undefined) delete process.env.SEAT_WARNING_THRESHOLD;
    else process.env.SEAT_WARNING_THRESHOLD = originalThreshold;
  }
});

test('Flight module and legacy adapters share canonical service used by Booking and Payment', () => {
  const module = getDefaultFlightModule();
  const container = buildContainer();
  assert.equal(require('../services/flight.service'), module.service);
  assert.equal(require('../controllers/flight.controller'), module.controller);
  assert.equal(require('../routes/flight.route'), module.router);
  assert.equal(container.flightModule, module);
  assert.equal(container.apiRouter.stack.filter((layer) => layer.handle === module.router).length, 1);
  assert.equal(typeof module.service.checkAndEmitSeatWarning, 'function');
  const injected = createFlightModule({ controller: module.controller, guards: { authenticate() {}, authorize: () => () => {} }, validation: { validate }, validators });
  assert.equal(buildContainer({ flightModule: injected }).apiRouter.stack.filter((layer) => layer.handle === injected.router).length, 1);
});

test('Flight module constructs one injected graph and preserves exact route order and middleware placement', () => {
  const repository = {};
  const authenticate = () => {};
  const roles = [];
  const authorizers = [];
  const module = createFlightModule({ repository, guards: {
    authenticate,
    authorize(...names) { roles.push(names); const guard = () => {}; authorizers.push(guard); return guard; },
  }, validation: { validate }, validators });
  const routes = module.router.stack.filter((layer) => layer.route).map((layer) => layer.route);
  assert.equal(module.service.repository, repository);
  assert.equal(module.controller.service, module.service);
  assert.deepEqual(routes.map((route) => [route.path, Object.keys(route.methods)[0]]), [
    ['/search', 'get'], ['/status/:id', 'get'], ['/status/:id', 'patch'], ['/:id', 'get'], ['/', 'get'], ['/', 'post'],
    ['/:id', 'put'], ['/:id/cancel', 'put'], ['/:id', 'delete'],
  ]);
  assert.deepEqual(roles, [['admin'], ['admin', 'staff'], ['admin'], ['admin', 'staff'], ['admin', 'staff'], ['admin']]);
  assert.equal(routes[0].stack[0].handle, validators.searchFlightValidator[0]);
  assert.equal(routes[0].stack.at(-2).handle, validate);
  assert.equal(routes[1].stack.at(-2).handle, validate);
  assert.equal(routes[2].stack[0].handle, authenticate);
  assert.equal(routes[2].stack[1].handle, authorizers[0]);
  assert.equal(routes[2].stack.at(-2).handle, validate);
  assert.equal(routes[4].stack[0].handle, authenticate);
  assert.equal(routes[4].stack[1].handle, authorizers[1]);
  assert.equal(routes[5].stack[0].handle, authenticate);
  assert.equal(routes[5].stack[1].handle, authorizers[2]);
  assert.equal(routes[5].stack.at(-2).handle, validate);
});
