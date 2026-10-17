const test = require('node:test');
const assert = require('node:assert/strict');
const { createNotificationModule, getDefaultNotificationModule } = require('../modules/notification');
const { buildContainer } = require('../application/buildContainer');

test('canonical notification module is injected and mounted exactly once', () => {
  const defaultModule = getDefaultNotificationModule();
  const container = buildContainer();
  assert.equal(container.notificationModule, defaultModule);
  assert.equal(require('../routes/notification.route'), defaultModule.router);
  assert.equal(container.apiRouter.stack.filter((layer) => layer.handle === defaultModule.router).length, 1);
});

test('an explicitly injected notification module is the module mounted by the container', () => {
  const injected = createNotificationModule({
    repository: {},
    guards: { authenticate(_req, _res, next) { next(); } },
  });
  const container = buildContainer({ notificationModule: injected });
  assert.equal(container.notificationModule, injected);
  assert.equal(container.apiRouter.stack.filter((layer) => layer.handle === injected.router).length, 1);
});
