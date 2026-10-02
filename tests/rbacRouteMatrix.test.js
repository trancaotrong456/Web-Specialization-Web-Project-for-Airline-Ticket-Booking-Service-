const test = require('node:test');
const assert = require('node:assert/strict');

const routers = {
  airline: require('../routes/airline.route'),
  airport: require('../routes/airport.route'),
  flight: require('../routes/flight.route'),
  fareClass: require('../routes/fareClass.route'),
  booking: require('../routes/booking.route'),
  payment: require('../routes/payment.route'),
  promotion: require('../routes/promotion.route'),
  user: require('../routes/user.route'),
  role: require('../routes/role.route'),
};

const invokeAuthorization = (middleware, roleName) => {
  let nextCalled = false;
  let statusCode = 200;
  const req = { user: { role: { name: roleName } } };
  const res = {
    status(code) { statusCode = code; return this; },
    json() { return this; },
  };

  middleware(req, res, () => { nextCalled = true; });
  return { nextCalled, statusCode };
};

const routeAuthorization = (router, method, path) => {
  const layer = router.stack.find(
    (item) => item.route
      && item.route.path === path
      && item.route.methods[method.toLowerCase()]
  );
  assert.ok(layer, `${method} ${path} must exist`);

  const handlers = layer.route.stack.map((item) => item.handle);
  assert.equal(handlers[0].name, 'authenticate', `${method} ${path} must authenticate first`);
  assert.ok(handlers[1], `${method} ${path} must include authorization`);
  return handlers[1];
};

const globalAuthorization = (router) => {
  const middleware = router.stack.filter((layer) => !layer.route);
  assert.equal(middleware[0].name, 'authenticate');
  assert.ok(middleware[1]);
  return middleware[1].handle;
};

const assertRoles = (middleware, allowedRoles) => {
  for (const role of ['customer', 'staff', 'admin']) {
    const result = invokeAuthorization(middleware, role);
    if (allowedRoles.includes(role)) {
      assert.equal(result.nextCalled, true, `${role} should be allowed`);
    } else {
      assert.equal(result.nextCalled, false, `${role} should be denied`);
      assert.equal(result.statusCode, 403);
    }
  }
};

test('RBAC route matrix matches the implemented authorization policy', () => {
  const adminOnly = [
    ['airline', 'post', '/'],
    ['airline', 'put', '/:id'],
    ['airline', 'delete', '/:id'],
    ['airport', 'post', '/'],
    ['airport', 'put', '/:id'],
    ['airport', 'delete', '/:id'],
    ['flight', 'post', '/'],
    ['flight', 'delete', '/:id'],
    ['fareClass', 'delete', '/:id'],
    ['payment', 'post', '/bookings/:id/refund'],
    ['promotion', 'post', '/'],
    ['promotion', 'put', '/:id'],
    ['promotion', 'delete', '/:id'],
  ];
  const adminAndStaff = [
    ['flight', 'get', '/'],
    ['flight', 'put', '/:id'],
    ['flight', 'put', '/:id/cancel'],
    ['fareClass', 'post', '/'],
    ['fareClass', 'put', '/:id'],
    ['booking', 'get', '/admin/all'],
  ];

  for (const [routerName, method, path] of adminOnly) {
    assertRoles(routeAuthorization(routers[routerName], method, path), ['admin']);
  }
  for (const [routerName, method, path] of adminAndStaff) {
    assertRoles(routeAuthorization(routers[routerName], method, path), ['staff', 'admin']);
  }

  assertRoles(globalAuthorization(routers.user), ['admin']);
  assertRoles(globalAuthorization(routers.role), ['admin']);
});
