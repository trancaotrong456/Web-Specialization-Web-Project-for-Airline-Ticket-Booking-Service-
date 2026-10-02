const test = require('node:test');
const assert = require('node:assert/strict');
const authorize = require('../middlewares/rbac.middleware');

const invoke = (middleware, user) => {
  let nextCalled = false;
  let statusCode = 200;
  let responseBody = null;
  const req = { user };
  const res = {
    status(code) { statusCode = code; return this; },
    json(body) { responseBody = body; return this; },
  };
  middleware(req, res, () => { nextCalled = true; });
  return { nextCalled, statusCode, responseBody };
};

test('RBAC allows an explicitly permitted role', () => {
  const result = invoke(authorize('admin'), { role: { name: 'admin' } });
  assert.equal(result.nextCalled, true);
});

test('RBAC rejects missing authentication and disallowed roles', () => {
  const unauthenticated = invoke(authorize('admin'), null);
  assert.equal(unauthenticated.statusCode, 401);
  assert.equal(unauthenticated.nextCalled, false);

  const customer = invoke(authorize('admin'), { role: { name: 'customer' } });
  assert.equal(customer.statusCode, 403);
  assert.equal(customer.nextCalled, false);
});
