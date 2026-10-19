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
const { createHash } = require('node:crypto');
const { recordBookingStatusTransition } = require('../booking/bookingStatusHistory.util');
const { wholeVndAmount } = require('../ancillaries/money.util');

// Format date to yyyyMMddHHmmss for VNPay
const formatDateVnpay = (date) => {
  const pad = (n) => (n < 10 ? '0' + n : n);
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
};

class PaymentService {
  constructor({ repository, transactionManager, socket = getIO, flightSeatService, payOSFactory, qrCode = QRCode, emailProvider, seatSelectionService, ancillaryService, notificationPublisher } = {}) {
    if (!repository || !transactionManager) throw new TypeError('Payment repository and transaction manager are required');
    this.repository = repository;
    this.transactionManager = transactionManager;
    this.socket = socket;
    this.flightSeatService = flightSeatService;
    this.payOSFactory = payOSFactory;
    this.qrCode = qrCode;
    this.emailProvider = emailProvider;
    this.seatSelectionService = seatSelectionService;
    this.ancillaryService = ancillaryService;
    this.notificationPublisher = notificationPublisher;
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

  async _restoreHoldingAfterGatewayFailure(bookingId, transactionRef, idempotencyError = null) {
    await this.transactionManager.transaction(async (t) => {
      const booking = await this.repository.findLockedBooking(bookingId, t);
      const payment = await this.repository.findPendingPaymentForGatewayFailure(bookingId, transactionRef, t);

      // Do not overwrite a webhook or another workflow that already changed state.
      if (booking && payment && booking.status === 'pending_payment') {
        // Keep every created intent as an audit record. Ancillary repricing is
        // intentionally forbidden once any provider intent has existed, even
        // when gateway setup later fails.
        payment.status = 'failed';
        if (idempotencyError && payment.idempotency_key) payment.idempotency_response = { error: idempotencyError };
        await this.repository.save(payment, { transaction: t });
        await recordBookingStatusTransition({ booking, toStatus: 'holding', source: 'gateway_setup_failed', repository: this.repository, transaction: t });
      }
    });
  }

  _paymentRequestFingerprint({ booking, payment_method, return_url, currentUser, guest_email }) {
    const canonicalRequest = JSON.stringify({
      booking_id: String(booking.id),
      amount: String(booking.total_amount),
      payment_method,
      return_url: return_url || null,
      user_id: currentUser?.id == null ? null : String(currentUser.id),
      guest_email: guest_email || null,
    });
    return createHash('sha256').update(canonicalRequest).digest('hex');
  }

  _throwIdempotencyReplay(response) {
    if (response?.error) {
      const error = new Error(response.error.message);
      error.statusCode = response.error.statusCode;
      throw error;
    }
    return response;
  }

  _isIdempotencyRaceError(error) {
    return error?.name === 'SequelizeUniqueConstraintError'
      || error?.original?.code === 'ER_DUP_ENTRY'
      || error?.parent?.code === 'ER_DUP_ENTRY'
      || error?.original?.code === 'ER_LOCK_DEADLOCK'
      || error?.parent?.code === 'ER_LOCK_DEADLOCK'
      || error?.original?.errno === 1213
      || error?.parent?.errno === 1213;
  }

  async _saveIdempotencyResponse(idempotencyKey, response) {
    if (!idempotencyKey) return response;
    return this.transactionManager.transaction(async (transaction) => {
      const payment = await this.repository.findPaymentByIdempotencyKey(idempotencyKey, transaction);
      if (!payment) throw new Error('Payment idempotency record disappeared before response was stored');
      if (payment.idempotency_response) return payment.idempotency_response;
      payment.idempotency_response = response;
      await this.repository.save(payment, { transaction });
      return response;
    });
  }

  _buildVnpayPaymentUrl({ booking, transactionRef, ipAddress, returnUrl }) {
    const tmnCode = process.env.VNP_TMN_CODE || 'SANDBOX01';
    const secretKey = process.env.VNP_HASH_SECRET || 'SECRETKEYVNPAY2026DEMO';
    const vnpUrl = process.env.VNP_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
    const vnpParams = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: tmnCode,
      vnp_Locale: 'vn',
      vnp_CurrCode: 'VND',
      vnp_TxnRef: transactionRef,
      vnp_OrderInfo: `Thanh toan ve may bay ${booking.booking_code}`,
      vnp_OrderType: 'other',
      vnp_Amount: wholeVndAmount(booking.total_amount) * 100,
      vnp_ReturnUrl: returnUrl,
      vnp_IpAddr: ipAddress,
      vnp_CreateDate: formatDateVnpay(new Date()),
    };
    const query = Object.keys(vnpParams).sort()
      .map((key) => `${key}=${encodeURIComponent(vnpParams[key]).replace(/%20/g, '+')}`);
    query.push(`vnp_SecureHash=${signVnpayParams(vnpParams, secretKey)}`);
    return `${vnpUrl}?${query.join('&')}`;
  }

  async _buildPayosDemoResponse(booking, transactionRef) {
    const amount = wholeVndAmount(booking.total_amount);
    const demoData = { orderCode: Number(transactionRef), amount, status: 'success', timestamp: Date.now() };
    const signature = signPayosDemoPayload(demoData, this._getPayOSDemoSecret());
    const qrPayload = JSON.stringify({
      type: 'VIETQR_ACADEMIC_DEMO',
      provider: 'payOS-demo-adapter',
      bookingCode: booking.booking_code,
      orderCode: demoData.orderCode,
      amount,
      currency: 'VND',
      transferContent: `DATVE ${booking.booking_code}`,
      warning: 'MO PHONG - KHONG CHUYEN TIEN THAT',
    });
    const qrCode = await this.qrCode.toDataURL(qrPayload, { errorCorrectionLevel: 'M', margin: 2, width: 320 });
    return {
      payment_url: null,
      qr_code: qrCode,
      qr_payload: qrPayload,
      payment_link_id: `demo_${transactionRef}`,
      transaction_ref: transactionRef,
      booking_id: booking.id,
      amount: booking.total_amount,
      status: 'pending_payment',
      mode: 'demo',
      demo_notice: 'Academic simulation only. No real bank transfer is performed.',
      demo_webhook: { method: 'POST', url: '/api/v1/payments/payos/demo-webhook', body: { ...demoData, signature } },
    };
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
      if (this.notificationPublisher) {
        await this.notificationPublisher.publish({
          eventKey: `payment:${payment.id}:failed`, eventType: 'PAYMENT_FAILED',
          aggregateType: 'booking', aggregateId: booking.id,
          recipientUserId: booking.user_id, recipientEmail: booking.guest_email,
          relatedType: 'booking', relatedId: booking.id,
          variables: { code: booking.booking_code || booking.id },
        }, { transaction: t });
      }

      const holdIsValid = booking.hold_expires_at && new Date() <= new Date(booking.hold_expires_at);
      if (holdIsValid) {
        await recordBookingStatusTransition({ booking, toStatus: 'holding', source: 'payment_failed_retryable', repository: this.repository, transaction: t });
        return;
      }

      await recordBookingStatusTransition({ booking, toStatus: 'expired', source: 'payment_failed_expired', repository: this.repository, transaction: t });

      await this.ancillaryService?.releaseBooking(booking.id, { transaction: t, reason: 'expired' });

      seatUpdates = await releaseBookingFlightSeats(booking, { repository: this.repository, transaction: t, findFlight: this.repository.findLockedFlight.bind(this.repository) });
      if (booking.seatAssignments?.length) await this.seatSelectionService?.releaseBookingSeats(booking.id, t);

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
  async initiatePayment({ booking_id, payment_method, ip_addr = '127.0.0.1', return_url, currentUser = null, guest_email = null, idempotency_key = null }) {
    guest_email = normalizeGuestEmail(guest_email);
    // payOS requires a numeric orderCode. Timestamp plus three random digits
    // stays below Number.MAX_SAFE_INTEGER and avoids same-millisecond collisions.
    let txnRef = payment_method === 'payos'
      ? String(Date.now() * 1000 + Math.floor(Math.random() * 1000))
      : `TXN_${booking_id}_${Date.now()}`;
    let bookingData = null;
    let paymentRecord = null;
    let replayResponse = null;
    let requestFingerprint = null;
    let existingIdempotencyPayment = false;
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
      resolvedReturnUrl = resolvePaymentReturnUrl(
        return_url,
        process.env.VNP_RETURN_URL,
        'http://localhost:3000/payment/vnpay-return'
      );
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
    try {
      await this.transactionManager.transaction(async (t) => {
      const booking = await this.repository.findLockedBooking(booking_id, t);

      if (!booking) {
        const error = new Error('Booking not found');
        error.statusCode = 404;
        throw error;
      }

      verifyBookingAccess(booking, currentUser, guest_email);
      wholeVndAmount(booking.total_amount);

      if (idempotency_key) {
        requestFingerprint = this._paymentRequestFingerprint({
          booking,
          payment_method,
          return_url: resolvedReturnUrl || return_url,
          currentUser,
          guest_email,
        });
        const existingPayment = await this.repository.findPaymentByIdempotencyKey(idempotency_key, t);
        if (existingPayment) {
          if (existingPayment.request_fingerprint !== requestFingerprint) {
            const error = new Error('Idempotency-Key was already used for a different payment request.');
            error.statusCode = 409;
            throw error;
          }
          paymentRecord = existingPayment;
          replayResponse = existingPayment.idempotency_response || null;
          txnRef = existingPayment.transaction_ref;
          bookingData = booking;
          existingIdempotencyPayment = true;
          return;
        }
      }

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

      // Transition to pending_payment
      await recordBookingStatusTransition({ booking, toStatus: 'pending_payment', source: 'payment_initiated', actorUserId: currentUser?.id, repository: this.repository, transaction: t });

      // Create pending payment record
      paymentRecord = await this.repository.createPayment(
        {
          booking_id: booking.id,
          amount: booking.total_amount,
          payment_method,
          status: 'pending',
          transaction_ref: txnRef,
          ...(idempotency_key ? { idempotency_key, request_fingerprint: requestFingerprint } : {}),
        },
        { transaction: t }
      );

      bookingData = booking;
      });
    } catch (error) {
      if (!idempotency_key || !requestFingerprint || !this._isIdempotencyRaceError(error)) throw error;
      const existingPayment = await this.repository.findPaymentByIdempotencyKey(idempotency_key);
      if (!existingPayment) throw error;
      if (existingPayment.request_fingerprint !== requestFingerprint) {
        const conflict = new Error('Idempotency-Key was already used for a different payment request.');
        conflict.statusCode = 409;
        throw conflict;
      }
      if (existingPayment.idempotency_response) return this._throwIdempotencyReplay(existingPayment.idempotency_response);
      const conflict = new Error('Payment initiation is still processing. Retry with the same Idempotency-Key.');
      conflict.statusCode = 409;
      throw conflict;
    }

    if (paymentRecord && replayResponse) return this._throwIdempotencyReplay(replayResponse);
    if (existingIdempotencyPayment) {
      if (paymentRecord.status !== 'pending') {
        const error = new Error('This idempotent payment request has already reached a terminal state.');
        error.statusCode = 409;
        throw error;
      }
      let recoveredResponse;
      if (payment_method === 'vnpay') {
        recoveredResponse = {
          payment_url: this._buildVnpayPaymentUrl({ booking: bookingData, transactionRef: txnRef, ipAddress: ip_addr, returnUrl: resolvedReturnUrl }),
          transaction_ref: txnRef,
          booking_id: bookingData.id,
          amount: bookingData.total_amount,
          status: 'pending_payment',
        };
      } else if (payosMode === 'demo') {
        recoveredResponse = await this._buildPayosDemoResponse(bookingData, txnRef);
      } else {
        try {
          const paymentLink = await payOS.paymentRequests.get(Number(txnRef));
          if (Number(paymentLink.orderCode) !== Number(txnRef)
            || Number(paymentLink.amount) !== wholeVndAmount(bookingData.total_amount)) {
            throw new Error('Existing payOS link does not match the payment record');
          }
          recoveredResponse = {
            payment_url: paymentLink.checkoutUrl,
            qr_code: paymentLink.qrCode,
            payment_link_id: paymentLink.paymentLinkId,
            transaction_ref: txnRef,
            booking_id: bookingData.id,
            amount: bookingData.total_amount,
            status: 'pending_payment',
          };
        } catch (_error) {
          const error = new Error('Payment initiation is still processing. Retry with the same Idempotency-Key.');
          error.statusCode = 409;
          throw error;
        }
      }
      return this._saveIdempotencyResponse(idempotency_key, recoveredResponse);
    }

    // STEP 2: Build Payment Gateway URL
    let paymentUrl = '';

    if (payment_method === 'vnpay') {
      paymentUrl = this._buildVnpayPaymentUrl({ booking: bookingData, transactionRef: txnRef, ipAddress: ip_addr, returnUrl: resolvedReturnUrl });
    } else if (payment_method === 'payos') {
      if (payosMode === 'demo') {
        const result = await this._buildPayosDemoResponse(bookingData, txnRef);
        await this._saveIdempotencyResponse(idempotency_key, result);
        return result;
      }

      const returnUrl = resolvedReturnUrl;
      const cancelUrl = resolvedCancelUrl;

      let paymentLink;
      try {
        paymentLink = await payOS.paymentRequests.create({
          orderCode: Number(txnRef),
          amount: wholeVndAmount(bookingData.total_amount),
          description: `Ve may bay ${bookingData.booking_code}`.slice(0, 25),
          returnUrl,
          cancelUrl,
          items: [{
            name: `Ve bay ${bookingData.booking_code}`.slice(0, 25),
            quantity: 1,
            price: wholeVndAmount(bookingData.total_amount),
          }],
        });

      } catch (gatewayError) {
        const error = new Error(`Unable to create payOS payment link: ${gatewayError.message}`);
        error.statusCode = 502;
        await this._restoreHoldingAfterGatewayFailure(bookingData.id, txnRef, {
          statusCode: error.statusCode,
          message: error.message,
        });
        throw error;
      }
      paymentUrl = paymentLink.checkoutUrl;
      const result = {
        payment_url: paymentUrl,
        qr_code: paymentLink.qrCode,
        payment_link_id: paymentLink.paymentLinkId,
        transaction_ref: txnRef,
        booking_id: bookingData.id,
        amount: bookingData.total_amount,
        status: 'pending_payment',
      };
      await this._saveIdempotencyResponse(idempotency_key, result);
      return result;
    }

    const result = {
      payment_url: paymentUrl,
      transaction_ref: txnRef,
      booking_id: bookingData.id,
      amount: bookingData.total_amount,
      status: 'pending_payment',
    };
    await this._saveIdempotencyResponse(idempotency_key, result);
    return result;
  }

  /**
   * 2. VNPay Return URL (Customer Browser Redirect)
   * ONLY parses and verifies checksum to display UI, DOES NOT mutate database.
   */
  async handleVnpayReturn(queryParams) {
    const secretKey = process.env.VNP_HASH_SECRET || 'SECRETKEYVNPAY2026DEMO';
    const isValidChecksum = verifyVnpayChecksum(queryParams, secretKey);

    const responseCode = queryParams.vnp_ResponseCode;
    const txnRef = queryParams.vnp_TxnRef;
    const amount = Number(queryParams.vnp_Amount || 0) / 100;

    let booking = null;
    if (txnRef) {
      const payment = await this.repository.findPaymentWithBookingByRef(txnRef);
      if (payment) {
        booking = payment.booking;
      }
    }

    return {
      isValidChecksum,
      isSuccess: isValidChecksum && responseCode === '00',
      responseCode,
      transactionRef: txnRef,
      amount,
      bookingId: booking ? booking.id : null,
      bookingCode: booking ? booking.booking_code : null,
      message:
        !isValidChecksum
          ? 'Invalid signature checksum'
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
    const secretKey = process.env.VNP_HASH_SECRET || 'SECRETKEYVNPAY2026DEMO';

    // BƯỚC 1: Verify Checksum
    const isChecksumValid = verifyVnpayChecksum(queryParams, secretKey);
    if (!isChecksumValid) {
      console.warn('[VNPay IPN] Invalid checksum received:', {
        txnRef: queryParams.vnp_TxnRef || null,
        receivedAt: new Date().toISOString(),
      });
      return { RspCode: '97', Message: 'Checksum failed' };
    }

    const txnRef = queryParams.vnp_TxnRef;
    const vnpAmount = Number(queryParams.vnp_Amount || 0) / 100;
    const vnpResponseCode = queryParams.vnp_ResponseCode;

    // BƯỚC 2: Tìm Payment và Booking liên quan
    const payment = await this.repository.findPaymentWithBookingByRef(txnRef);

    if (!payment || !payment.booking) {
      console.warn(`[VNPay IPN] Order not found for txnRef: ${txnRef}`);
      return { RspCode: '01', Message: 'Order not found' };
    }

    // BƯỚC 3: Kiểm tra Idempotent (nếu payment đã thành công trước đó)
    if (payment.status === 'success') {
      console.log(`[VNPay IPN] Payment ${txnRef} already processed successfully (Idempotent call).`);
      return { RspCode: '02', Message: 'Order already confirmed' };
    }

    // BƯỚC 4: Kiểm tra trạng thái Booking (chỉ chấp nhận pending_payment)
    if (payment.booking.status === 'confirmed') {
      return { RspCode: '02', Message: 'Order already confirmed' };
    }
    if (payment.booking.status !== 'pending_payment') {
      console.warn(`[VNPay IPN] Invalid booking status: ${payment.booking.status}`);
      return { RspCode: '02', Message: 'Order already updated or invalid state' };
    }

    // BƯỚC 5: Đối chiếu số tiền thanh toán (Amount)
    if (!/^\d+$/.test(String(queryParams.vnp_Amount))
      || Number(queryParams.vnp_Amount) !== wholeVndAmount(payment.amount) * 100) {
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
      if (lockedPayment.status === 'success' || lockedBooking.status === 'confirmed') {
        transactionOutcome = 'already_confirmed';
        return;
      }
      if (lockedBooking.status !== 'pending_payment') {
        transactionOutcome = 'invalid_state';
        return;
      }

      if (vnpResponseCode === '00') {
        // Payment Success -> Confirm Booking
        lockedPayment.status = 'success';
        lockedPayment.paid_at = new Date();
        await this.repository.save(lockedPayment, { transaction: t });

        await recordBookingStatusTransition({ booking: lockedBooking, toStatus: 'confirmed', source: 'payment_vnpay_success', repository: this.repository, transaction: t });
        if (lockedBooking.seatAssignments?.length) await this.seatSelectionService?.confirmBookingSeats(lockedBooking.id, t);
        await this.ancillaryService?.confirmBooking(lockedBooking.id, t);

        if (this.notificationPublisher) {
          const notification = {
            aggregateType: 'booking', aggregateId: lockedBooking.id,
            recipientUserId: lockedBooking.user_id, recipientEmail: lockedBooking.guest_email,
            relatedType: 'booking', relatedId: lockedBooking.id,
            variables: { code: lockedBooking.booking_code || lockedBooking.id },
          };
          await this.notificationPublisher.publish({ ...notification, eventKey: `booking:${lockedBooking.id}:confirmed`, eventType: 'BOOKING_CONFIRMED' }, { transaction: t });
          await this.notificationPublisher.publish({ ...notification, eventKey: `payment:${lockedPayment.id}:succeeded`, eventType: 'PAYMENT_SUCCEEDED' }, { transaction: t });
        }

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
        if (this.notificationPublisher) {
          await this.notificationPublisher.publish({
            eventKey: `payment:${lockedPayment.id}:failed`, eventType: 'PAYMENT_FAILED',
            aggregateType: 'booking', aggregateId: lockedBooking.id,
            recipientUserId: lockedBooking.user_id, recipientEmail: lockedBooking.guest_email,
            relatedType: 'booking', relatedId: lockedBooking.id,
            variables: { code: lockedBooking.booking_code || lockedBooking.id },
          }, { transaction: t });
        }

        const now = new Date();
        const isHoldValid = lockedBooking.hold_expires_at && now <= new Date(lockedBooking.hold_expires_at);

        if (isHoldValid) {
          await recordBookingStatusTransition({ booking: lockedBooking, toStatus: 'holding', source: 'payment_vnpay_failed_retryable', repository: this.repository, transaction: t });
        } else {
          await recordBookingStatusTransition({ booking: lockedBooking, toStatus: 'expired', source: 'payment_vnpay_failed_expired', repository: this.repository, transaction: t });

          await this.ancillaryService?.releaseBooking(lockedBooking.id, { transaction: t, reason: 'expired' });

          // Giải phóng ghế về chuyến bay
          seatUpdates = await releaseBookingFlightSeats(lockedBooking, { repository: this.repository, transaction: t, findFlight: this.repository.findLockedFlight.bind(this.repository) });
          if (lockedBooking.seatAssignments?.length) await this.seatSelectionService?.releaseBookingSeats(lockedBooking.id, t);

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

    const payment = await this.repository.findPaymentWithBookingByRef(String(orderCode));

    if (!payment || !payment.booking) {
      // payOS validates a newly registered webhook with a signed sample payload.
      // Acknowledge that sample (or an orphaned signed notification) with 2xx so
      // the channel can be configured; no booking state is changed.
      console.warn(`[payOS Webhook] No local payment found for orderCode ${orderCode}.`);
      return { message: 'Webhook acknowledged; local order not found' };
    }

    if (!Number.isSafeInteger(Number(amount)) || wholeVndAmount(payment.amount) !== Number(amount)) {
      const error = new Error('Amount mismatch');
      error.statusCode = 400;
      throw error;
    }

    // Idempotency check
    if (payment.status === 'success' || payment.booking.status === 'confirmed') {
      return { message: 'Order already confirmed' };
    }

    if (payment.booking.status !== 'pending_payment') {
      return { message: 'Order already updated or invalid state' };
    }

    let bookingIdToEmail = null;
    let seatUpdates = [];

    await this.transactionManager.transaction(async (t) => {
      const lockedPayment = await this.repository.findLockedPaymentById(payment.id, t);

      const lockedBooking = await this.repository.findLockedBookingWithPassengers(payment.booking_id, t);

      // Repeat idempotency/state checks under row locks to prevent two webhook
      // requests from confirming and emailing the same booking concurrently.
      if (lockedPayment.status === 'success' || lockedBooking.status === 'confirmed') return;
      if (lockedBooking.status !== 'pending_payment') return;

      if (isSuccess) {
        lockedPayment.status = 'success';
        lockedPayment.paid_at = new Date();
        await this.repository.save(lockedPayment, { transaction: t });

        await recordBookingStatusTransition({ booking: lockedBooking, toStatus: 'confirmed', source: 'payment_payos_success', repository: this.repository, transaction: t });
        if (lockedBooking.seatAssignments?.length) await this.seatSelectionService?.confirmBookingSeats(lockedBooking.id, t);
        await this.ancillaryService?.confirmBooking(lockedBooking.id, t);

        if (this.notificationPublisher) {
          const notification = {
            aggregateType: 'booking', aggregateId: lockedBooking.id,
            recipientUserId: lockedBooking.user_id, recipientEmail: lockedBooking.guest_email,
            relatedType: 'booking', relatedId: lockedBooking.id,
            variables: { code: lockedBooking.booking_code || lockedBooking.id },
          };
          await this.notificationPublisher.publish({ ...notification, eventKey: `booking:${lockedBooking.id}:confirmed`, eventType: 'BOOKING_CONFIRMED' }, { transaction: t });
          await this.notificationPublisher.publish({ ...notification, eventKey: `payment:${lockedPayment.id}:succeeded`, eventType: 'PAYMENT_SUCCEEDED' }, { transaction: t });
        }

        bookingIdToEmail = lockedBooking.id;
      } else {
        // payOS reports a non-success payment or cancellation.
        lockedPayment.status = 'failed';
        await this.repository.save(lockedPayment, { transaction: t });
        if (this.notificationPublisher) {
          await this.notificationPublisher.publish({
            eventKey: `payment:${lockedPayment.id}:failed`, eventType: 'PAYMENT_FAILED',
            aggregateType: 'booking', aggregateId: lockedBooking.id,
            recipientUserId: lockedBooking.user_id, recipientEmail: lockedBooking.guest_email,
            relatedType: 'booking', relatedId: lockedBooking.id,
            variables: { code: lockedBooking.booking_code || lockedBooking.id },
          }, { transaction: t });
        }

        const now = new Date();
        const isHoldValid = lockedBooking.hold_expires_at && now <= new Date(lockedBooking.hold_expires_at);

        if (isHoldValid) {
          await recordBookingStatusTransition({ booking: lockedBooking, toStatus: 'holding', source: 'payment_payos_failed_retryable', repository: this.repository, transaction: t });
        } else {
          await recordBookingStatusTransition({ booking: lockedBooking, toStatus: 'expired', source: 'payment_payos_failed_expired', repository: this.repository, transaction: t });

          await this.ancillaryService?.releaseBooking(lockedBooking.id, { transaction: t, reason: 'expired' });

          seatUpdates = await releaseBookingFlightSeats(lockedBooking, { repository: this.repository, transaction: t, findFlight: this.repository.findLockedFlight.bind(this.repository) });
          if (lockedBooking.seatAssignments?.length) await this.seatSelectionService?.releaseBookingSeats(lockedBooking.id, t);

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

    return { message: 'Processed successfully' };
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
      const booking = await this.repository.findRefundBooking(bookingId, t);

      if (!booking) {
        const error = new Error('Booking not found');
        error.statusCode = 404;
        throw error;
      }

      if (booking.status !== 'confirmed') {
        const error = new Error(`Cannot refund booking with status '${booking.status}'. Only 'confirmed' bookings can be refunded.`);
        error.statusCode = 400;
        throw error;
      }

      const successfulPayment = await this.repository.findSuccessfulPaymentForRefund(bookingId, t);

      if (!successfulPayment) {
        const error = new Error('No successful payment found for this booking to refund.');
        error.statusCode = 400;
        throw error;
      }

      if (wholeVndAmount(successfulPayment.amount) !== wholeVndAmount(booking.total_amount)) {
        const error = new Error('Payment and Booking VND amounts do not match; refund requires review');
        error.statusCode = 409;
        throw error;
      }

      // Validate before mutating Payment, Booking, seats, or ancillary inventory.
      await this.ancillaryService?.assertWholeBookingRefundAllowed(bookingId, t);

      // Mark payment as refunded
      successfulPayment.status = 'refunded';
      await this.repository.save(successfulPayment, { transaction: t });

      // Mark booking as cancelled
      await recordBookingStatusTransition({ booking, toStatus: 'cancelled', source: 'admin_refund', actorUserId: adminUser?.id, repository: this.repository, transaction: t });

      await this.ancillaryService?.releaseBooking(booking.id, { transaction: t, reason: 'refunded' });

      if (this.notificationPublisher) {
        const notification = {
          aggregateType: 'booking', aggregateId: booking.id,
          recipientUserId: booking.user_id, recipientEmail: booking.guest_email,
          relatedType: 'booking', relatedId: booking.id,
          variables: { code: booking.booking_code || booking.id },
        };
        await this.notificationPublisher.publish({ ...notification, eventKey: `booking:${booking.id}:cancelled`, eventType: 'BOOKING_CANCELLED' }, { transaction: t });
        await this.notificationPublisher.publish({
          ...notification, eventKey: `booking:${booking.id}:refunded`, eventType: 'REFUND_COMPLETED',
        }, { transaction: t });
      }

      // Return seats to flight
      seatUpdates = await releaseBookingFlightSeats(booking, { repository: this.repository, transaction: t, findFlight: this.repository.findLockedFlight.bind(this.repository) });
      if (booking.seatAssignments?.length) await this.seatSelectionService?.releaseBookingSeats(booking.id, t);

      console.log(`[Refund] Admin ${adminUser.email} refunded booking #${booking.id} (${successfulPayment.amount} VND). Reason: ${reason}`);

      return {
        bookingId: booking.id,
        bookingCode: booking.booking_code,
        refundedAmount: successfulPayment.amount,
        paymentMethod: successfulPayment.payment_method,
        reason,
        refundedAt: new Date(),
      };
    });

    await this._emitSeatUpdates(seatUpdates);

    return result;
  }
}

module.exports = PaymentService;
