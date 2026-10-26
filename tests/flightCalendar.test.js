/**
 * Test chức năng #27: Lịch chuyến bay dạng calendar (tuần/tháng) cho quản trị viên/nhân viên
 * Dùng node:test native runner.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { validationResult } = require('express-validator');
const { flightCalendarValidator, CALENDAR_VIEWS, CALENDAR_STATUS_VALUES } = require('../validators/flight.validator');
const FlightService = require('../modules/flight/flight.service');
const { SequelizeFlightRepository } = require('../modules/flight/flight.repository');

// 1. Tests cho validation flightCalendarValidator
test('#27 – flightCalendarValidator accepts valid week and month queries', async () => {
  const reqWeek = {
    query: { view: 'week', date: '2026-10-21', status: 'scheduled' },
  };
  for (const middleware of flightCalendarValidator) {
    await middleware(reqWeek, {}, () => {});
  }
  const resultWeek = validationResult(reqWeek);
  assert.equal(resultWeek.isEmpty(), true, 'Valid week query should pass validation');

  const reqMonth = {
    query: { view: 'month', date: '2026-10-01' },
  };
  for (const middleware of flightCalendarValidator) {
    await middleware(reqMonth, {}, () => {});
  }
  const resultMonth = validationResult(reqMonth);
  assert.equal(resultMonth.isEmpty(), true, 'Valid month query should pass validation');

  const reqEmpty = { query: {} };
  for (const middleware of flightCalendarValidator) {
    await middleware(reqEmpty, {}, () => {});
  }
  const resultEmpty = validationResult(reqEmpty);
  assert.equal(resultEmpty.isEmpty(), true, 'Empty query should pass validation (defaults used)');
});

test('#27 – flightCalendarValidator rejects invalid view, date, status and unknown fields', async () => {
  const reqInvalidView = { query: { view: 'biweekly' } };
  for (const middleware of flightCalendarValidator) {
    await middleware(reqInvalidView, {}, () => {});
  }
  assert.equal(validationResult(reqInvalidView).isEmpty(), false);

  const reqInvalidDate = { query: { date: '21-10-2026' } };
  for (const middleware of flightCalendarValidator) {
    await middleware(reqInvalidDate, {}, () => {});
  }
  assert.equal(validationResult(reqInvalidDate).isEmpty(), false);

  const reqInvalidStatus = { query: { status: 'flying' } };
  for (const middleware of flightCalendarValidator) {
    await middleware(reqInvalidStatus, {}, () => {});
  }
  assert.equal(validationResult(reqInvalidStatus).isEmpty(), false);

  const reqUnknownField = { query: { view: 'week', malicious_param: '1' } };
  for (const middleware of flightCalendarValidator) {
    await middleware(reqUnknownField, {}, () => {});
  }
  assert.equal(validationResult(reqUnknownField).isEmpty(), false);
});

// 2. Tests cho FlightService.getFlightCalendar
test('#27 – FlightService.getFlightCalendar calculates correct week window and groups by Vietnam date', async () => {
  const mockFlights = [
    {
      id: 1,
      flight_number: 'SF101',
      departure_time: new Date('2026-10-21T02:00:00.000Z'), // VN: 2026-10-21 09:00
      status: 'scheduled',
      toJSON() { return this; },
    },
    {
      id: 2,
      flight_number: 'SF102',
      departure_time: new Date('2026-10-21T10:00:00.000Z'), // VN: 2026-10-21 17:00
      status: 'scheduled',
      toJSON() { return this; },
    },
    {
      id: 3,
      flight_number: 'SF103',
      departure_time: new Date('2026-10-22T04:00:00.000Z'), // VN: 2026-10-22 11:00
      status: 'scheduled',
      toJSON() { return this; },
    },
  ];

  let repoCall = null;
  const mockRepo = {
    async findCalendar(params) {
      repoCall = params;
      return mockFlights;
    },
  };

  const service = new FlightService({ repository: mockRepo });
  const result = await service.getFlightCalendar({ view: 'week', date: '2026-10-21' });

  assert.equal(result.view, 'week');
  assert.equal(result.total, 3);
  assert.ok(result.date_from);
  assert.ok(result.date_to);
  assert.equal(result.by_date['2026-10-21'].length, 2);
  assert.equal(result.by_date['2026-10-22'].length, 1);
  assert.equal(result.data.length, 3);

  // Monday of 2026-10-21 (Wed) is 2026-10-19. 00:00 VN = 2026-10-18T17:00:00.000Z
  assert.equal(new Date(repoCall.dateStart).toISOString(), '2026-10-18T17:00:00.000Z');
  // 7 days later: 2026-10-25T17:00:00.000Z
  assert.equal(new Date(repoCall.dateEnd).toISOString(), '2026-10-25T17:00:00.000Z');
});

test('#27 – FlightService.getFlightCalendar calculates correct month window', async () => {
  let repoCall = null;
  const mockRepo = {
    async findCalendar(params) {
      repoCall = params;
      return [];
    },
  };

  const service = new FlightService({ repository: mockRepo });
  const result = await service.getFlightCalendar({ view: 'month', date: '2026-10-15', status: 'scheduled' });

  assert.equal(result.view, 'month');
  assert.equal(result.total, 0);
  assert.deepEqual(result.data, []);
  assert.deepEqual(result.by_date, {});

  // Month starts 2026-10-01 00:00:00 VN = 2026-09-30T17:00:00.000Z
  assert.equal(new Date(repoCall.dateStart).toISOString(), '2026-09-30T17:00:00.000Z');
  // Month ends 2026-11-01 00:00:00 VN = 2026-10-31T17:00:00.000Z
  assert.equal(new Date(repoCall.dateEnd).toISOString(), '2026-10-31T17:00:00.000Z');
  assert.equal(repoCall.status, 'scheduled');
});

// 3. Tests cho SequelizeFlightRepository.findCalendar
test('#27 – SequelizeFlightRepository.findCalendar builds correct Sequelize query with associations', async () => {
  const gte = Symbol('gte');
  const lt = Symbol('lt');
  let queryCaptured = null;

  const models = {
    sequelize: { transaction: async (work) => work() },
    Flight: {
      findAll: async (options) => {
        queryCaptured = options;
        return [{ id: 1, flight_number: 'SF999', departure_time: new Date('2026-10-21T05:00:00Z') }];
      },
    },
    Airline: {},
    Airport: {},
    FareClass: {},
    Booking: {},
    Op: { gte, lt },
  };

  const repository = new SequelizeFlightRepository(models);
  const dateStart = new Date('2026-10-20T17:00:00.000Z');
  const dateEnd = new Date('2026-10-27T17:00:00.000Z');

  const rows = await repository.findCalendar({ dateStart, dateEnd, status: 'delayed', limit: 300 });

  assert.equal(rows.length, 1);
  assert.deepEqual(queryCaptured.where, {
    departure_time: { [gte]: dateStart, [lt]: dateEnd },
    status: 'delayed',
  });
  assert.deepEqual(queryCaptured.order, [['departure_time', 'ASC']]);
  assert.equal(queryCaptured.limit, 300);
  assert.equal(queryCaptured.include.length, 4);
  assert.equal(queryCaptured.include[0].as, 'airline');
  assert.equal(queryCaptured.include[1].as, 'departureAirport');
  assert.equal(queryCaptured.include[2].as, 'arrivalAirport');
  assert.equal(queryCaptured.include[3].as, 'fareClasses');
});

// 4. Test route contract for /calendar
test('#27 – flight route registers GET /calendar', () => {
  const router = require('../routes/flight.route');
  const routes = router.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods),
    }));

  assert.ok(
    routes.some((r) => r.path === '/calendar' && r.methods.includes('get')),
    'GET /calendar route must be registered in router'
  );
});
