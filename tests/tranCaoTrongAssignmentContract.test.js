const test = require('node:test');
const assert = require('node:assert/strict');

const authRouter = require('../routes/auth.route');
const userRouter = require('../routes/user.route');
const roleRouter = require('../routes/role.route');

const routesOf = (router) => router.stack
  .filter((layer) => layer.route)
  .map((layer) => ({
    path: layer.route.path,
    methods: Object.keys(layer.route.methods),
  }));

test('Tran Cao Trong assignment exposes every Auth, User, and Role endpoint', () => {
  assert.deepEqual(routesOf(authRouter), [
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

  assert.deepEqual(routesOf(userRouter), [
    { path: '/', methods: ['get'] },
    { path: '/:id', methods: ['get'] },
    { path: '/:id/status', methods: ['put'] },
    { path: '/:id/role', methods: ['put'] },
    { path: '/:id', methods: ['delete'] },
  ]);

  assert.deepEqual(routesOf(roleRouter), [
    { path: '/', methods: ['post'] },
    { path: '/', methods: ['get'] },
    { path: '/:id', methods: ['get'] },
    { path: '/:id', methods: ['put'] },
    { path: '/:id', methods: ['delete'] },
  ]);
});

test('User and Role administration applies authentication and Admin RBAC globally', () => {
  for (const router of [userRouter, roleRouter]) {
    const globalMiddleware = router.stack.filter((layer) => !layer.route);
    assert.equal(globalMiddleware.length, 2);
    assert.equal(globalMiddleware[0].name, 'authenticate');

    const authorize = globalMiddleware[1].handle;
    for (const [roleName, expected] of [['admin', true], ['customer', false]]) {
      let nextCalled = false;
      let statusCode = 200;
      const req = { user: { role: { name: roleName } } };
      const res = {
        status(code) { statusCode = code; return this; },
        json() { return this; },
      };
      authorize(req, res, () => { nextCalled = true; });

      assert.equal(nextCalled, expected);
      if (!expected) assert.equal(statusCode, 403);
    }
  }
});
