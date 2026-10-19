const test = require('node:test');
const assert = require('node:assert/strict');
const { createPromotionModule } = require('../modules/promotion');

test('Promotion module builds one injected graph and registers each route in legacy order', () => {
  const repository = {};
  const authenticate = () => {};
  const adminGuards = [];
  const module = createPromotionModule({ repository, guards: {
    authenticate,
    authorize(role) { assert.equal(role, 'admin'); const guard = () => {}; adminGuards.push(guard); return guard; },
  } });
  const routes = module.router.stack.filter((layer) => layer.route).map((layer) => layer.route);
  assert.equal(module.service.repository, repository);
  assert.equal(module.controller.service, module.service);
  assert.deepEqual(routes.map((route) => [route.path, Object.keys(route.methods)[0]]), [
    ['/', 'get'], ['/validate/:code', 'get'], ['/:id', 'get'],
    ['/', 'post'], ['/:id', 'put'], ['/:id', 'delete'],
  ]);
  assert.deepEqual(routes.slice(0, 3).map((route) => route.stack.length), [1, 1, 1]);
  assert.equal(adminGuards.length, 3);
  routes.slice(3).forEach((route, index) => {
    assert.equal(route.stack[0].handle, authenticate);
    assert.equal(route.stack[1].handle, adminGuards[index]);
    assert.equal(route.stack.length, 3);
  });
});

test('Promotion module rejects missing controller or guards', () => {
  assert.throws(() => createPromotionModule(), /controller.*guards/i);
});
