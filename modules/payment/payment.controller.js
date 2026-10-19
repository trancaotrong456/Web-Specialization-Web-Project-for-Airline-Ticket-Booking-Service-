const ApiResponse = require('../../utils/apiResponse');
const { normalizeGuestEmail } = require('../../utils/guestEmail.util');

class PaymentController {
  constructor({ service, apiResponse = ApiResponse } = {}) {
    if (!service) throw new TypeError('A Payment service is required');
    this.service = service;
    this.apiResponse = apiResponse;
    for (const name of ['getAllPayments', 'getPaymentById', 'initiatePayment', 'vnpayReturn', 'vnpayIpn', 'payosWebhook', 'payosDemoWebhook', 'payosReturn', 'getRevenue', 'refund']) {
      this[name] = this[name].bind(this);
    }
  }
  async getAllPayments(req, res, next) {
    try {
      const result = await this.service.getAllPayments(req.query);
      return this.apiResponse.paginated(res, result, 'Payments retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getPaymentById(req, res, next) {
    try {
      const payment = await this.service.getPaymentById(req.params.id);
      return this.apiResponse.success(res, payment, 'Payment retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async initiatePayment(req, res, next) {
    try {
      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
      const result = await this.service.initiatePayment({
        ...req.body,
        guest_email: normalizeGuestEmail(req.body.guest_email),
        ip_addr: clientIp,
        currentUser: req.user || null,
        idempotency_key: req.headers['idempotency-key'] || null,
      });
      return this.apiResponse.success(res, result, 'Payment initiated successfully');
    } catch (error) {
      next(error);
    }
  }

  // VNPay Return URL (Customer Browser Redirect)
  async vnpayReturn(req, res, next) {
    try {
      const result = await this.service.handleVnpayReturn(req.query);
      return this.apiResponse.success(res, result, 'VNPay return verified');
    } catch (error) {
      next(error);
    }
  }

  // VNPay IPN (Webhook)
  async vnpayIpn(req, res) {
    try {
      const result = await this.service.handleVnpayIpn(req.query);
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
      const result = await this.service.handlePayosWebhook(req.body);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  // Local academic demo only; the service rejects this action in production.
  async payosDemoWebhook(req, res, next) {
    try {
      const result = await this.service.handlePayosDemoWebhook(req.body);
      return res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  // The browser redirect never confirms success. Cancellation is re-checked
  // against payOS before the booking is returned to a payable state.
  async payosReturn(req, res, next) {
    try {
      const result = await this.service.handlePayosReturn(req.query);
      return this.apiResponse.success(res, result, 'payOS return processed');
    } catch (error) {
      next(error);
    }
  }

  // Revenue Statistics (Admin)
  async getRevenue(req, res, next) {
    try {
      const result = await this.service.getRevenue(req.query);

      return this.apiResponse.success(
        res,
        result,
        'Revenue statistics retrieved successfully'
      );
    } catch (error) {
      next(error);
    }
  }
  // Refund Endpoint (Admin / Staff)
  async refund(req, res, next) {
    try {
      const bookingId = req.params.id;
      const { reason } = req.body;
      const result = await this.service.processRefund(bookingId, reason, req.user);
      return this.apiResponse.success(res, result, 'Booking payment refunded successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = PaymentController;
