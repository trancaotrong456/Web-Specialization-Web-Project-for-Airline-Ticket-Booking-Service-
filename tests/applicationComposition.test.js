const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { registerModules, getDefaultApiRouter } = require('../application/registerModules');
const { buildContainer } = require('../application/buildContainer');
const { createApp } = require('../app');

test('registerModules mounts the existing feature routers once and in their established order', () => {
  const routeNames = [
    'auth', 'users', 'roles', 'airlines', 'airports', 'flights',
    'fareClasses', 'bookings', 'payments', 'promotions',
  ];
  const routeModules = Object.fromEntries(routeNames.map((name) => [name, express.Router()]));
  const router = registerModules({ routeModules });

  const mounts = router.stack
    .filter((layer) => routeNames.some((name) => layer.handle === routeModules[name]))
    .map((layer) => routeNames.find((name) => layer.handle === routeModules[name]));

  assert.equal(router.stack[0].route.path, '/health');
  assert.deepEqual(mounts, routeNames);
  for (const name of routeNames) {
    assert.equal(mounts.filter((mounted) => mounted === name).length, 1);
  }
});

test('the default API router is memoized for legacy route-tree consumers', () => {
  assert.equal(getDefaultApiRouter(), getDefaultApiRouter());
});

test('buildContainer preserves injected API router and error handler references', () => {
  const apiRouter = express.Router();
  const errorHandler = () => {};
  const container = buildContainer({ apiRouter, errorHandler });

  assert.equal(container.apiRouter, apiRouter);
  assert.equal(container.errorHandler, errorHandler);
});

test('createApp mounts one injected API router at the existing prefix', () => {
  const apiRouter = express.Router();
  const errorHandler = function errorHandler() {};
  const originalEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  const app = createApp({ container: { apiRouter, errorHandler } });
  const mounts = app._router.stack.filter((layer) => layer.handle === apiRouter);

  try {
    assert.equal(mounts.length, 1);
    assert.equal(mounts[0].regexp.test('/api/v1/health'), true);
    assert.deepEqual(app._router.stack.slice(2).map((layer) => layer.name), [
      'helmetMiddleware',
      'corsMiddleware',
      'jsonParser',
      'urlencodedParser',
      'serveStatic',
      'router',
      'bound dispatch',
      '<anonymous>',
      'errorHandler',
    ]);
  } finally {
    if (originalEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnvironment;
  }
});
