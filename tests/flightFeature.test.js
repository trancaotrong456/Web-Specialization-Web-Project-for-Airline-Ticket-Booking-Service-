/**
 * Test chức năng #21 (CRUD chuyến bay) và #22 (Danh sách/Tìm chuyến bay) và #23 (Chi tiết chuyến bay).
 * Dùng node:test native runner.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// Test logic kiểm tra múi giờ Việt Nam (UTC+7)
test('#22 – tính dateStart/dateEnd UTC từ ngày VN (UTC+7)', () => {
  const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
  const inputDate = '2026-10-05';
  const dateStart = new Date(new Date(inputDate).getTime() - VN_OFFSET_MS);
  const dateEnd = new Date(dateStart.getTime() + 24 * 60 * 60 * 1000);

  assert.equal(dateStart.toISOString(), '2026-10-04T17:00:00.000Z');
  assert.equal(dateEnd.toISOString(), '2026-10-05T17:00:00.000Z');
});

// Test route contract & authorization
test('#21/#22/#23 – flight routes contract', () => {
  const router = require('../routes/flight.route');
  assert.ok(router, 'flight route router should be defined');

  const routes = router.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods),
    }));

  assert.ok(routes.some((r) => r.path === '/search' && r.methods.includes('get')));
  assert.ok(routes.some((r) => r.path === '/:id' && r.methods.includes('get')));
  assert.ok(routes.some((r) => r.path === '/' && r.methods.includes('get')));
  assert.ok(routes.some((r) => r.path === '/' && r.methods.includes('post')));
  assert.ok(routes.some((r) => r.path === '/:id' && r.methods.includes('put')));
  assert.ok(routes.some((r) => r.path === '/:id/cancel' && r.methods.includes('put')));
  assert.ok(routes.some((r) => r.path === '/:id' && r.methods.includes('delete')));
});

// Test validation create flight
test('#21 – createFlightValidator rejects same origin and destination', async () => {
  const { validationResult } = require('express-validator');
  const { createFlightValidator } = require('../validators/flight.validator');

  const req = {
    body: {
      airline_id: 1,
      departure_airport_id: 10,
      arrival_airport_id: 10,
      departure_time: '2026-10-10T10:00:00Z',
      arrival_time: '2026-10-10T12:00:00Z',
      total_seats: 150,
    },
  };

  for (const middleware of createFlightValidator) {
    await middleware(req, {}, () => {});
  }

  const result = validationResult(req);
  assert.ok(!result.isEmpty(), 'Validation should fail when origin matches destination');
  assert.ok(result.array().some((err) => err.msg.includes('arrival_airport_id must be different')));
});

test('#21 – createFlightValidator rejects arrival before departure', async () => {
  const { validationResult } = require('express-validator');
  const { createFlightValidator } = require('../validators/flight.validator');

  const req = {
    body: {
      airline_id: 1,
      departure_airport_id: 1,
      arrival_airport_id: 2,
      departure_time: '2026-10-10T12:00:00Z',
      arrival_time: '2026-10-10T10:00:00Z',
      total_seats: 150,
    },
  };

  for (const middleware of createFlightValidator) {
    await middleware(req, {}, () => {});
  }

  const result = validationResult(req);
  assert.ok(!result.isEmpty(), 'Validation should fail when arrival <= departure');
  assert.ok(result.array().some((err) => err.msg.includes('arrival_time must be after departure_time')));
});

test('#21 – createFlight rejects client-supplied available_seats and system fields', async () => {
  const flightService = require('../services/flight.service');

  await assert.rejects(
    async () => {
      await flightService.createFlight({
        airline_id: 1,
        departure_airport_id: 1,
        arrival_airport_id: 2,
        departure_time: '2026-10-10T10:00:00Z',
        arrival_time: '2026-10-10T12:00:00Z',
        total_seats: 100,
        available_seats: 50,
      });
    },
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.ok(err.message.includes('available_seats'));
      return true;
    }
  );

  await assert.rejects(
    async () => {
      await flightService.createFlight({
        id: 999,
        airline_id: 1,
        departure_airport_id: 1,
        arrival_airport_id: 2,
        departure_time: '2026-10-10T10:00:00Z',
        arrival_time: '2026-10-10T12:00:00Z',
        total_seats: 100,
      });
    },
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.ok(err.message.includes('trường hệ thống'));
      return true;
    }
  );
});

test('#21 – createFlightValidator rejects available_seats and system fields', async () => {
  const { validationResult } = require('express-validator');
  const { createFlightValidator } = require('../validators/flight.validator');

  const req = {
    body: {
      airline_id: 1,
      departure_airport_id: 1,
      arrival_airport_id: 2,
      departure_time: '2026-10-10T10:00:00Z',
      arrival_time: '2026-10-10T12:00:00Z',
      total_seats: 100,
      available_seats: 80,
    },
  };

  for (const middleware of createFlightValidator) {
    await middleware(req, {}, () => {});
  }
  const result = validationResult(req);
  assert.ok(!result.isEmpty(), 'Validation must fail when available_seats is supplied');
});


// Test edit flight business rules
test('#21 – updateFlight rejects direct mutation of available_seats (400)', async () => {
  const flightService = require('../services/flight.service');
  await assert.rejects(
    async () => {
      await flightService.updateFlight(1, { available_seats: 99 });
    },
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.ok(err.message.includes('available_seats') || err.message.includes('Không được phép'));
      return true;
    }
  );
});

test('#21 – updateFlight rejects mass assignment of total_seats, airline_id, airport IDs, timestamps', async () => {
  const flightService = require('../services/flight.service');
  const disallowedPayloads = [
    { total_seats: 200 },
    { airline_id: 2 },
    { departure_airport_id: 5 },
    { arrival_airport_id: 6 },
    { id: 999 },
    { created_at: new Date() },
    { updatedAt: new Date() },
  ];

  for (const payload of disallowedPayloads) {
    await assert.rejects(
      async () => {
        await flightService.updateFlight(1, payload);
      },
      (err) => {
        assert.equal(err.statusCode, 400);
        return true;
      }
    );
  }
});

test('#21 – updateFlightValidator enforces allowlist and rejects disallowed fields', async () => {
  const { validationResult } = require('express-validator');
  const { updateFlightValidator } = require('../validators/flight.validator');

  const invalidReq = {
    body: {
      available_seats: 50,
      total_seats: 100,
    },
  };
  for (const middleware of updateFlightValidator) {
    await middleware(invalidReq, {}, () => {});
  }
  const result = validationResult(invalidReq);
  assert.ok(!result.isEmpty(), 'Disallowed update fields must fail validation');

  const emptyReq = { body: {} };
  for (const middleware of updateFlightValidator) {
    await middleware(emptyReq, {}, () => {});
  }
  const emptyResult = validationResult(emptyReq);
  assert.ok(!emptyResult.isEmpty(), 'Empty update body must fail validation');
});


// Test delete flight rules
test('#21 – deleteFlight contract verifies transaction and 409 when booking exists', () => {
  const fs = require('fs');
  const serviceCode = fs.readFileSync(path.join(__dirname, '../services/flight.service.js'), 'utf8');

  assert.ok(serviceCode.includes('sequelize.transaction'), 'deleteFlight must execute within a sequelize.transaction');
  assert.ok(serviceCode.includes('Booking.count'), 'deleteFlight must check Booking.count before deletion');
  assert.ok(serviceCode.includes('statusCode = 409'), 'deleteFlight must reject deletion with 409 Conflict if bookings exist');
});

// Test flight list & search rules
test('#22 – searchFlights enforces status=scheduled only', () => {
  const fs = require('fs');
  const serviceCode = fs.readFileSync(path.join(__dirname, '../services/flight.service.js'), 'utf8');

  assert.ok(serviceCode.includes("status: 'scheduled'"), 'searchFlights must only filter status scheduled');
});

test('#22 – searchFlightValidator validates query parameters', async () => {
  const { validationResult } = require('express-validator');
  const { searchFlightValidator } = require('../validators/flight.validator');

  const validReq = {
    query: {
      departure_airport_id: '1',
      arrival_airport_id: '2',
      departure_date: '2026-10-15',
      min_seats: '2',
      page: '1',
      limit: '10',
    },
  };

  for (const middleware of searchFlightValidator) {
    await middleware(validReq, {}, () => {});
  }
  const validResult = validationResult(validReq);
  assert.ok(validResult.isEmpty(), 'Valid search query should pass');

  const invalidReq = {
    query: {
      min_seats: '-1',
      departure_date: 'invalid-date',
    },
  };

  for (const middleware of searchFlightValidator) {
    await middleware(invalidReq, {}, () => {});
  }
  const invalidResult = validationResult(invalidReq);
  assert.ok(!invalidResult.isEmpty(), 'Invalid search query should fail');
});

// Test flight detail
test('#23 – getFlightById contract verifies associations and error handling', () => {
  const fs = require('fs');
  const serviceCode = fs.readFileSync(path.join(__dirname, '../services/flight.service.js'), 'utf8');

  assert.ok(serviceCode.includes('Flight.findByPk(id'), 'getFlightById must search flight by primary key');
  assert.ok(serviceCode.includes('FareClass'), 'getFlightById must include FareClass associations for ticket classes and seats');
  assert.ok(serviceCode.includes("statusCode = 404"), 'getFlightById must throw 404 when flight is not found');
});

// Regression: JOIN fareClasses must not inflate pagination totals for either endpoint.
test('#22 – search and admin lists count distinct flights with joined fare classes', async () => {
  const { Flight } = require('../models');
  const service = require('../services/flight.service');
  const original = Flight.findAndCountAll;
  const captured = [];
  Flight.findAndCountAll = async (options) => {
    captured.push(options);
    // One flight with multiple FareClass rows must count as exactly one flight.
    return { count: 1, rows: [{ id: 42, fareClasses: [{ id: 1 }, { id: 2 }] }] };
  };
  try {
    const search = await service.searchFlights({ departure_airport_id: 1, arrival_airport_id: 2, page: 1, limit: 10 });
    const admin = await service.getAllFlights({ page: 1, limit: 10 });
    assert.equal(search.total, 1);
    assert.equal(admin.total, 1);
    assert.equal(captured.length, 2);
    for (const options of captured) {
      assert.equal(options.distinct, true, 'findAndCountAll must count distinct Flight primary keys');
      assert.ok(options.include.some((entry) => entry.as === 'fareClasses'));
      assert.equal(options.limit, 10);
      assert.equal(options.offset, 0);
    }
  } finally {
    Flight.findAndCountAll = original;
  }
});
