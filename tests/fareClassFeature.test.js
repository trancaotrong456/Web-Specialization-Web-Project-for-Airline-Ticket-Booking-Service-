/**
 * Test chức năng #24 (CRUD hạng vé + giá).
 */
const test = require('node:test');
const assert = require('node:assert/strict');

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

test('#24 – updateFareClassValidator validates edit payload and enforces allowlist', async () => {
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

  const flightIdReq = {
    body: {
      flight_id: 10,
      class_name: 'Business',
    },
  };
  for (const middleware of updateFareClassValidator) {
    await middleware(flightIdReq, {}, () => {});
  }
  const flightIdResult = validationResult(flightIdReq);
  assert.ok(!flightIdResult.isEmpty(), 'Attempting to change flight_id must fail validation');

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

test('#24 – update in fareClass.service enforces allowlist and rejects changing flight_id', async () => {
  const fareClassService = require('../services/fareClass.service');

  await assert.rejects(
    async () => {
      await fareClassService.update(1, { flight_id: 99 });
    },
    (err) => {
      assert.equal(err.statusCode, 400);
      assert.ok(err.message.includes('flight_id'));
      return true;
    }
  );

  await assert.rejects(
    async () => {
      await fareClassService.update(1, { unknown_field: 'value' });
    },
    (err) => {
      assert.equal(err.statusCode, 400);
      return true;
    }
  );

  await assert.rejects(
    async () => {
      await fareClassService.update(1, { price: -100 });
    },
    (err) => {
      assert.equal(err.statusCode, 400);
      return true;
    }
  );
});


test('#24 – delete fare class checks bookings and throws 409', async () => {
  const Service = require('../modules/fare-class/fareClass.service');
  let deleted = false;
  const service = new Service({ repository: {
    findById: async () => ({ id: 4 }),
    countBookingsByFareClassId: async (id) => { assert.equal(id, '4'); return 1; },
    delete: async () => { deleted = true; },
  } });
  await assert.rejects(service.delete('4'), (error) => error.statusCode === 409);
  assert.equal(deleted, false);
});

test('#24 – getByFlight orders by price ASC', async () => {
  const { SequelizeFareClassRepository } = require('../modules/fare-class/fareClass.repository');
  let options;
  const repository = new SequelizeFareClassRepository({
    FareClass: { findAll: async (value) => { options = value; return []; } }, Flight: {}, Booking: {},
  });
  await repository.findByFlight('8');
  assert.deepEqual(options, { where: { flight_id: '8' }, order: [['price', 'ASC']] });
});

test('#24 – getById contract verifies flight association and 404', async () => {
  const { SequelizeFareClassRepository } = require('../modules/fare-class/fareClass.repository');
  const Service = require('../modules/fare-class/fareClass.service');
  const Flight = {};
  let options;
  const repository = new SequelizeFareClassRepository({
    FareClass: { findByPk: async (_id, value) => { options = value; return null; } }, Flight, Booking: {},
  });
  await assert.rejects(new Service({ repository }).getById('404'), (error) => error.statusCode === 404);
  assert.deepEqual(options, { include: [{ model: Flight, as: 'flight' }] });
});

test('#24 – createFareClassValidator blocks out-of-contract fields', async () => {
  const { validationResult } = require('express-validator');
  const { createFareClassValidator } = require('../validators/fareClass.validator');

  const invalidReq = {
    body: {
      flight_id: 1,
      class_name: 'Economy',
      price: 1500000,
      seat_quota: 100,
      discount_rate: 0.1, // out of contract
    },
  };
  for (const middleware of createFareClassValidator) {
    await middleware(invalidReq, {}, () => {});
  }
  const result = validationResult(invalidReq);
  assert.ok(!result.isEmpty(), 'Out of contract fields must fail validator');
});

test('#24 – FareClassService.create validates contract and blocks out-of-contract fields', async () => {
  const fareClassService = require('../services/fareClass.service');

  // Payload with out-of-contract fields
  await assert.rejects(
    async () => {
      await fareClassService.create({
        flight_id: 1,
        class_name: 'Economy',
        price: 1000000,
        extra_key: 'invalid',
      });
    },
    (err) => err.statusCode === 400 && err.message.includes('ngoài hợp đồng')
  );

  // Missing or negative flight_id
  await assert.rejects(
    async () => {
      await fareClassService.create({
        flight_id: -1,
        class_name: 'Economy',
        price: 1000000,
      });
    },
    (err) => err.statusCode === 400
  );

  // Negative price
  await assert.rejects(
    async () => {
      await fareClassService.create({
        flight_id: 1,
        class_name: 'Economy',
        price: -50000,
      });
    },
    (err) => err.statusCode === 400
  );
});
