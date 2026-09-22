const paymentService = require('../services/payment.service');
const ApiResponse = require('../utils/apiResponse');

class PaymentController {
  async initiatePayment(req, res, next) {
    try {
      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
      const result = await paymentService.initiatePayment({
        ...req.body,
        ip_addr: clientIp,
        currentUser: req.user || null,
      });
      return ApiResponse.success(res, result, 'Payment initiated successfully');
    } catch (error) {
      next(error);
    }
  }

  // VNPay Return URL (Customer Browser Redirect)
  async vnpayReturn(req, res, next) {
    try {
      const result = await paymentService.handleVnpayReturn(req.query);
      return ApiResponse.success(res, result, 'VNPay return verified');
    } catch (error) {
      next(error);
    }
  }

  // VNPay IPN (Webhook)
  async vnpayIpn(req, res) {
    try {
      const result = await paymentService.handleVnpayIpn(req.query);
      // VNPay expects HTTP 200 with JSON { RspCode: '...', Message: '...' }
      return res.status(200).json(result);
    } catch (error) {
      console.error('[VNPay IPN Error]', error);
      return res.status(200).json({ RspCode: '99', Message: 'Unknown error' });
    }
  }

  // MoMo IPN Callback
  async momoCallback(req, res, next) {
    try {
      const result = await paymentService.handleMomoCallback(req.body);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  // Refund Endpoint (Admin / Staff)
  async refund(req, res, next) {
    try {
      const bookingId = req.params.id;
      const { reason } = req.body;
      const result = await paymentService.processRefund(bookingId, reason, req.user);
      return ApiResponse.success(res, result, 'Booking payment refunded successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new PaymentController();
