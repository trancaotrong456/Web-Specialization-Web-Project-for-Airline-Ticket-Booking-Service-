const { Op } = require('sequelize');
const {
  sequelize,
  Booking,
  Payment,
  Flight,
  BookingPassenger,
  Promotion,
  User,
  FareClass,
  Airline,
  Airport,
} = require('../models');
const {
  signVnpayParams,
  verifyVnpayChecksum,
  signPayosDemoPayload,
  verifyPayosDemoSignature,
} = require('../utils/checksum.util');
const { PayOS } = require('@payos/node');
const QRCode = require('qrcode');
const { getIO } = require('../sockets');
const flightService = require('./flight.service');
const { verifyBookingAccess } = require('../utils/bookingAccess.util');
const { resolvePaymentReturnUrl } = require('../utils/paymentReturnUrl.util');

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

    return new PayOS({
      clientId: process.env.PAYOS_CLIENT_ID,
      apiKey: process.env.PAYOS_API_KEY,
      checksumKey: process.env.PAYOS_CHECKSUM_KEY,
      baseURL: process.env.PAYOS_BASE_URL || undefined,
    });
  }

  async _restoreHoldingAfterGatewayFailure(bookingId, transactionRef) {
    await sequelize.transaction(async (t) => {
      const booking = await Booking.findOne({
        where: { id: bookingId },
        lock: t.LOCK.UPDATE,
        transaction: t,
      });
      const payment = await Payment.findOne({
        where: { booking_id: bookingId, transaction_ref: transactionRef, status: 'pending' },
        lock: t.LOCK.UPDATE,
        transaction: t,
      });

      // Do not overwrite a webhook or another workflow that already changed state.
      if (booking && payment && booking.status === 'pending_payment') {
        await payment.destroy({ transaction: t });
        booking.status = 'holding';
        await booking.save({ transaction: t });
      }
    });
  }

  async _markPayosPaymentFailed(paymentId, bookingId) {
    let flightIdToEmit = null;
    let newSeatsCount = null;

    await sequelize.transaction(async (t) => {
      const payment = await Payment.findOne({
        where: { id: paymentId },
        lock: t.LOCK.UPDATE,
        transaction: t,
      });
      const booking = await Booking.findOne({
        where: { id: bookingId },
        lock: t.LOCK.UPDATE,
        transaction: t,
        include: [{ model: BookingPassenger, as: 'passengers' }],
      });

      if (!payment || !booking || payment.status === 'success' || booking.status === 'confirmed') return;
      if (booking.status !== 'pending_payment') return;

      payment.status = 'failed';
      await payment.save({ transaction: t });

      const holdIsValid = booking.hold_expires_at && new Date() <= new Date(booking.hold_expires_at);
      if (holdIsValid) {
        booking.status = 'holding';
        await booking.save({ transaction: t });
        return;
      }

      booking.status = 'expired';
      await booking.save({ transaction: t });

      const flight = await Flight.findOne({
        where: { id: booking.flight_id },
        lock: t.LOCK.UPDATE,
        transaction: t,
      });
      if (flight) {
        flight.available_seats += booking.passengers ? booking.passengers.length : 1;
        await flight.save({ transaction: t });
        flightIdToEmit = flight.id;
        newSeatsCount = flight.available_seats;
      }

      if (booking.promotion_id) {
        const promo = await Promotion.findOne({
          where: { id: booking.promotion_id },
          lock: t.LOCK.UPDATE,
          transaction: t,
        });
        if (promo && promo.used_count > 0) {
          await promo.decrement('used_count', { by: 1, transaction: t });
        }
      }
    });

    if (flightIdToEmit) {
      await this._emitSocketSeatUpdate(flightIdToEmit, newSeatsCount);
    }
  }

  /**
   * Helper to safely emit socket event
   */
  async _emitSocketSeatUpdate(flightId, availableSeats) {
    try {
      const io = getIO();
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

    await flightService.checkAndEmitSeatWarning(flightId);
  }

  /**
   * Helper to send booking confirmed email in background
   */
  async _triggerBookingConfirmationEmail(bookingId) {
    try {
      // Lazy load to avoid circular dependency
      const emailService = require('./email.service');
      await emailService.sendBookingConfirmation(bookingId);
    } catch (error) {
      console.error(`[Email] Failed to send ticket confirmation email for booking #${bookingId}:`, error.message);
    }
  }

  /**
   * 1. Initiate Payment: holding -> pending_payment -> build gateway URL
   */
  async initiatePayment({ booking_id, payment_method, ip_addr = '127.0.0.1', return_url, currentUser = null, guest_email = null }) {
    // payOS requires a numeric orderCode. Timestamp plus three random digits
    // stays below Number.MAX_SAFE_INTEGER and avoids same-millisecond collisions.
    const txnRef = payment_method === 'payos'
      ? String(Date.now() * 1000 + Math.floor(Math.random() * 1000))
      : `TXN_${booking_id}_${Date.now()}`;
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
    await sequelize.transaction(async (t) => {
      const booking = await Booking.findOne({
        where: { id: booking_id },
        lock: t.LOCK.UPDATE,
        transaction: t,
      });

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

      // Transition to pending_payment
      booking.status = 'pending_payment';
      await booking.save({ transaction: t });

      // Create pending payment record
      await Payment.create(
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
      const tmnCode = process.env.VNP_TMN_CODE || 'SANDBOX01';
      const secretKey = process.env.VNP_HASH_SECRET || 'SECRETKEYVNPAY2026DEMO';
      const vnpUrl = process.env.VNP_URL || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
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
        const qrCode = await QRCode.toDataURL(qrPayload, {
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
        await this._restoreHoldingAfterGatewayFailure(bookingData.id, txnRef);
        const error = new Error(`Unable to create payOS payment link: ${gatewayError.message}`);
        error.statusCode = 502;
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
    const secretKey = process.env.VNP_HASH_SECRET || 'SECRETKEYVNPAY2026DEMO';
    const isValidChecksum = verifyVnpayChecksum(queryParams, secretKey);

    const responseCode = queryParams.vnp_ResponseCode;
    const txnRef = queryParams.vnp_TxnRef;
    const amount = Number(queryParams.vnp_Amount || 0) / 100;

    let booking = null;
    if (txnRef) {
      const payment = await Payment.findOne({
        where: { transaction_ref: txnRef },
        include: [{ model: Booking, as: 'booking' }],
      });
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
    const payment = await Payment.findOne({
      where: { transaction_ref: txnRef },
      include: [{ model: Booking, as: 'booking' }],
    });

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
    if (Math.round(Number(payment.amount)) !== Math.round(vnpAmount)) {
      console.warn(`[VNPay IPN] Amount mismatch: Expected ${payment.amount}, received ${vnpAmount}`);
      return { RspCode: '04', Message: 'Invalid amount' };
    }

    let bookingIdToEmail = null;
    let flightIdToEmit = null;
    let newSeatsCount = null;
    let transactionOutcome = 'processed';

    // BƯỚC 6: Cập nhật CSDL trong Transaction có Row-Level Lock
    await sequelize.transaction(async (t) => {
      const lockedPayment = await Payment.findOne({
        where: { id: payment.id },
        lock: t.LOCK.UPDATE,
        transaction: t,
      });

      const lockedBooking = await Booking.findOne({
        where: { id: payment.booking_id },
        lock: t.LOCK.UPDATE,
        transaction: t,
        include: [{ model: BookingPassenger, as: 'passengers' }],
      });

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
        await lockedPayment.save({ transaction: t });

        lockedBooking.status = 'confirmed';
        await lockedBooking.save({ transaction: t });

        bookingIdToEmail = lockedBooking.id;
      } else {
        // Báo cáo Chương 2.3 (Ngoại lệ, Chức năng 2):
        // Khách hủy giữa chừng hoặc thanh toán thất bại tại cổng:
        // 1. Set payment.status = 'failed'
        // 2. Nếu hold_expires_at còn hạn -> đưa booking.status về 'holding' (KHÔNG huỷ, KHÔNG hoàn ghế, KHÔNG hoàn promo)
        //    để khách có thể tiếp tục thử thanh toán lại trong thời gian giữ chỗ.
        // 3. Nếu hold_expires_at đã quá hạn -> set booking.status = 'expired', giải phóng ghế và hoàn lượt promo.
        lockedPayment.status = 'failed';
        await lockedPayment.save({ transaction: t });

        const now = new Date();
        const isHoldValid = lockedBooking.hold_expires_at && now <= new Date(lockedBooking.hold_expires_at);

        if (isHoldValid) {
          lockedBooking.status = 'holding';
          await lockedBooking.save({ transaction: t });
        } else {
          lockedBooking.status = 'expired';
          await lockedBooking.save({ transaction: t });

          // Giải phóng ghế về chuyến bay
          const flight = await Flight.findOne({
            where: { id: lockedBooking.flight_id },
            lock: t.LOCK.UPDATE,
            transaction: t,
          });

          if (flight) {
            const seatCount = lockedBooking.passengers ? lockedBooking.passengers.length : 1;
            flight.available_seats += seatCount;
            await flight.save({ transaction: t });
            flightIdToEmit = flight.id;
            newSeatsCount = flight.available_seats;
          }

          // Hoàn lượt dùng mã khuyến mãi
          if (lockedBooking.promotion_id) {
            const promo = await Promotion.findOne({
              where: { id: lockedBooking.promotion_id },
              lock: t.LOCK.UPDATE,
              transaction: t,
            });
            if (promo && promo.used_count > 0) {
              await promo.decrement('used_count', { by: 1, transaction: t });
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

    if (flightIdToEmit) {
      await this._emitSocketSeatUpdate(flightIdToEmit, newSeatsCount);
    }

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

    const payment = await Payment.findOne({
      where: { transaction_ref: String(orderCode) },
      include: [{ model: Booking, as: 'booking' }],
    });

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

    // Idempotency check
    if (payment.status === 'success' || payment.booking.status === 'confirmed') {
      return { message: 'Order already confirmed' };
    }

    if (payment.booking.status !== 'pending_payment') {
      return { message: 'Order already updated or invalid state' };
    }

    let bookingIdToEmail = null;
    let flightIdToEmit = null;
    let newSeatsCount = null;

    await sequelize.transaction(async (t) => {
      const lockedPayment = await Payment.findOne({
        where: { id: payment.id },
        lock: t.LOCK.UPDATE,
        transaction: t,
      });

      const lockedBooking = await Booking.findOne({
        where: { id: payment.booking_id },
        lock: t.LOCK.UPDATE,
        transaction: t,
        include: [{ model: BookingPassenger, as: 'passengers' }],
      });

      // Repeat idempotency/state checks under row locks to prevent two webhook
      // requests from confirming and emailing the same booking concurrently.
      if (lockedPayment.status === 'success' || lockedBooking.status === 'confirmed') return;
      if (lockedBooking.status !== 'pending_payment') return;

      if (isSuccess) {
        lockedPayment.status = 'success';
        lockedPayment.paid_at = new Date();
        await lockedPayment.save({ transaction: t });

        lockedBooking.status = 'confirmed';
        await lockedBooking.save({ transaction: t });

        bookingIdToEmail = lockedBooking.id;
      } else {
        // payOS reports a non-success payment or cancellation.
        lockedPayment.status = 'failed';
        await lockedPayment.save({ transaction: t });

        const now = new Date();
        const isHoldValid = lockedBooking.hold_expires_at && now <= new Date(lockedBooking.hold_expires_at);

        if (isHoldValid) {
          lockedBooking.status = 'holding';
          await lockedBooking.save({ transaction: t });
        } else {
          lockedBooking.status = 'expired';
          await lockedBooking.save({ transaction: t });

          const flight = await Flight.findOne({
            where: { id: lockedBooking.flight_id },
            lock: t.LOCK.UPDATE,
            transaction: t,
          });

          if (flight) {
            const seatCount = lockedBooking.passengers ? lockedBooking.passengers.length : 1;
            flight.available_seats += seatCount;
            await flight.save({ transaction: t });
            flightIdToEmit = flight.id;
            newSeatsCount = flight.available_seats;
          }

          if (lockedBooking.promotion_id) {
            const promo = await Promotion.findOne({
              where: { id: lockedBooking.promotion_id },
              lock: t.LOCK.UPDATE,
              transaction: t,
            });
            if (promo && promo.used_count > 0) {
              await promo.decrement('used_count', { by: 1, transaction: t });
            }
          }
        }
      }
    });

    if (flightIdToEmit) {
      await this._emitSocketSeatUpdate(flightIdToEmit, newSeatsCount);
    }

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

    const payment = await Payment.findOne({
      where: { transaction_ref: String(orderCode) },
      include: [{ model: Booking, as: 'booking' }],
    });

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
   * 5. Refund Module (Admin only)
   */
  async processRefund(bookingId, reason = 'Customer refund request', adminUser) {
    let flightIdToEmit = null;
    let newSeatsCount = null;

    const result = await sequelize.transaction(async (t) => {
      const booking = await Booking.findOne({
        where: { id: bookingId },
        lock: t.LOCK.UPDATE,
        transaction: t,
        include: [
          { model: BookingPassenger, as: 'passengers' },
          { model: Payment, as: 'payments' },
        ],
      });

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

      const successfulPayment = await Payment.findOne({
        where: {
          booking_id: bookingId,
          status: 'success',
        },
        lock: t.LOCK.UPDATE,
        transaction: t,
      });

      if (!successfulPayment) {
        const error = new Error('No successful payment found for this booking to refund.');
        error.statusCode = 400;
        throw error;
      }

      // Mark payment as refunded
      successfulPayment.status = 'refunded';
      await successfulPayment.save({ transaction: t });

      // Mark booking as cancelled
      booking.status = 'cancelled';
      await booking.save({ transaction: t });

      // Return seats to flight
      const flight = await Flight.findOne({
        where: { id: booking.flight_id },
        lock: t.LOCK.UPDATE,
        transaction: t,
      });

      if (flight) {
        const seats = booking.passengers ? booking.passengers.length : 1;
        flight.available_seats += seats;
        await flight.save({ transaction: t });
        flightIdToEmit = flight.id;
        newSeatsCount = flight.available_seats;
      }

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

    if (flightIdToEmit) {
      await this._emitSocketSeatUpdate(flightIdToEmit, newSeatsCount);
    }

    return result;
  }
}

module.exports = new PaymentService();
