'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const createPaymentRouter = require('../modules/payment/payment.route');

function appForRole(role) {
  const service = {
    async getReconciliationCases() { return { data: [], total: 0, page: 1, limit: 20 }; },
    async getReconciliationCaseById() { return { id: 1 }; },
  };
  const controller = {
    getReconciliationCases(req, res) { return res.json({ ok: true, role: req.user.role.name }); },
    getReconciliationCaseById(req, res) { return res.json({ ok: true, id: req.params.id }); },
    getPaymentById() {},
    getAllPayments() {}, initiatePayment() {}, vnpayReturn() {}, vnpayIpn() {}, payosWebhook() {},
    payosDemoWebhook() {}, payosReturn() {}, getRevenue() {}, refund() {}, queryVnpay() {}, refundVnpay() {},
  };
  const guards = {
    authenticate(req, _res, next) { req.user = role ? { role: { name: role } } : null; next(); },
    optionalAuth: (_req, _res, next) => next(),
    authorize: (...roles) => (req, res, next) => {
      if (!req.user) return res.status(401).json({ success: false });
      if (!roles.includes(req.user.role.name)) return res.status(403).json({ success: false });
      next();
    },
  };
  const validators = {
    reconciliationCaseListValidator: [], reconciliationCaseIdValidator: [], initiatePaymentValidator: [],
    refundValidator: [], paymentListValidator: [], paymentIdValidator: [], revenueValidator: [],
  };
  const validation = { validate: (_req, _res, next) => next() };
  const app = express();
  app.use('/api/v1/payments', createPaymentRouter({ paymentController: controller, guards, validators, validation }));
  return app;
}

test('IT-48 reconciliation list/detail allow Admin and Staff and deny unauthenticated/users', async () => {
  for (const [role, expected] of [['admin', 200], ['staff', 200], ['customer', 403], [null, 401]]) {
    const response = await new Promise((resolve) => {
      const server = appForRole(role).listen(0, '127.0.0.1', async () => {
        const port = server.address().port;
        const list = await fetch(`http://127.0.0.1:${port}/api/v1/payments/reconciliation-cases`);
        const detail = await fetch(`http://127.0.0.1:${port}/api/v1/payments/reconciliation-cases/1`);
        server.close(() => resolve([list.status, detail.status]));
      });
    });
    assert.deepEqual(response, [expected, expected]);
  }
});
