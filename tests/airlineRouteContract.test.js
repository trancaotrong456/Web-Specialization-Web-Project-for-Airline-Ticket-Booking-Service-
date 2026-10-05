const test = require('node:test');
const assert = require('node:assert/strict');
const airlineRouter = require('../routes/airline.route');

test('airline module exposes documented CRUD and search endpoints', () => {
  const routes = airlineRouter.stack
    .filter((layer) => layer.route)
    .map((layer) => ({ path: layer.route.path, methods: Object.keys(layer.route.methods) }));

  assert.deepEqual(routes, [
    { path: '/', methods: ['get'] },
    { path: '/:id', methods: ['get'] },
    { path: '/', methods: ['post'] },
    { path: '/:id', methods: ['put'] },
    { path: '/:id', methods: ['delete'] },
  ]);
});
