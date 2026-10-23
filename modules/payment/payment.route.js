const express = require('express');
const authenticate = require('../../middlewares/auth.middleware');
const optionalAuth = require('../../middlewares/optionalAuth.middleware');
const authorize = require('../../middlewares/rbac.middleware');
const validate = require('../../middlewares/validate.middleware');
const {
    initiatePaymentValidator,
    refundValidator,
    paymentListValidator,
    paymentIdValidator,
    reconciliationCaseIdValidator,
    reconciliationCaseListValidator,
    revenueValidator,
} = require('../../validators/payment.validator');

const defaultGuards = { authenticate, optionalAuth, authorize };
const defaultValidators = { initiatePaymentValidator, refundValidator, paymentListValidator, paymentIdValidator, revenueValidator, reconciliationCaseIdValidator, reconciliationCaseListValidator };
const defaultValidation = { validate };

function createPaymentRouter({ paymentController, guards = defaultGuards, validators = defaultValidators, validation = defaultValidation, expressModule = express } = {}) {
const router = expressModule.Router();
const { authenticate, optionalAuth, authorize } = guards;
const { initiatePaymentValidator, refundValidator, paymentListValidator, paymentIdValidator, revenueValidator, reconciliationCaseIdValidator, reconciliationCaseListValidator } = validators;
const { validate } = validation;

// Administrative payment history and detail (report Table 2.1).
router.get(
    '/',
    authenticate,
    authorize('admin'),
    paymentListValidator,
    validate,
    paymentController.getAllPayments
);

router.get('/reconciliation-cases', authenticate, authorize('admin', 'staff'), reconciliationCaseListValidator, validate, paymentController.getReconciliationCases);
router.get('/reconciliation-cases/:id', authenticate, authorize('admin', 'staff'), reconciliationCaseIdValidator, validate, paymentController.getReconciliationCaseById);

// Initiate payment (customer or guest — booking must belong to them)
router.post('/initiate', optionalAuth, initiatePaymentValidator, validate, paymentController.initiatePayment);

// VNPay Return URL (Browser redirect from VNPay)
router.get('/vnpay/return', paymentController.vnpayReturn);

// VNPay IPN / Webhook (Server-to-server, VNPay calls this)
router.get('/vnpay/ipn', paymentController.vnpayIpn);

// payOS VietQR: browser redirect is informational; the webhook changes payment state.
router.get('/payos/return', paymentController.payosReturn);
router.post('/payos/webhook', paymentController.payosWebhook);
router.post('/payos/demo-webhook', paymentController.payosDemoWebhook);

// Admin only: Revenue statistics by day/month
router.get(
    '/revenue',
    authenticate,
    authorize('admin'),
    revenueValidator,
    validate,
    paymentController.getRevenue
);

router.post('/:id/vnpay/query', authenticate, authorize('admin'), paymentIdValidator, validate, paymentController.queryVnpay);
router.post('/:id/vnpay/refund', authenticate, authorize('admin'), refundValidator, validate, paymentController.refundVnpay);

// Keep this parameter route after named gateway routes so, for example,
// `/vnpay/return` is never interpreted as a payment id.
router.get('/:id', authenticate, authorize('admin'), paymentIdValidator, validate, paymentController.getPaymentById);

// Admin only: Refund a confirmed booking (Quy tắc nghiệp vụ 1, Chức năng 3)
router.post('/bookings/:id/refund', authenticate, authorize('admin'), refundValidator, validate, paymentController.refund);

return router;
}

module.exports = createPaymentRouter;
