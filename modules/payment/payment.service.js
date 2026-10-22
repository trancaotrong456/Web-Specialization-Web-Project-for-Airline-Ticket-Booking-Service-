const {
  signVnpayParams,
  verifyVnpayChecksum,
  signPayosDemoPayload,
  verifyPayosDemoSignature,
} = require('../../utils/checksum.util');
const { PayOS } = require('@payos/node');
const QRCode = require('qrcode');
const { getIO } = require('../../sockets');
const { verifyBookingAccess } = require('../../utils/bookingAccess.util');
const { resolvePaymentReturnUrl } = require('../../utils/paymentReturnUrl.util');
const { normalizeGuestEmail } = require('../../utils/guestEmail.util');
const { releaseBookingFlightSeats } = require('../../utils/bookingItinerary.util');
const { getVnpayConfig } = require('../../config/vnpay');
const crypto = require('crypto');
const { VnpayGateway } = require('./vnpay.gateway');

// Format date to yyyyMMddHHmmss for VNPay
const formatDateVnpay = (date) => {
  const pad = (n) => (n < 10 ? '0' + n : n);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).reduce((result, part) => { result[part.type] = part.value; return result; }, {});
  const year = parts.year;
  const month = parts.month;
  const day = parts.day;
  const hours = parts.hour;
  const minutes = parts.minute;
  const seconds = parts.second;
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
};

class PaymentService {
  constructor({ repository, transactionManager, socket = getIO, flightSeatService, payOSFactory, qrCode = QRCode, emailProvider, vnpayGateway } = {}) {
    if (!repository || !transactionManager) throw new TypeError('Payment repository and transaction manager are required');
    this.repository = repository;
    this.transactionManager = transactionManager;
    this.socket = socket;
    this.flightSeatService = flightSeatService;
    this.payOSFactory = payOSFactory;
    this.qrCode = qrCode;
    this.emailProvider = emailProvider;
    this.vnpayGateway = vnpayGateway || new VnpayGateway();
  }

  _isPaymentConfirmationWindowExpired(booking, now = new Date()) {
    if (!booking.hold_expires_at) return true;
    const configuredGrace = Number.parseFloat(process.env.PAYMENT_PENDING_GRACE_MINUTES || '5');
    const graceMinutes = Number.isFinite(configuredGrace) && configuredGrace >= 0 ? configuredGrace : 5;
    const deadline = new Date(booking.hold_expires_at).getTime() + graceMinutes * 60 * 1000;
    return !Number.isFinite(deadline) || now.getTime() > deadline;
  }
  /**
   * Administrative payment history. Payment gateways can disclose only the
   * fields required by the dashboard; no provider secrets are ever stored or
   * returned by this endpoint.
   */
  async getAllPayments({ page = 1, limit = 20, status, payment_method, booking_id } = {}) {
    const normalizedPage = Math.max(1, Number.parseInt(page, 10) || 1);
    const normalizedLimit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 20));
    const where = {};

    if (status) where.status = status;
    if (payment_method) where.payment_method = payment_method;
    if (booking_id) where.booking_id = booking_id;

    const { count, rows } = await this.repository.listPayments({ where, limit: normalizedLimit, offset: (normalizedPage - 1) * normalizedLimit });

    return { total: count, page: normalizedPage, limit: normalizedLimit, data: rows };
  }

  async getPaymentById(id) {
    const payment = await this.repository.findPaymentDetail(id);

    if (!payment) {
      const error = new Error('Payment not found');
      error.statusCode = 404;
      throw error;
    }

    return payment;
  }

  _getPayOSMode() {
    const mode = (process.env.PAYOS_MODE || 'disabled').toLowerCase();
    if (!['disabled', 'demo', 'live'].includes(mode)) {
      const error = new Error(`Invalid PAYOS_MODE '${mode}'.`);
      error.statusCode = 500;
      throw error;
    }
    return mode;
  }

  _getPayOSDemoSecret() {
    return process.env.PAYOS_DEMO_SECRET || 'local-academic-demo-only';
  }

  _assertPayOSDemoAllowed() {
    if (this._getPayOSMode() !== 'demo' || process.env.NODE_ENV === 'production') {
      const error = new Error('payOS demo webhook is available only in local demo mode.');
      error.statusCode = 403;
      throw error;
    }
  }

  _getPayOSClient() {
    if (this._getPayOSMode() !== 'live') {
      const error = new Error('payOS live integration is not enabled. Set PAYOS_MODE=live after configuring a Payment Channel.');
      error.statusCode = 503;
      throw error;
    }

    const required = ['PAYOS_CLIENT_ID', 'PAYOS_API_KEY', 'PAYOS_CHECKSUM_KEY'];
    const missing = required.filter((key) => !process.env[key] || !process.env[key].trim());

    if (missing.length > 0) {
      const error = new Error(`payOS is not configured. Missing: ${missing.join(', ')}`);
      error.statusCode = 503;
      throw error;
    }

    return this.payOSFactory ? this.payOSFactory({
      clientId: process.env.PAYOS_CLIENT_ID,
      apiKey: process.env.PAYOS_API_KEY,
      checksumKey: process.env.PAYOS_CHECKSUM_KEY,
      baseURL: process.env.PAYOS_BASE_URL || undefined,
    }) : new PayOS({
      clientId: process.env.PAYOS_CLIENT_ID,
      apiKey: process.env.PAYOS_API_KEY,
      checksumKey: process.env.PAYOS_CHECKSUM_KEY,
      baseURL: process.env.PAYOS_BASE_URL || undefined,
    });
  }

  _getVnpayConfig() {
    return getVnpayConfig(process.env);
  }

  async _restoreHoldingAfterGatewayFailure(bookingId, transactionRef) {
    await this.transactionManager.transaction(async (t) => {
      const booking = await this.repository.findLockedBooking(bookingId, t);
      const payment = await this.repository.findPendingPaymentForGatewayFailure(bookingId, transactionRef, t);

      // Do not overwrite a webhook or another workflow that already changed state.
      if (booking && payment && booking.status === 'pending_payment') {
        await this.repository.destroy(payment, { transaction: t });
        booking.status = 'holding';
        await this.repository.save(booking, { transaction: t });
      }
    });
  }

  async _markPayosPaymentFailed(paymentId, bookingId) {
    let seatUpdates = [];

    await this.transactionManager.transaction(async (t) => {
      const payment = await this.repository.findLockedPaymentById(paymentId, t);
      const booking = await this.repository.findLockedBookingWithPassengers(bookingId, t);

      if (!payment || !booking || payment.status === 'success' || booking.status === 'confirmed') return;
      if (booking.status !== 'pending_payment') return;

      payment.status = 'failed';
      await this.repository.save(payment, { transaction: t });

      const holdIsValid = booking.hold_expires_at && new Date() <= new Date(booking.hold_expires_at);
      if (holdIsValid) {
        booking.status = 'holding';
        await this.repository.save(booking, { transaction: t });
        return;
      }

      booking.status = 'expired';
      await this.repository.save(booking, { transaction: t });

      seatUpdates = await releaseBookingFlightSeats(booking, { repository: this.repository, transaction: t, findFlight: this.repository.findLockedFlight.bind(this.repository) });

      if (booking.promotion_id) {
        const promo = await this.repository.findLockedPromotion(booking.promotion_id, t);
        if (promo && promo.used_count > 0) {
          await this.repository.decrement(promo, 'used_count', { by: 1, transaction: t });
        }
      }
    });

    await this._emitSeatUpdates(seatUpdates);
  }

  /**
   * Helper to safely emit socket event
   */
  async _emitSocketSeatUpdate(flightId, availableSeats) {
    try {
      const io = this.socket();
      io.to(`flight_${flightId}`).emit('flight_seats_updated', {
        flight_id: flightId,
        available_seats: availableSeats,
      });
      io.emit('flight_seats_updated', {
        flight_id: flightId,
        available_seats: availableSeats,
      });
    } catch (_err) {
      // Ignore if socket not initialized
    }

    await (this.flightSeatService || require('../../services/flight.service')).checkAndEmitSeatWarning(flightId);
  }
  async _emitSeatUpdates(updates = []) {
    for (const update of updates) await this._emitSocketSeatUpdate(update.flight_id, update.available_seats);
  }

  /**
   * Helper to send booking confirmed email in background
   */
  async _triggerBookingConfirmationEmail(bookingId) {
    try {
      // Lazy load to avoid circular dependency
      const emailService = this.emailProvider || require('../../services/email.service');
      await emailService.sendBookingConfirmation(bookingId);
    } catch (error) {
      console.error(`[Email] Failed to send ticket confirmation email for booking #${bookingId}:`, error.message);
    }
  }

  /**
   * 1. Initiate Payment: holding -> pending_payment -> build gateway URL
   */
  async initiatePayment({ booking_id, payment_method, ip_addr = '127.0.0.1', return_url, currentUser = null, guest_email = null }) {
    guest_email = normalizeGuestEmail(guest_email);
    // payOS requires a numeric orderCode. Timestamp plus three random digits
    // stays below Number.MAX_SAFE_INTEGER and avoids same-millisecond collisions.
    const vnpayConfig = payment_method === 'vnpay' ? this._getVnpayConfig() : null;
    if (payment_method === 'vnpay' && !vnpayConfig.enabled) {
      const error = new Error('VNPay is disabled. Set VNPAY_MODE=sandbox or production after configuring credentials.');
      error.statusCode = 503;
      throw error;
    }
    const txnRef = payment_method === 'payos'
      ? String(Date.now() * 1000 + Math.floor(Math.random() * 1000))
      : `TXN_${booking_id}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    let bookingData = null;
    const payosMode = payment_method === 'payos' ? this._getPayOSMode() : null;

    if (payment_method === 'payos' && payosMode === 'disabled') {
      const error = new Error('payOS/VietQR is currently disabled. Use VNPay or enable local demo mode.');
      error.statusCode = 503;
      throw error;
    }
    if (payment_method === 'payos' && payosMode === 'demo' && process.env.NODE_ENV === 'production') {
      const error = new Error('payOS demo mode is forbidden in production.');
      error.statusCode = 503;
      throw error;
    }

    const payOS = payment_method === 'payos' && payosMode === 'live'
      ? this._getPayOSClient()
      : null;

    // Validate redirect destinations before changing booking/payment state.
    // This avoids leaving a booking in pending_payment when a client submits
    // an invalid or untrusted return URL.
    let resolvedReturnUrl = null;
    let resolvedCancelUrl = null;
    if (payment_method === 'vnpay') {
      const localFrontendReturnUrl = process.env.CLIENT_URL
        ? new URL('/payment/vnpay-return', process.env.CLIENT_URL).toString()
        : null;
      resolvedReturnUrl = resolvePaymentReturnUrl(
        return_url,
        process.env.VNP_RETURN_URL,
        localFrontendReturnUrl
      );
      if (!resolvedReturnUrl) {
        const error = new Error('VNPay return URL is not configured. Set VNP_RETURN_URL or CLIENT_URL.');
        error.statusCode = 503;
        throw error;
      }
    } else if (payment_method === 'payos' && payosMode === 'live') {
      resolvedReturnUrl = resolvePaymentReturnUrl(return_url, process.env.PAYOS_RETURN_URL);
      resolvedCancelUrl = resolvePaymentReturnUrl(null, process.env.PAYOS_CANCEL_URL);
      if (!resolvedReturnUrl || !resolvedCancelUrl) {
        const error = new Error('payOS return and cancel URLs must be configured.');
        error.statusCode = 503;
        throw error;
      }
    }

    // STEP 1: Update status to pending_payment in transaction with row-lock
    await this.transactionManager.transaction(async (t) => {
      const booking = await this.repository.findLockedBooking(booking_id, t);

      if (!booking) {
        const error = new Error('Booking not found');
        error.statusCode = 404;
        throw error;
      }

      verifyBookingAccess(booking, currentUser, guest_email);

      // CRITICAL: Must be in holding status
      if (booking.status !== 'holding') {
        const error = new Error(`Booking cannot be paid. Current status is '${booking.status}', must be 'holding'`);
        error.statusCode = 400;
        throw error;
      }

      // Check if hold expired
      if (booking.hold_expires_at && new Date() > new Date(booking.hold_expires_at)) {
        const error = new Error('Booking hold duration has expired. Please create a new booking.');
        error.statusCode = 400;
        throw error;
      }

      const flight = await this.repository.findLockedFlight(booking.flight_id, t);
      if (!flight || flight.status !== 'scheduled') {
        const error = new Error('Booking cannot be paid because the flight is no longer scheduled');
        error.statusCode = 400;
        throw error;
      }
      const departureTime = new Date(flight.departure_time);
      if (Number.isNaN(departureTime.getTime()) || departureTime.getTime() <= Date.now()) {
        const error = new Error('Booking cannot be paid because the flight has already departed');
        error.statusCode = 400;
        throw error;
      }

      // Transition to pending_payment
      booking.status = 'pending_payment';
      await this.repository.save(booking, { transaction: t });

      // Create pending payment record
      await this.repository.createPayment(
        {
          booking_id: booking.id,
          amount: booking.total_amount,
          payment_method,
          status: 'pending',
          transaction_ref: txnRef,
        },
        { transaction: t }
      );

      bookingData = booking;
    });

    // STEP 2: Build Payment Gateway URL
    let paymentUrl = '';

    if (payment_method === 'vnpay') {
      const tmnCode = vnpayConfig.tmnCode;
      const secretKey = vnpayConfig.hashSecret;
      const vnpUrl = vnpayConfig.endpoint;
      const finalReturnUrl = resolvedReturnUrl;

      const createDate = formatDateVnpay(new Date());
      const amountInVnd = Math.round(Number(bookingData.total_amount) * 100);

      const vnpParams = {
        vnp_Version: '2.1.0',
        vnp_Command: 'pay',
        vnp_TmnCode: tmnCode,
        vnp_Locale: 'vn',
        vnp_CurrCode: 'VND',
        vnp_TxnRef: txnRef,
        vnp_OrderInfo: `Thanh toan ve may bay ${bookingData.booking_code}`,
        vnp_OrderType: 'other',
        vnp_Amount: amountInVnd,
        vnp_ReturnUrl: finalReturnUrl,
        vnp_IpAddr: ip_addr,
        vnp_CreateDate: createDate,
      };

      const secureHash = signVnpayParams(vnpParams, secretKey);

      // Construct final URL
      const queryStringParts = [];
      Object.keys(vnpParams).sort().forEach((key) => {
        queryStringParts.push(`${key}=${encodeURIComponent(vnpParams[key]).replace(/%20/g, '+')}`);
      });
      queryStringParts.push(`vnp_SecureHash=${secureHash}`);

      paymentUrl = `${vnpUrl}?${queryStringParts.join('&')}`;
    } else if (payment_method === 'payos') {
      if (payosMode === 'demo') {
        const amount = Math.round(Number(bookingData.total_amount));
        const demoData = {
          orderCode: Number(txnRef),
          amount,
          status: 'success',
          timestamp: Date.now(),
        };
        const signature = signPayosDemoPayload(demoData, this._getPayOSDemoSecret());
        const qrPayload = JSON.stringify({
          type: 'VIETQR_ACADEMIC_DEMO',
          provider: 'payOS-demo-adapter',
          bookingCode: bookingData.booking_code,
          orderCode: demoData.orderCode,
          amount,
          currency: 'VND',
          transferContent: `DATVE ${bookingData.booking_code}`,
          warning: 'MO PHONG - KHONG CHUYEN TIEN THAT',
        });
        const qrCode = await this.qrCode.toDataURL(qrPayload, {
          errorCorrectionLevel: 'M',
          margin: 2,
          width: 320,
        });

        return {
          payment_url: null,
          qr_code: qrCode,
          qr_payload: qrPayload,
          payment_link_id: `demo_${txnRef}`,
          transaction_ref: txnRef,
          booking_id: bookingData.id,
          amount: bookingData.total_amount,
          status: 'pending_payment',
          mode: 'demo',
          demo_notice: 'Academic simulation only. No real bank transfer is performed.',
          demo_webhook: {
            method: 'POST',
            url: '/api/v1/payments/payos/demo-webhook',
            body: { ...demoData, signature },
          },
        };
      }

      const returnUrl = resolvedReturnUrl;
      const cancelUrl = resolvedCancelUrl;

      try {
        const paymentLink = await payOS.paymentRequests.create({
          orderCode: Number(txnRef),
          amount: Math.round(Number(bookingData.total_amount)),
          description: `Ve may bay ${bookingData.booking_code}`.slice(0, 25),
          returnUrl,
          cancelUrl,
          items: [{
            name: `Ve bay ${bookingData.booking_code}`.slice(0, 25),
            quantity: 1,
            price: Math.round(Number(bookingData.total_amount)),
          }],
        });

        paymentUrl = paymentLink.checkoutUrl;
        return {
          payment_url: paymentUrl,
          qr_code: paymentLink.qrCode,
          payment_link_id: paymentLink.paymentLinkId,
          transaction_ref: txnRef,
          booking_id: bookingData.id,
          amount: bookingData.total_amount,
          status: 'pending_payment',
        };
      } catch (gatewayError) {
        // A timeout is ambiguous: payOS may have created the link even though
        // the response was lost. Keep the attempt pending for webhook/query
        // reconciliation so a real charge cannot be discarded.
        const error = new Error(`Unable to confirm payOS payment-link creation: ${gatewayError.message}`);
        error.statusCode = 502;
        error.transactionRef = txnRef;
        throw error;
      }
    }

    return {
      payment_url: paymentUrl,
      transaction_ref: txnRef,
      booking_id: bookingData.id,
      amount: bookingData.total_amount,
      status: 'pending_payment',
    };
  }

  /**
   * 2. VNPay Return URL (Customer Browser Redirect)
   * ONLY parses and verifies checksum to display UI, DOES NOT mutate database.
   */
  async handleVnpayReturn(queryParams) {
    const config = this._getVnpayConfig();
    if (!config.enabled) {
      return { isValidChecksum: false, isSuccess: false, message: 'VNPay is disabled' };
    }
    const secretKey = config.hashSecret;
    const isValidChecksum = verifyVnpayChecksum(queryParams, secretKey);
    const isValidTmnCode = queryParams.vnp_TmnCode === config.tmnCode;

    const responseCode = queryParams.vnp_ResponseCode;
    const txnRef = queryParams.vnp_TxnRef;
    const amount = Number(queryParams.vnp_Amount || 0) / 100;

    let booking = null;
    let isValidAmount = false;
    if (txnRef) {
      const payment = await this.repository.findPaymentWithBookingByRef(txnRef);
      if (payment) {
        booking = payment.booking;
        isValidAmount = Math.round(Number(payment.amount)) === Math.round(amount);
      }
    }

    return {
      isValidChecksum,
      isValidTmnCode,
      isValidAmount,
      isSuccess: isValidChecksum && isValidTmnCode && isValidAmount && responseCode === '00',
      responseCode,
      transactionRef: txnRef,
      amount,
      bookingId: booking ? booking.id : null,
      bookingCode: booking ? booking.booking_code : null,
      message:
        !isValidChecksum
          ? 'Invalid signature checksum'
          : !isValidTmnCode
            ? 'Invalid merchant code'
            : !isValidAmount
              ? 'Invalid amount'
              : responseCode === '00'
                ? 'Payment transaction processed successfully'
                : `Payment failed with code ${responseCode}`,
    };
  }

  /**
   * 3. VNPay IPN (Webhook)
   * Đúng thứ tự 6 bước theo đặc tả sandbox VNPay:
   * Bước 1: Checksum -> RspCode '97'
   * Bước 2: Tìm payment & booking -> RspCode '01'
   * Bước 3: Idempotent (payment.status === 'success') -> RspCode '02'
   * Bước 4: Check booking status (status === 'pending_payment') -> RspCode '02'
   * Bước 5: So sánh amount -> RspCode '04'
   * Bước 6: Update DB trong transaction có row-level lock -> RspCode '00'
   */
  async handleVnpayIpn(queryParams) {
    const config = this._getVnpayConfig();
    if (!config.enabled) return { RspCode: '99', Message: 'VNPay is disabled' };
    const secretKey = config.hashSecret;

    // BƯỚC 1: Verify Checksum
    const isChecksumValid = verifyVnpayChecksum(queryParams, secretKey);
    if (!isChecksumValid) {
      console.warn('[VNPay IPN] Invalid checksum received:', {
        txnRef: queryParams.vnp_TxnRef || null,
        receivedAt: new Date().toISOString(),
      });
      return { RspCode: '97', Message: 'Checksum failed' };
    }

    if (queryParams.vnp_TmnCode !== config.tmnCode) {
      console.warn('[VNPay IPN] Invalid merchant code received:', { txnRef: queryParams.vnp_TxnRef || null });
      return { RspCode: '97', Message: 'Invalid merchant code' };
    }

    const txnRef = queryParams.vnp_TxnRef;
    const vnpAmount = Number(queryParams.vnp_Amount || 0) / 100;
    const vnpResponseCode = queryParams.vnp_ResponseCode;
    const vnpTransactionStatus = queryParams.vnp_TransactionStatus;
    const isGatewaySuccess = vnpResponseCode === '00' && vnpTransactionStatus === '00';

    // BƯỚC 2: Tìm Payment và Booking liên quan
    const payment = await this.repository.findPaymentWithBookingByRef(txnRef, 'vnpay');

    if (!payment || !payment.booking) {
      console.warn(`[VNPay IPN] Order not found for txnRef: ${txnRef}`);
      return { RspCode: '01', Message: 'Order not found' };
    }

    // BƯỚC 3: Kiểm tra Idempotent (nếu payment đã thành công trước đó)
    if (payment.status === 'success') {
      console.log(`[VNPay IPN] Payment ${txnRef} already processed successfully (Idempotent call).`);
      return { RspCode: '02', Message: 'Order already confirmed' };
    }

    const isRecordableLateSuccess = isGatewaySuccess && payment.status === 'failed';

    // A signed late success must be recorded for manual reconciliation.
    if (payment.booking.status === 'confirmed' && !isRecordableLateSuccess) {
      return { RspCode: '02', Message: 'Order already confirmed' };
    }
    if (payment.booking.status !== 'pending_payment' && !isRecordableLateSuccess) {
      console.warn(`[VNPay IPN] Invalid booking status: ${payment.booking.status}`);
      return { RspCode: '02', Message: 'Order already updated or invalid state' };
    }

    // BƯỚC 5: Đối chiếu số tiền thanh toán (Amount)
    if (Math.round(Number(payment.amount)) !== Math.round(vnpAmount)) {
      console.warn(`[VNPay IPN] Amount mismatch: Expected ${payment.amount}, received ${vnpAmount}`);
      return { RspCode: '04', Message: 'Invalid amount' };
    }

    let bookingIdToEmail = null;
    let seatUpdates = [];
    let transactionOutcome = 'processed';

    // BƯỚC 6: Cập nhật CSDL trong Transaction có Row-Level Lock
    await this.transactionManager.transaction(async (t) => {
      const lockedPayment = await this.repository.findLockedPaymentById(payment.id, t);

      const lockedBooking = await this.repository.findLockedBookingWithPassengers(payment.booking_id, t);

      // Repeat the early idempotency checks while both rows are locked. This
      // prevents concurrent IPN calls from confirming and emailing one booking
      // more than once.
      if (!lockedPayment || !lockedBooking) {
        transactionOutcome = 'invalid_state';
        return;
      }
      if (lockedPayment.status === 'success') {
        transactionOutcome = 'already_confirmed';
        return;
      }
      if (isGatewaySuccess && lockedPayment.status === 'failed') {
        lockedPayment.status = 'success';
        lockedPayment.paid_at = lockedPayment.paid_at || new Date();
        await this.repository.save(lockedPayment, { transaction: t });
        transactionOutcome = 'requires_review';
        return;
      }
      if (lockedBooking.status === 'confirmed') {
        transactionOutcome = 'already_confirmed';
        return;
      }
      if (lockedBooking.status !== 'pending_payment') {
        transactionOutcome = 'invalid_state';
        return;
      }

      if (isGatewaySuccess) {
        const flight = await this.repository.findLockedFlight(lockedBooking.flight_id, t);
        const departureTime = flight ? new Date(flight.departure_time) : null;
        const flightIsValid = Boolean(
          flight
          && flight.status === 'scheduled'
          && departureTime
          && !Number.isNaN(departureTime.getTime())
          && departureTime.getTime() > Date.now()
        );

        if (this._isPaymentConfirmationWindowExpired(lockedBooking) || !flightIsValid) {
          lockedPayment.status = 'success';
          lockedPayment.paid_at = lockedPayment.paid_at || new Date();
          await this.repository.save(lockedPayment, { transaction: t });
          transactionOutcome = 'requires_review';
          return;
        }

        // Payment Success -> Confirm Booking
        lockedPayment.status = 'success';
        lockedPayment.paid_at = new Date();
        await this.repository.save(lockedPayment, { transaction: t });

        lockedBooking.status = 'confirmed';
        await this.repository.save(lockedBooking, { transaction: t });

        bookingIdToEmail = lockedBooking.id;
      } else {
        // Báo cáo Chương 2.3 (Ngoại lệ, Chức năng 2):
        // Khách hủy giữa chừng hoặc thanh toán thất bại tại cổng:
        // 1. Set payment.status = 'failed'
        // 2. Nếu hold_expires_at còn hạn -> đưa booking.status về 'holding' (KHÔNG huỷ, KHÔNG hoàn ghế, KHÔNG hoàn promo)
        //    để khách có thể tiếp tục thử thanh toán lại trong thời gian giữ chỗ.
        // 3. Nếu hold_expires_at đã quá hạn -> set booking.status = 'expired', giải phóng ghế và hoàn lượt promo.
        lockedPayment.status = 'failed';
        await this.repository.save(lockedPayment, { transaction: t });

        const now = new Date();
        const isHoldValid = lockedBooking.hold_expires_at && now <= new Date(lockedBooking.hold_expires_at);

        if (isHoldValid) {
          lockedBooking.status = 'holding';
          await this.repository.save(lockedBooking, { transaction: t });
        } else {
          lockedBooking.status = 'expired';
          await this.repository.save(lockedBooking, { transaction: t });

          // Giải phóng ghế về chuyến bay
          seatUpdates = await releaseBookingFlightSeats(lockedBooking, { repository: this.repository, transaction: t, findFlight: this.repository.findLockedFlight.bind(this.repository) });

          // Hoàn lượt dùng mã khuyến mãi
          if (lockedBooking.promotion_id) {
            const promo = await this.repository.findLockedPromotion(lockedBooking.promotion_id, t);
            if (promo && promo.used_count > 0) {
              await this.repository.decrement(promo, 'used_count', { by: 1, transaction: t });
            }
          }
        }
      }
    });

    if (transactionOutcome === 'requires_review') {
      return { RspCode: '00', Message: 'Payment recorded; booking requires manual review' };
    }

    if (transactionOutcome !== 'processed') {
      return {
        RspCode: '02',
        Message: transactionOutcome === 'already_confirmed'
          ? 'Order already confirmed'
          : 'Order already updated or invalid state',
      };
    }

    await this._emitSeatUpdates(seatUpdates);

    if (bookingIdToEmail) {
      this._triggerBookingConfirmationEmail(bookingIdToEmail);
    }

    return { RspCode: '00', Message: 'Confirm Success' };
  }

  /**
   * 4. payOS VietQR webhook callback
   */
  async handlePayosWebhook(body) {
    let webhookData;
    try {
      webhookData = await this._getPayOSClient().webhooks.verify(body);
    } catch (verificationError) {
      console.warn('[payOS Webhook] Invalid signature received:', {
        orderCode: body?.data?.orderCode || null,
        receivedAt: new Date().toISOString(),
      });
      const error = new Error('Invalid payOS webhook signature');
      error.statusCode = 400;
      throw error;
    }

    return this._processVerifiedPayosWebhook({
      orderCode: webhookData.orderCode,
      amount: webhookData.amount,
      isSuccess: body.success === true && body.code === '00' && webhookData.code === '00',
    });
  }

  async handlePayosDemoWebhook(body) {
    this._assertPayOSDemoAllowed();
    if (!Number.isSafeInteger(Number(body.orderCode)) || Number(body.amount) <= 0) {
      const error = new Error('Invalid payOS demo webhook payload');
      error.statusCode = 400;
      throw error;
    }
    if (!verifyPayosDemoSignature(body, this._getPayOSDemoSecret())) {
      const error = new Error('Invalid payOS demo webhook signature');
      error.statusCode = 400;
      throw error;
    }

    if (!['success', 'failed'].includes(body.status)) {
      const error = new Error('Demo webhook status must be success or failed');
      error.statusCode = 400;
      throw error;
    }

    return this._processVerifiedPayosWebhook({
      orderCode: body.orderCode,
      amount: body.amount,
      isSuccess: body.status === 'success',
    });
  }

  async _processVerifiedPayosWebhook({ orderCode, amount, isSuccess }) {

    const payment = await this.repository.findPaymentWithBookingByRef(String(orderCode), 'payos');

    if (!payment || !payment.booking) {
      // payOS validates a newly registered webhook with a signed sample payload.
      // Acknowledge that sample (or an orphaned signed notification) with 2xx so
      // the channel can be configured; no booking state is changed.
      console.warn(`[payOS Webhook] No local payment found for orderCode ${orderCode}.`);
      return { message: 'Webhook acknowledged; local order not found' };
    }

    if (Math.round(Number(payment.amount)) !== Math.round(Number(amount))) {
      const error = new Error('Amount mismatch');
      error.statusCode = 400;
      throw error;
    }

    const isRecordableLateSuccess = isSuccess && payment.status === 'failed';

    if (payment.status === 'success' || (payment.booking.status === 'confirmed' && !isRecordableLateSuccess)) {
      return { message: 'Order already confirmed' };
    }

    if (payment.booking.status !== 'pending_payment' && !isRecordableLateSuccess) {
      return { message: 'Order already updated or invalid state' };
    }

    let bookingIdToEmail = null;
    let seatUpdates = [];
    let requiresManualReview = false;

    await this.transactionManager.transaction(async (t) => {
      const lockedPayment = await this.repository.findLockedPaymentById(payment.id, t);

      const lockedBooking = await this.repository.findLockedBookingWithPassengers(payment.booking_id, t);

      // Repeat idempotency/state checks under row locks to prevent two webhook
      // requests from confirming and emailing the same booking concurrently.
      if (!lockedPayment || !lockedBooking) return;
      if (lockedPayment.status === 'success') return;
      if (isSuccess && lockedPayment.status === 'failed') {
        lockedPayment.status = 'success';
        lockedPayment.paid_at = lockedPayment.paid_at || new Date();
        await this.repository.save(lockedPayment, { transaction: t });
        requiresManualReview = true;
        return;
      }
      if (lockedBooking.status === 'confirmed') return;
      if (lockedBooking.status !== 'pending_payment') return;

      if (isSuccess) {
        const flight = await this.repository.findLockedFlight(lockedBooking.flight_id, t);
        const departureTime = flight ? new Date(flight.departure_time) : null;
        const flightIsValid = Boolean(
          flight
          && flight.status === 'scheduled'
          && departureTime
          && !Number.isNaN(departureTime.getTime())
          && departureTime.getTime() > Date.now()
        );

        if (this._isPaymentConfirmationWindowExpired(lockedBooking) || !flightIsValid) {
          lockedPayment.status = 'success';
          lockedPayment.paid_at = lockedPayment.paid_at || new Date();
          await this.repository.save(lockedPayment, { transaction: t });
          requiresManualReview = true;
          return;
        }

        lockedPayment.status = 'success';
        lockedPayment.paid_at = new Date();
        await this.repository.save(lockedPayment, { transaction: t });

        lockedBooking.status = 'confirmed';
        await this.repository.save(lockedBooking, { transaction: t });

        bookingIdToEmail = lockedBooking.id;
      } else {
        // payOS reports a non-success payment or cancellation.
        lockedPayment.status = 'failed';
        await this.repository.save(lockedPayment, { transaction: t });

        const now = new Date();
        const isHoldValid = lockedBooking.hold_expires_at && now <= new Date(lockedBooking.hold_expires_at);

        if (isHoldValid) {
          lockedBooking.status = 'holding';
          await this.repository.save(lockedBooking, { transaction: t });
        } else {
          lockedBooking.status = 'expired';
          await this.repository.save(lockedBooking, { transaction: t });

          seatUpdates = await releaseBookingFlightSeats(lockedBooking, { repository: this.repository, transaction: t, findFlight: this.repository.findLockedFlight.bind(this.repository) });

          if (lockedBooking.promotion_id) {
            const promo = await this.repository.findLockedPromotion(lockedBooking.promotion_id, t);
            if (promo && promo.used_count > 0) {
              await this.repository.decrement(promo, 'used_count', { by: 1, transaction: t });
            }
          }
        }
      }
    });

    await this._emitSeatUpdates(seatUpdates);

    if (bookingIdToEmail) {
      this._triggerBookingConfirmationEmail(bookingIdToEmail);
    }

    return {
      message: requiresManualReview
        ? 'Payment recorded; booking requires manual review'
        : 'Processed successfully',
      requires_manual_review: requiresManualReview,
    };
  }

  /**
   * payOS sends the customer to cancelUrl when they cancel a payment link.
   * Query parameters are not trusted: the payment-link status is re-read from
   * payOS before returning the booking from pending_payment to holding/expired.
   */
  async handlePayosReturn(queryParams) {
    const orderCode = queryParams.orderCode;
    const isCancellation = queryParams.cancel === 'true' || queryParams.status === 'CANCELLED';

    if (!orderCode || !isCancellation) {
      return { orderCode: orderCode || null, status: queryParams.status || null, processed: false };
    }

    if (this._getPayOSMode() === 'demo') {
      return { orderCode, status: 'DEMO', processed: false };
    }

    const paymentLink = await this._getPayOSClient().paymentRequests.get(Number(orderCode));
    if (paymentLink.status !== 'CANCELLED') {
      return { orderCode, status: paymentLink.status, processed: false };
    }

    const payment = await this.repository.findPaymentWithBookingByRef(String(orderCode));

    if (!payment || !payment.booking) {
      return { orderCode, status: 'CANCELLED', processed: false };
    }

    await this._markPayosPaymentFailed(payment.id, payment.booking_id);
    return { orderCode, status: 'CANCELLED', processed: true };
  }

  async _createGatewayOperation(payment, operationType, operationKey, amount, transaction) {
    const existing = await this.repository.findGatewayOperation({ where: { operation_key: operationKey }, transaction, lock: transaction.LOCK.UPDATE });
    if (existing) return existing;
    return this.repository.createGatewayOperation({
      request_id: `${operationType.toUpperCase()}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`.slice(0, 64),
      operation_key: operationKey, payment_id: payment.id, operation_type: operationType,
      status: 'pending', amount: amount == null ? payment.amount : amount,
    }, { transaction });
  }

  async _updateGatewayOperation(id, patch) {
    return this.transactionManager.transaction(async (t) => {
      const operation = await this.repository.findLockedGatewayOperation(id, t);
      if (!operation) return null;
      Object.assign(operation, patch);
      await this.repository.save(operation, { transaction: t });
      return operation;
    });
  }

  async queryVnpayPayment(paymentId) {
    let operation;
    const payment = await this.repository.findPaymentByPk(paymentId);
    if (!payment || payment.payment_method !== 'vnpay') { const e = new Error('VNPay payment not found'); e.statusCode = 404; throw e; }
    await this.transactionManager.transaction(async (t) => {
      const lockedPayment = await this.repository.findLockedPaymentById(paymentId, t);
      operation = await this._createGatewayOperation(lockedPayment, 'querydr', `querydr:${paymentId}:${Date.now()}`, lockedPayment.amount, t);
      operation.attempt_count += 1; operation.last_attempt_at = new Date();
      await this.repository.save(operation, { transaction: t });
    });
    try {
      const result = await this.vnpayGateway.query({ payment, requestId: operation.request_id });
      await this._updateGatewayOperation(operation.id, { status: result.status, response_json: result.response, gateway_transaction_ref: result.transactionRef, completed_at: result.status === 'pending' ? null : new Date(), last_error: null });
      return { operationId: operation.id, ...result };
    } catch (error) {
      const status = error.outcome || 'unknown';
      await this._updateGatewayOperation(operation.id, { status, last_error: String(error.message).slice(0, 500), completed_at: status === 'unknown' ? null : new Date() });
      throw error;
    }
  }

  async refundVnpayPayment(paymentId, reason, adminUser) {
    let operation;
    const payment = await this.repository.findPaymentByPk(paymentId);
    if (!payment || payment.payment_method !== 'vnpay') { const e = new Error('VNPay payment not found'); e.statusCode = 404; throw e; }
    await this.transactionManager.transaction(async (t) => {
      const lockedPayment = await this.repository.findLockedPaymentById(paymentId, t);

      if (!lockedPayment) {
        const e = new Error('VNPay payment not found');
        e.statusCode = 404;
        throw e;
      }

      // Check idempotency before checking payment status.
      const existing = await this.repository.findRefundGatewayOperation(paymentId, t);

      if (existing) {
        const e = new Error(`Refund operation is already ${existing.status}`);
        e.statusCode = 409;
        e.operation = existing;
        throw e;
      }

      if (lockedPayment.status !== 'success') {
        const e = new Error('Only a successful VNPay payment can be refunded');
        e.statusCode = 400;
        throw e;
      }

      operation = await this._createGatewayOperation(
        lockedPayment,
        'refund',
        `refund:${paymentId}`,
        lockedPayment.amount,
        t
      );

      operation.attempt_count += 1;
      operation.last_attempt_at = new Date();

      await this.repository.save(operation, { transaction: t });
    });
    let result;
    let seatUpdates = [];
    try {
      // Gateway I/O and the state transition are covered by this error path.
      // Post-commit notifications are deliberately outside it: an event
      // delivery failure must never turn a committed refund into `unknown`.
      result = await this.vnpayGateway.refund({ payment, requestId: operation.request_id, reason });
      await this.transactionManager.transaction(async (t) => {
        const op = await this.repository.findLockedGatewayOperation(operation.id, t);
        const lockedPayment = await this.repository.findLockedPaymentById(paymentId, t);
        Object.assign(op, { status: result.status, response_json: result.response, gateway_transaction_ref: result.transactionRef, completed_at: result.status === 'success' ? new Date() : null, last_error: null });
        await this.repository.save(op, { transaction: t });
        if (result.status !== 'success') return;
        if (lockedPayment.status !== 'success') return;
        const booking = await this.repository.findRefundBooking(lockedPayment.booking_id, t);
        if (!booking) return;
        const shouldReturnSeats = booking.status !== 'expired';
        lockedPayment.status = 'refunded';
        await this.repository.save(lockedPayment, { transaction: t });
        if (['confirmed', 'pending_payment', 'expired'].includes(booking.status)) {
          booking.status = 'cancelled';
          await this.repository.save(booking, { transaction: t });
          if (shouldReturnSeats) {
            seatUpdates = await releaseBookingFlightSeats(booking, { repository: this.repository, transaction: t, findFlight: this.repository.findLockedFlight.bind(this.repository) });
          }
          if (booking.promotion_id) {
            const promo = await this.repository.findLockedPromotion(booking.promotion_id, t);
            if (promo && promo.used_count > 0) await this.repository.decrement(promo, 'used_count', { by: 1, transaction: t });
          }
        }
      });
    } catch (error) {
      await this._updateGatewayOperation(operation.id, { status: error.outcome || 'unknown', last_error: String(error.message).slice(0, 500), completed_at: error.outcome === 'failed' ? new Date() : null });
      throw error;
    }

    // This is post-commit best-effort delivery. The refund result is already
    // durable, so notification failures are logged without changing it.
    try {
      await this._emitSeatUpdates(seatUpdates);
    } catch (error) {
      console.warn('[Refund] Seat update notification failed after commit:', error.message);
    }

    return { operationId: operation.id, paymentId, status: result.status, response: result.response, admin: adminUser && adminUser.id };
  }

  /**
   * Alias for processRefund
   */
  async refundPayment(bookingId, reason, adminUser) {
    return this.processRefund(bookingId, reason, adminUser);
  }

  /**
 * Revenue Statistics (Admin)
 *
 * Revenue is calculated only from successful payments.
 * refunded / pending / failed payments are excluded.
 * paid_at is used as the revenue timestamp.
 */
  async getRevenue({ from_date, to_date, group_by }) {
    // Use calendar-date strings directly instead of JavaScript Date
    // to avoid timezone conversion when querying MySQL DATETIME.
    if (from_date > to_date) {
      const error = new Error(
        'from_date must be before or equal to to_date'
      );
      error.statusCode = 400;
      throw error;
    }

    const startDate = `${from_date} 00:00:00`;

    const [year, month, day] = to_date.split('-').map(Number);

    // Calculate the next calendar day using UTC only as a
    // timezone-independent date arithmetic helper.
    const nextDay = new Date(Date.UTC(year, month - 1, day + 1));

    const endDate = [
      nextDay.getUTCFullYear(),
      String(nextDay.getUTCMonth() + 1).padStart(2, '0'),
      String(nextDay.getUTCDate()).padStart(2, '0'),
    ].join('-') + ' 00:00:00';

    const { rows, totalRevenue } = await this.repository.aggregateRevenue({
      startDate, endDate, groupBy: group_by, sequelize: this.transactionManager,
    });

    return {
      from_date,
      to_date,
      group_by,
      total_revenue: Number(totalRevenue || 0),
      data: rows.map((row) => ({
        [group_by === 'day' ? 'date' : 'month']:
          row[group_by === 'day' ? 'date' : 'month'],
        revenue: Number(row.revenue || 0),
      })),
    };
  }

  /**
   * 5. Refund Module (Admin only)
   */
  async processRefund(bookingId, reason = 'Customer refund request', adminUser) {
    let seatUpdates = [];

    const result = await this.transactionManager.transaction(async (t) => {
      // Use the same global lock order as gateway callbacks and reconciliation:
      // Payment -> Booking -> Flight -> Promotion.
      const successfulPayments = await this.repository.findSuccessfulPaymentsForRefund(bookingId, t);

      if (successfulPayments.length === 0) {
        const error = new Error('No successful payment found for this booking to refund.');
        error.statusCode = 400;
        throw error;
      }

      // payOS currently has no verified bank-refund adapter. The shared
      // booking refund endpoint must fail before changing any payment,
      // booking, seat or promotion state rather than treating a payment-link
      // cancellation as a refund.
      if (successfulPayments.some((payment) => payment.payment_method === 'payos')) {
        const error = new Error('Automatic payOS refund is not supported; manual refund reconciliation is required.');
        error.statusCode = 409;
        throw error;
      }

      const booking = await this.repository.findRefundBooking(bookingId, t);

      if (!booking) {
        const error = new Error('Booking not found');
        error.statusCode = 404;
        throw error;
      }

      const refundableStatuses = ['confirmed', 'pending_payment', 'expired'];
      if (!refundableStatuses.includes(booking.status)) {
        const error = new Error(`Cannot refund booking with status '${booking.status}'.`);
        error.statusCode = 400;
        throw error;
      }

      const shouldReturnSeats = booking.status !== 'expired';

      for (const payment of successfulPayments) {
        payment.status = 'refunded';
        await this.repository.save(payment, { transaction: t });
      }

      // Mark booking as cancelled
      booking.status = 'cancelled';
      await this.repository.save(booking, { transaction: t });

      if (shouldReturnSeats) {
        seatUpdates = await releaseBookingFlightSeats(booking, { repository: this.repository, transaction: t, findFlight: this.repository.findLockedFlight.bind(this.repository) });
      }

      const refundedAmount = successfulPayments.reduce(
        (total, payment) => total + Number(payment.amount),
        0
      );
      const paymentMethods = [...new Set(successfulPayments.map((payment) => payment.payment_method))];
      console.log(`[Refund] Admin ${adminUser.email} refunded booking #${booking.id} (${refundedAmount} VND). Reason: ${reason}`);

      return {
        bookingId: booking.id,
        bookingCode: booking.booking_code,
        refundedAmount,
        paymentMethod: paymentMethods.length === 1 ? paymentMethods[0] : paymentMethods.join(','),
        refundedPaymentIds: successfulPayments.map((payment) => payment.id),
        reason,
        refundedAt: new Date(),
      };
    });

    await this._emitSeatUpdates(seatUpdates);

    return result;
  }
}

module.exports = PaymentService;
