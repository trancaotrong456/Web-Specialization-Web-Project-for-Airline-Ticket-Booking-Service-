const test = require('node:test');
const assert = require('node:assert/strict');
const authRouter = require('../routes/auth.route');

const routeDefinitions = () => authRouter.stack
  .filter((layer) => layer.route)
  .map((layer) => ({
    path: layer.route.path,
    methods: Object.keys(layer.route.methods),
    middlewareNames: layer.route.stack.map((handler) => handler.name),
  }));

test('auth module exposes exactly the implemented report endpoints', () => {
  const routes = routeDefinitions().map(({ path, methods }) => ({ path, methods }));

  assert.deepEqual(routes, [
    { path: '/register', methods: ['post'] },
    { path: '/login', methods: ['post'] },
    { path: '/refresh-token', methods: ['post'] },
    { path: '/forgot-password', methods: ['post'] },
    { path: '/reset-password', methods: ['post'] },
    { path: '/logout', methods: ['post'] },
    { path: '/me', methods: ['get'] },
    { path: '/me', methods: ['put'] },
    { path: '/change-password', methods: ['put'] },
  ]);

});

test('profile, password, and logout endpoints require authentication', () => {
  const protectedRoutes = routeDefinitions().filter(({ path }) => [
    '/logout',
    '/me',
    '/change-password',
  ].includes(path));

  assert.ok(protectedRoutes.length > 0);
  for (const route of protectedRoutes) {
    assert.equal(route.middlewareNames[0], 'authenticate');
  }
});
