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
    paymentStatusValidator,
    reconciliationCaseIdValidator,
    reconciliationReviewActionValidator,
    reconciliationCaseListValidator,
    revenueValidator,
    manualRefundCreateValidator,
    manualRefundIdValidator,
    manualRefundSettleValidator,
    manualRefundRejectValidator,
} = require('../../validators/payment.validator');

const defaultGuards = { authenticate, optionalAuth, authorize };
const defaultValidators = { initiatePaymentValidator, refundValidator, paymentListValidator, paymentIdValidator, paymentStatusValidator, revenueValidator, reconciliationCaseIdValidator, reconciliationCaseListValidator, reconciliationReviewActionValidator, manualRefundCreateValidator, manualRefundIdValidator, manualRefundSettleValidator, manualRefundRejectValidator };
const defaultValidation = { validate };

function createPaymentRouter({ paymentController, guards = defaultGuards, validators = defaultValidators, validation = defaultValidation, expressModule = express } = {}) {
const router = expressModule.Router();
const { authenticate, optionalAuth, authorize } = guards;
const { initiatePaymentValidator, refundValidator, paymentListValidator, paymentIdValidator, paymentStatusValidator, revenueValidator, reconciliationCaseIdValidator, reconciliationCaseListValidator, reconciliationReviewActionValidator, manualRefundCreateValidator, manualRefundIdValidator, manualRefundSettleValidator, manualRefundRejectValidator } = { ...defaultValidators, ...validators };
const { validate } = validation;
const resolvedPaymentStatusValidator = paymentStatusValidator || defaultValidators.paymentStatusValidator;
const notImplemented = (_req, res) => res.status(501).json({ success: false, message: 'Not implemented' });
const customerPaymentStatusHandler = paymentController.getCustomerPaymentStatus || ((_req, _res, next) => next());

// Administrative payment history and detail (report Table 2.1).
router.get(
    '/',
    authenticate,
    authorize('admin'),
    paymentListValidator,
    validate,
    paymentController.getAllPayments
);

router.get('/reconciliation-cases', authenticate, authorize('admin', 'staff'), reconciliationCaseListValidator, validate, paymentController.getReconciliationCases || notImplemented);
router.get('/reconciliation-cases/:id', authenticate, authorize('admin', 'staff'), reconciliationCaseIdValidator, validate, paymentController.getReconciliationCaseById || notImplemented);
router.get('/reconciliation-metrics', authenticate, authorize('admin', 'staff'), paymentController.getReconciliationMetrics || notImplemented);
router.get('/reconciliation-metrics/prometheus', authenticate, authorize('admin', 'staff'), paymentController.getReconciliationMetricsPrometheus || notImplemented);
router.post('/reconciliation-cases/:id/manual-review', authenticate, authorize('admin', 'staff'), reconciliationReviewActionValidator, validate, paymentController.recordManualReviewAction || notImplemented);
router.post('/:paymentId/manual-refund', authenticate, authorize('admin'), manualRefundCreateValidator, validate, paymentController.createManualPayosRefund || notImplemented);
router.get('/manual-refunds', authenticate, authorize('admin'), paymentController.listManualPayosRefunds || notImplemented);
router.get('/manual-refunds/:id', authenticate, authorize('admin'), manualRefundIdValidator, validate, paymentController.getManualPayosRefund || notImplemented);
router.post('/manual-refunds/:id/settle', authenticate, authorize('admin'), manualRefundSettleValidator, validate, paymentController.settleManualPayosRefund || notImplemented);
router.post('/manual-refunds/:id/reject', authenticate, authorize('admin'), manualRefundRejectValidator, validate, paymentController.rejectManualPayosRefund || notImplemented);

// Initiate payment (customer or guest — booking must belong to them)
router.post('/initiate', optionalAuth, initiatePaymentValidator, validate, paymentController.initiatePayment);

// Customer status is read-only and must remain before the generic /:id route.
router.get('/bookings/:bookingId/status', optionalAuth, resolvedPaymentStatusValidator, validate, customerPaymentStatusHandler);

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
