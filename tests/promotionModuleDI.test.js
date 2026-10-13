const test = require('node:test');
const assert = require('node:assert/strict');
const { createPromotionModule, getDefaultPromotionModule } = require('../modules/promotion');
const { buildContainer } = require('../application/buildContainer');

test('legacy Promotion adapters, default container and route tree share one module', () => {
  const module = getDefaultPromotionModule();
  const container = buildContainer();
  assert.equal(require('../services/promotion.service'), module.service);
  assert.equal(require('../controllers/promotion.controller'), module.controller);
  assert.equal(require('../routes/promotion.route'), module.router);
  assert.equal(container.promotionModule, module);
  assert.equal(container.apiRouter, require('../routes'));
  assert.equal(container.apiRouter.stack.filter((layer) => layer.handle === module.router).length, 1);
});

test('explicit Promotion module is used after default router was cached', () => {
  const defaultRouter = require('../routes');
  const injected = createPromotionModule({ repository: {}, guards: { authenticate() {}, authorize: () => () => {} } });
  const container = buildContainer({ promotionModule: injected });
  assert.notEqual(container.apiRouter, defaultRouter);
  assert.equal(container.promotionModule, injected);
  assert.equal(container.apiRouter.stack.filter((layer) => layer.handle === injected.router).length, 1);
});
