const test = require('node:test');
const assert = require('node:assert/strict');
const roleRouter = require('../routes/role.route');

test('role module exposes only the documented read endpoints', () => {
  const routes = roleRouter.stack
    .filter((layer) => layer.route)
    .map((layer) => ({ path: layer.route.path, methods: Object.keys(layer.route.methods) }));

  assert.deepEqual(routes, [
    { path: '/', methods: ['get'] },
    { path: '/:id', methods: ['get'] },
  ]);
});
