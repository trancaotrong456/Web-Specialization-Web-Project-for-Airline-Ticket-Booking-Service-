const paymentService = require('../services/payment.service');
const ApiResponse = require('../utils/apiResponse');

class PaymentController {
  async getAllPayments(req, res, next) {
    try {
      const result = await paymentService.getAllPayments(req.query);
      return ApiResponse.paginated(res, result, 'Payments retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getPaymentById(req, res, next) {
    try {
      const payment = await paymentService.getPaymentById(req.params.id);
      return ApiResponse.success(res, payment, 'Payment retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

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

  // payOS VietQR webhook (server-to-server)
  async payosWebhook(req, res, next) {
    try {
      const result = await paymentService.handlePayosWebhook(req.body);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  // Local academic demo only; the service rejects this action in production.
  async payosDemoWebhook(req, res, next) {
    try {
      const result = await paymentService.handlePayosDemoWebhook(req.body);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  // The browser redirect never confirms success. Cancellation is re-checked
  // against payOS before the booking is returned to a payable state.
  async payosReturn(req, res, next) {
    try {
      const result = await paymentService.handlePayosReturn(req.query);
      return ApiResponse.success(res, result, 'payOS return processed');
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
