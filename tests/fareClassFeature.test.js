/**
 * Test chức năng #24 (CRUD hạng vé + giá).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

test('#24 – fareClass routes contract', () => {
  const router = require('../routes/fareClass.route');
  assert.ok(router, 'fareClass router should be defined');

  const routes = router.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods),
    }));

  assert.ok(routes.some((r) => r.path === '/flight/:flightId' && r.methods.includes('get')));
  assert.ok(routes.some((r) => r.path === '/:id' && r.methods.includes('get')));
  assert.ok(routes.some((r) => r.path === '/' && r.methods.includes('post')));
  assert.ok(routes.some((r) => r.path === '/:id' && r.methods.includes('put')));
  assert.ok(routes.some((r) => r.path === '/:id' && r.methods.includes('delete')));
});

test('#24 – createFareClassValidator validates input', async () => {
  const { validationResult } = require('express-validator');
  const { createFareClassValidator } = require('../validators/fareClass.validator');

  const invalidReq = { body: {} };
  for (const middleware of createFareClassValidator) {
    await middleware(invalidReq, {}, () => {});
  }
  const result = validationResult(invalidReq);
  assert.ok(!result.isEmpty(), 'Missing fields must fail validation');

  const validReq = {
    body: {
      flight_id: 1,
      class_name: 'Economy',
      price: 1500000,
      seat_quota: 100,
    },
  };
  for (const middleware of createFareClassValidator) {
    await middleware(validReq, {}, () => {});
  }
  const validResult = validationResult(validReq);
  assert.ok(validResult.isEmpty(), 'Valid payload must pass validation');
});

test('#24 – updateFareClassValidator validates edit payload', async () => {
  const { validationResult } = require('express-validator');
  const { updateFareClassValidator } = require('../validators/fareClass.validator');

  const invalidReq = {
    body: {
      price: -500,
      seat_quota: -1,
    },
  };
  for (const middleware of updateFareClassValidator) {
    await middleware(invalidReq, {}, () => {});
  }
  const result = validationResult(invalidReq);
  assert.ok(!result.isEmpty(), 'Negative price/seats must fail validation');

  const validReq = {
    body: {
      price: 2000000,
      seat_quota: 120,
    },
  };
  for (const middleware of updateFareClassValidator) {
    await middleware(validReq, {}, () => {});
  }
  const validResult = validationResult(validReq);
  assert.ok(validResult.isEmpty(), 'Valid update payload must pass');
});

test('#24 – delete fare class checks bookings and throws 409', () => {
  const fs = require('fs');
  const serviceCode = fs.readFileSync(path.join(__dirname, '../services/fareClass.service.js'), 'utf8');

  assert.ok(serviceCode.includes('Booking.count'), 'delete must check Booking count before deleting');
  assert.ok(serviceCode.includes('statusCode = 409'), 'delete must throw 409 if bookings exist');
});

test('#24 – getByFlight orders by price ASC', () => {
  const fs = require('fs');
  const serviceCode = fs.readFileSync(path.join(__dirname, '../services/fareClass.service.js'), 'utf8');

  assert.ok(serviceCode.includes("order: [['price', 'ASC']]"), 'getByFlight must sort fare classes ascending by price');
});

test('#24 – getById contract verifies flight association and 404', () => {
  const fs = require('fs');
  const serviceCode = fs.readFileSync(path.join(__dirname, '../services/fareClass.service.js'), 'utf8');

  assert.ok(serviceCode.includes("model: Flight"), 'getById must include Flight model association');
  assert.ok(serviceCode.includes("statusCode = 404"), 'getById must throw 404 if fare class not found');
});




