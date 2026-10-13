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
