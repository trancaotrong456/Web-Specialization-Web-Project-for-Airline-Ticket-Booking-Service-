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
  signMomoString,
  verifyMomoChecksum,
} = require('../utils/checksum.util');
const { getIO } = require('../sockets');
const flightService = require('./flight.service');
const { verifyBookingAccess } = require('../utils/bookingAccess.util');

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
    const txnRef = `TXN_${booking_id}_${Date.now()}`;
    let bookingData = null;

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
      const finalReturnUrl = return_url || process.env.VNP_RETURN_URL || 'http://localhost:3000/payment/vnpay-return';

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
    } else if (payment_method === 'momo') {
      const partnerCode = process.env.MOMO_PARTNER_CODE || 'MOMO_DEMO_PARTNER';
      const secretKey = process.env.MOMO_SECRET_KEY || 'MOMO_DEMO_SECRET_KEY';
      const redirectUrl = return_url || process.env.MOMO_REDIRECT_URL || 'http://localhost:3000/payment/momo-return';
      const ipnUrl = process.env.MOMO_IPN_URL || 'http://localhost:5000/api/v1/payments/momo/ipn';
      const amount = Math.round(Number(bookingData.total_amount));
      const orderInfo = `Thanh toan ve may bay ${bookingData.booking_code}`;
      const requestId = txnRef;
      const orderId = txnRef;
      const extraData = '';

      const rawSignature = `accessKey=${process.env.MOMO_ACCESS_KEY || ''}&amount=${amount}&extraData=${extraData}&ipnUrl=${ipnUrl}&orderId=${orderId}&orderInfo=${orderInfo}&partnerCode=${partnerCode}&redirectUrl=${redirectUrl}&requestId=${requestId}&requestType=captureWallet`;
      const signature = signMomoString(rawSignature, secretKey);

      paymentUrl = `${process.env.MOMO_ENDPOINT || 'https://test-payment.momo.vn/v2/gateway/api/create'}?partnerCode=${partnerCode}&orderId=${orderId}&signature=${signature}`;
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

    if (flightIdToEmit) {
      await this._emitSocketSeatUpdate(flightIdToEmit, newSeatsCount);
    }

    if (bookingIdToEmail) {
      this._triggerBookingConfirmationEmail(bookingIdToEmail);
    }

    return { RspCode: '00', Message: 'Confirm Success' };
  }

  /**
   * 4. MoMo IPN Callback
   */
  async handleMomoCallback(body) {
    const secretKey = process.env.MOMO_SECRET_KEY || 'MOMO_DEMO_SECRET_KEY';

    const isChecksumValid = verifyMomoChecksum(body, secretKey);
    if (!isChecksumValid) {
      console.warn('[MoMo Callback] Invalid signature checksum:', {
        orderId: body.orderId || null,
        responseTime: body.responseTime || null,
        receivedAt: new Date().toISOString(),
      });
      const error = new Error('Invalid signature');
      error.statusCode = 400;
      throw error;
    }

    const { orderId, amount, resultCode } = body;

    const payment = await Payment.findOne({
      where: { transaction_ref: orderId },
      include: [{ model: Booking, as: 'booking' }],
    });

    if (!payment || !payment.booking) {
      const error = new Error('Payment or Booking not found');
      error.statusCode = 404;
      throw error;
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

      if (Number(resultCode) === 0) {
        lockedPayment.status = 'success';
        lockedPayment.paid_at = new Date();
        await lockedPayment.save({ transaction: t });

        lockedBooking.status = 'confirmed';
        await lockedBooking.save({ transaction: t });

        bookingIdToEmail = lockedBooking.id;
      } else {
        // MoMo thanh toán thất bại / khách hủy
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
   * Alias for processRefund
   */
  async refundPayment(bookingId, reason, adminUser) {
    return this.processRefund(bookingId, reason, adminUser);
  }

  /**
   * 5. Refund Module (Admin / Staff only)
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

      console.log(`[Refund] Admin/Staff ${adminUser.email} refunded booking #${booking.id} (${successfulPayment.amount} VND). Reason: ${reason}`);

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
