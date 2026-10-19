const test = require('node:test');
const assert = require('node:assert/strict');
const { createAirlineModule, getDefaultAirlineModule } = require('../modules/airline');
const { buildContainer } = require('../application/buildContainer');

const middleware = () => {};
const validators = {
  listAirlineValidator: [middleware],
  airlineIdValidator: [middleware],
  createAirlineValidator: [middleware],
  updateAirlineValidator: [middleware],
};
const dependencies = (repository) => ({
  repository,
  guards: { authenticate: middleware, authorize: () => middleware },
  validation: { validate: middleware },
  validators,
});

test('Airline module constructs one service and controller graph around the injected repository', () => {
  const repository = {};
  const module = createAirlineModule(dependencies(repository));

  assert.equal(module.repository, repository);
  assert.equal(module.service.repository, repository);
  assert.equal(module.controller.service, module.service);
  assert.equal(module.router.stack.filter((layer) => layer.route).length, 6);
});

test('legacy Airline imports and composition root resolve the same canonical module objects', () => {
  const module = getDefaultAirlineModule();
  const serviceAdapter = require('../services/airline.service');
  const routeAdapter = require('../routes/airline.route');
  const controllerAdapter = require('../controllers/airline.controller');
  const container = buildContainer();
  const defaultApiRouter = require('../routes');
  const airlineMounts = container.apiRouter.stack.filter((layer) => layer.handle === module.router);

  assert.equal(serviceAdapter, module.service);
  assert.equal(routeAdapter, module.router);
  assert.equal(controllerAdapter, module.controller);
  assert.equal(container.airlineModule, module);
  assert.equal(container.apiRouter, defaultApiRouter);
  assert.equal(airlineMounts.length, 1);
});
