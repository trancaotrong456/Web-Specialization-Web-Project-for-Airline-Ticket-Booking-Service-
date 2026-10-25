const test = require('node:test');
const assert = require('node:assert/strict');
const airportRouter = require('../routes/airport.route');

test('airport module exposes documented CRUD and search endpoints', () => {
  const routes = airportRouter.stack
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

test('airport routes require authentication and admin RBAC for mutations, while keeping reads public', () => {
  const mutationMethods = ['post', 'put', 'delete'];

  for (const method of mutationMethods) {
    const layer = airportRouter.stack.find(
      (item) => item.route && item.route.methods[method]
    );
    assert.ok(layer, `Mutation method ${method} must exist`);

    const handles = layer.route.stack.map((item) => item.handle);
    assert.equal(handles[0].name, 'authenticate', `${method} must authenticate first`);
    assert.ok(typeof handles[1] === 'function', `${method} must have authorization handler`);

    // Verify authorization handler enforces admin
    let nextCalled = false;
    let statusCode = 200;
    const reqCustomer = { user: { role: { name: 'customer' } } };
    const res = {
      status(code) { statusCode = code; return this; },
      json() { return this; },
    };
    handles[1](reqCustomer, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false, `${method} must deny customer`);
    assert.equal(statusCode, 403, `${method} must return 403 for customer`);

    nextCalled = false;
    const reqAdmin = { user: { role: { name: 'admin' } } };
    handles[1](reqAdmin, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true, `${method} must allow admin`);
  }

  const readLayers = airportRouter.stack.filter(
    (item) => item.route && item.route.methods.get
  );
  for (const layer of readLayers) {
    const handles = layer.route.stack.map((item) => item.handle);
    assert.ok(!handles.some((h) => h.name === 'authenticate'), `GET ${layer.route.path} should be publicly accessible`);
  }
});
