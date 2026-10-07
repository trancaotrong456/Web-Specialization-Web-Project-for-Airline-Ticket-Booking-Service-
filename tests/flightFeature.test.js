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
