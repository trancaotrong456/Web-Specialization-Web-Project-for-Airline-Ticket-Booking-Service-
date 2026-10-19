const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const { createAuthModule, getDefaultAuthModule } = require('../modules/auth');
const { SequelizeAuthRepository } = require('../modules/auth/auth.repository');
const AuthService = require('../modules/auth/auth.service');
const AuthController = require('../modules/auth/auth.controller');
const express = require('express');

test('Auth repository preserves binary compare-and-set for legacy refresh tokens', async () => {
  let values;
  let options;
  const User = {
    sequelize: { where: (...args) => args, fn: (...args) => args, col: (name) => name },
    update: async (nextValues, nextOptions) => { values = nextValues; options = nextOptions; return [1]; },
  };
  const repository = new SequelizeAuthRepository({ User, Role: {}, Op });
  assert.deepEqual(await repository.upgradeLegacyRefreshToken(9, 'raw', 'digest'), [1]);
  assert.deepEqual(values, { refresh_token: 'digest' });
  assert.equal(options.where.id, 9);
  assert.deepEqual(options.where[Op.and][0], ['BINARY', 'refresh_token']);
  assert.equal(options.where[Op.and][1], 'raw');
});

test('Auth service rejects a revoked legacy token after compare-and-set loses', async () => {
  const { generateRefreshToken } = require('../utils/jwt.util');
  const token = generateRefreshToken({ id: 9, email: 'a@example.com', role: 'customer' });
  const service = new AuthService({ repository: {
    findUserWithRoleById: async () => ({ id: 9, email: 'a@example.com', role: { name: 'customer' }, status: 'active', refresh_token: token }),
    upgradeLegacyRefreshToken: async () => [0],
    findUserById: async () => ({ refresh_token: null }),
  } });
  await assert.rejects(service.refreshToken(token), (error) => error.statusCode === 401);
});

test('Auth controller forwards injected login result through the existing response contract', async () => {
  const expected = { user: { id: 5 }, accessToken: 'token', refreshToken: 'refresh' };
  const controller = new AuthController({ service: { login: async ({ email }) => {
    assert.equal(email, 'admin@example.com');
    return expected;
  } }, apiResponse: { success: (_res, value, message) => ({ value, message }) } });
  assert.deepEqual(await controller.login({ body: { email: 'admin@example.com' } }, {}, (error) => { throw error; }),
    { value: expected, message: 'Login successful' });
});

test('Auth module preserves legacy object identity and exact public/protected route order', () => {
  const module = getDefaultAuthModule();
  assert.equal(require('../services/auth.service'), module.service);
  assert.equal(require('../controllers/auth.controller'), module.controller);
  assert.equal(require('../routes/auth.route'), module.router);
  const paths = module.router.stack.filter((layer) => layer.route).map((layer) => layer.route.path);
  assert.deepEqual(paths, ['/register', '/login', '/refresh-token', '/forgot-password', '/reset-password', '/logout', '/me', '/me', '/change-password']);
  assert.equal(paths.filter((path) => path === '/refresh-token').length, 1);
  const injected = createAuthModule({ repository: {}, guards: { authenticate() {} }, validation: { validate() {} }, validators: {
    registerValidator: [], loginValidator: [], updateProfileValidator: [], changePasswordValidator: [],
    refreshTokenValidator: [], forgotPasswordValidator: [], resetPasswordValidator: [],
  } });
  assert.notEqual(injected.service, module.service);
});

test('DI-created Auth HTTP handlers preserve public login and protected profile responses', async () => {
  const calls = [];
  const service = {
    async login(values) { calls.push(['login', values.email]); return { accessToken: 'issued' }; },
    async getProfile(id) { calls.push(['profile', id]); return { id }; },
  };
  const controller = {
    service,
    async register(_req, res) { res.sendStatus(501); },
    async login(req, res) { res.json(await this.service.login(req.body)); },
    async refreshToken(_req, res) { res.sendStatus(501); },
    async forgotPassword(_req, res) { res.sendStatus(501); },
    async resetPassword(_req, res) { res.sendStatus(501); },
    async logout(_req, res) { res.sendStatus(501); },
    async getMe(req, res) { res.json(await this.service.getProfile(req.user.id)); },
    async updateProfile(_req, res) { res.sendStatus(501); },
    async changePassword(_req, res) { res.sendStatus(501); },
  };
  const module = createAuthModule({ controller, guards: { authenticate(req, _res, next) { req.user = { id: 7 }; next(); } },
    validation: { validate(_req, _res, next) { next(); } }, validators: {
      registerValidator: [], loginValidator: [], updateProfileValidator: [], changePasswordValidator: [],
      refreshTokenValidator: [], forgotPasswordValidator: [], resetPasswordValidator: [],
    } });
  const app = express();
  app.use(express.json());
  app.use('/auth', module.router);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    const base = `http://127.0.0.1:${server.address().port}/auth`;
    const login = await fetch(`${base}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'demo@example.com' }) });
    assert.equal(login.status, 200);
    assert.deepEqual(await login.json(), { accessToken: 'issued' });
    const profile = await fetch(`${base}/me`);
    assert.equal(profile.status, 200);
    assert.deepEqual(await profile.json(), { id: 7 });
    assert.deepEqual(calls, [['login', 'demo@example.com'], ['profile', 7]]);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

test('Composition Root mounts an injected Auth router exactly once after default initialization', () => {
  const { buildContainer } = require('../application/buildContainer');
  buildContainer();
  const injectedRouter = express.Router();
  const injectedModule = { router: injectedRouter };
  const container = buildContainer({ authModule: injectedModule });
  assert.equal(container.authModule, injectedModule);
  assert.equal(container.apiRouter.stack.filter((layer) => layer.handle === injectedRouter).length, 1);
});
