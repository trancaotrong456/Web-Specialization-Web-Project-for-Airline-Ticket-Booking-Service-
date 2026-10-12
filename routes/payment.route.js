const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const authenticate = require('../middlewares/auth.middleware');
const optionalAuth = require('../middlewares/optionalAuth.middleware');
const authorize = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const {
    initiatePaymentValidator,
    refundValidator,
    paymentListValidator,
    paymentIdValidator,
    revenueValidator,
} = require('../validators/payment.validator');

// Administrative payment history and detail (report Table 2.1).
router.get(
    '/',
    authenticate,
    authorize('admin'),
    paymentListValidator,
    validate,
    paymentController.getAllPayments
);

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

// Keep this parameter route after named gateway routes so, for example,
// `/vnpay/return` is never interpreted as a payment id.
router.get('/:id', authenticate, authorize('admin'), paymentIdValidator, validate, paymentController.getPaymentById);

// Admin only: Refund a confirmed booking (Quy tắc nghiệp vụ 1, Chức năng 3)
router.post('/bookings/:id/refund', authenticate, authorize('admin'), refundValidator, validate, paymentController.refund);

module.exports = router;
