const test = require('node:test');
const assert = require('node:assert/strict');
const { validationResult } = require('express-validator');
const Sequelize = require('sequelize');
const { SequelizeFlightRepository } = require('../modules/flight/flight.repository');
const FlightService = require('../modules/flight/flight.service');
const { searchFlightValidator } = require('../validators/flight.validator');

async function validateQuery(query) {
  const req = { query };
  for (const middleware of searchFlightValidator) await middleware(req, {}, () => {});
  return validationResult(req).array();
}

test('Flight search applies fare, airline, seat, local-time and duration filters before distinct pagination', async () => {
  const calls = [];
  const { Op } = Sequelize;
  const repository = new SequelizeFlightRepository({
    sequelize: {},
    Flight: { findAndCountAll: async (options) => { calls.push(options); return { count: 1, rows: [{ id: 7 }] }; } },
    Airline: {}, Airport: {}, FareClass: {}, Booking: {}, Op,
  });

  await repository.searchPage({
    departure_airport_id: '1', arrival_airport_id: '2', airline_id: '9', min_seats: 2,
    dateStart: new Date('2026-10-12T17:00:00.000Z'), dateEnd: new Date('2026-10-13T17:00:00.000Z'),
    min_price: '500000', max_price: '2500000', fare_class: 'Business',
    departure_time_from: '08:00', departure_time_to: '12:00',
    arrival_time_from: '10:00', arrival_time_to: '18:00',
    min_duration_minutes: 60, max_duration_minutes: 360,
    sort_by: 'price_low', page: 2, limit: 7,
  });

  const options = calls[0];
  assert.deepEqual({ ...options.where, [Op.and]: undefined }, {
    status: 'scheduled', departure_airport_id: '1', arrival_airport_id: '2', airline_id: '9',
    available_seats: { [Op.gte]: 2 },
    departure_time: { [Op.gte]: new Date('2026-10-12T17:00:00.000Z'), [Op.lt]: new Date('2026-10-13T17:00:00.000Z') },
    [Op.and]: undefined,
  });
  assert.equal(options.distinct, true);
  assert.equal(options.limit, 7);
  assert.equal(options.offset, 7);
  const fares = options.include.find((item) => item.as === 'fareClasses');
  assert.equal(fares.required, true);
  assert.deepEqual(fares.where, {
    [Op.or]: [
      { seat_quota: { [Op.is]: null } },
      { seat_quota: { [Op.gte]: 2 } },
    ],
    price: { [Op.gte]: '500000', [Op.lte]: '2500000' }, class_name: 'Business',
  });
  assert.equal(options.where[Op.and].length, 4);
  assert.equal(options.where[Op.and][0].attribute.fn, 'TIME');
  assert.equal(options.where[Op.and][0].attribute.args[0].val, 'DATE_ADD(`departure_time`, INTERVAL 7 HOUR)');
  assert.equal(options.where[Op.and][1].attribute.args[0].val, 'DATE_ADD(`arrival_time`, INTERVAL 7 HOUR)');
  assert.equal(options.where[Op.and][2].attribute.fn, 'TIMESTAMPDIFF');
  assert.deepEqual(options.order, [[{ model: repository.FareClass, as: 'fareClasses' }, 'price', 'ASC']]);
});

test('Flight search maps advanced filters without changing the Vietnam-local date window', async () => {
  let received;
  const service = new FlightService({ repository: {
    searchPage: async (input) => { received = input; return { count: 0, rows: [] }; },
  } });
  const result = await service.searchFlights({
    departure_airport_id: '1', arrival_airport_id: '2', departure_date: '2026-10-13',
    min_seats: '2', min_price: '500000', max_price: '2500000', fare_class: 'Business',
    departure_time_from: '08:00', arrival_time_to: '18:00',
    min_duration_minutes: '60', max_duration_minutes: '360', sort_by: 'duration_shortest', page: '2', limit: '7',
  });
  assert.deepEqual(result, { total: 0, page: '2', limit: '7', data: [] });
  assert.equal(received.dateStart.toISOString(), '2026-10-12T17:00:00.000Z');
  assert.equal(received.dateEnd.toISOString(), '2026-10-13T17:00:00.000Z');
  assert.equal(received.min_price, '500000');
  assert.equal(received.max_price, '2500000');
  assert.equal(received.fare_class, 'Business');
  assert.equal(received.min_duration_minutes, 60);
  assert.equal(received.max_duration_minutes, 360);
  assert.equal(received.sort_by, 'duration_shortest');
});

test('Flight search rejects unknown, invalid, or contradictory filter parameters', async () => {
  const unknown = await validateQuery({ departure_airport_id: '1', fabricated: 'true' });
  assert.ok(unknown.some((error) => error.msg.includes('Unsupported search parameter')));

  const invalid = await validateQuery({
    min_price: '-1', max_price: 'NaN', fare_class: '   ',
    departure_time_from: '22:00', departure_time_to: '08:00',
    min_duration_minutes: '0', sort_by: 'random', stops: '2',
  });
  assert.ok(invalid.length >= 6);
});
