const test = require('node:test');
const assert = require('node:assert/strict');
const createAuthGuards = require('../shared/http/guards/createAuthGuards');
const createValidationAdapter = require('../shared/http/validation/validationAdapter');
const currentAuthenticate = require('../middlewares/auth.middleware');
const currentOptionalAuth = require('../middlewares/optionalAuth.middleware');
const currentAuthorize = require('../middlewares/rbac.middleware');
const currentValidate = require('../middlewares/validate.middleware');

test('auth guard adapter preserves the existing Express middleware references and role factory', () => {
  let roles;
  const authorize = (...allowed) => { roles = allowed; return currentAuthorize(...allowed); };
  const guards = createAuthGuards({
    authenticate: currentAuthenticate,
    optionalAuth: currentOptionalAuth,
    authorize,
  });

  assert.equal(guards.authenticate, currentAuthenticate);
  assert.equal(guards.optionalAuth, currentOptionalAuth);
  const adminGuard = guards.authorize('admin');
  assert.equal(typeof adminGuard, 'function');
  assert.deepEqual(roles, ['admin']);
});

test('validation adapter forwards the same request, response, and next to existing validator middleware', () => {
  const adapter = createValidationAdapter(currentValidate);
  const req = {};
  const res = {};
  const next = () => {};
  let received;
  const validate = createValidationAdapter((...args) => { received = args; });

  validate(req, res, next);
  assert.deepEqual(received, [req, res, next]);
  assert.equal(typeof adapter, 'function');
});
