const test = require('node:test');
const assert = require('node:assert/strict');
const { createAirportModule, getDefaultAirportModule } = require('../modules/airport');
const { buildContainer } = require('../application/buildContainer');

test('legacy Airport adapters and application composition share one canonical module and mount', () => {
  const module = getDefaultAirportModule();
  const service = require('../services/airport.service');
  const controller = require('../controllers/airport.controller');
  const route = require('../routes/airport.route');
  const container = buildContainer();
  const apiRouter = require('../routes');
  const mounts = container.apiRouter.stack.filter((layer) => layer.handle === module.router);

  assert.equal(service, module.service);
  assert.equal(controller, module.controller);
  assert.equal(route, module.router);
  assert.equal(container.airportModule, module);
  assert.equal(container.apiRouter, apiRouter);
  assert.equal(mounts.length, 1);
});

test('Airport module accepts isolated fake dependencies without Sequelize models', () => {
  const service = { getAll() {}, getById() {}, create() {}, update() {}, delete() {} };
  const controller = { getAll() {}, getById() {}, create() {}, update() {}, delete() {} };
  const guards = { authenticate() {}, authorize: () => () => {} };
  const module = createAirportModule({ service, controller, guards });
  assert.equal(module.service, service);
  assert.equal(module.controller, controller);
});

test('an explicitly injected AirportModule is mounted even after the default router was cached', () => {
  const defaultApiRouter = require('../routes');
  const injected = createAirportModule({
    repository: {},
    guards: { authenticate() {}, authorize: () => () => {} },
  });

  const container = buildContainer({ airportModule: injected });
  const mounts = container.apiRouter.stack.filter((layer) => layer.handle === injected.router);

  assert.notEqual(container.apiRouter, defaultApiRouter);
  assert.equal(container.airportModule, injected);
  assert.equal(mounts.length, 1);
});
