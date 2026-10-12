const test = require('node:test');
const assert = require('node:assert/strict');
const paymentRouter = require('../routes/payment.route');

test('payment gateway routes are registered before the payment id route', () => {
  const routes = paymentRouter.stack
    .filter((layer) => layer.route)
    .map((layer) => ({ path: layer.route.path, methods: Object.keys(layer.route.methods) }));
  const detailIndex = routes.findIndex((route) => route.path === '/:id');
  const vnpayReturnIndex = routes.findIndex((route) => route.path === '/vnpay/return');
  const payosReturnIndex = routes.findIndex((route) => route.path === '/payos/return');

  assert.ok(detailIndex > vnpayReturnIndex);
  assert.ok(detailIndex > payosReturnIndex);
});
