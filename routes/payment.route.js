const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const revenueController = require('../controllers/revenue.controller');
const authenticate = require('../middlewares/auth.middleware');
const optionalAuth = require('../middlewares/optionalAuth.middleware');
const authorize = require('../middlewares/rbac.middleware');
const validate = require('../middlewares/validate.middleware');
const { initiatePaymentValidator, refundValidator } = require('../validators/payment.validator');

// Initiate payment (customer or guest — booking must belong to them)
router.post('/initiate', optionalAuth, initiatePaymentValidator, validate, paymentController.initiatePayment);

// VNPay Return URL (Browser redirect from VNPay)
router.get('/vnpay/return', paymentController.vnpayReturn);

// VNPay IPN / Webhook (Server-to-server, VNPay calls this)
router.get('/vnpay/ipn', paymentController.vnpayIpn);

// MoMo Callback / IPN (Server-to-server webhook — hỗ trợ đồng thời cả /momo/ipn và /momo/callback)
router.post('/momo/ipn', paymentController.momoCallback);
router.post('/momo/callback', paymentController.momoCallback);
// Admin only: Revenue statistics
router.get(
    '/stats/revenue',
    authenticate,
    authorize('admin'),
    revenueController.getRevenueStatistics
  );
// Admin only: Refund a confirmed booking (Quy tắc nghiệp vụ 1, Chức năng 3)
router.post('/bookings/:id/refund', authenticate, authorize('admin'), refundValidator, validate, paymentController.refund);

module.exports = router;
