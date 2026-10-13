const crypto = require('crypto');
const { getIO } = require('../../sockets');
const { verifyBookingAccess } = require('../../utils/bookingAccess.util');
const { normalizeGuestEmail } = require('../../utils/guestEmail.util');

class BookingService {
  constructor({ repository, transactionManager, socket = getIO, flightSeatService } = {}) {
    if (!repository || !transactionManager) throw new TypeError('Booking repository and transaction manager are required');
    this.repository = repository;
    this.transactionManager = transactionManager;
    this.socket = socket;
    this.flightSeatService = flightSeatService;
  }
  /**
   * Helper to generate unique booking code
   */
  _generateBookingCode() {
    return 'BK' + crypto.randomBytes(3).toString('hex').toUpperCase();
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
      // Socket might not be initialized in test environment
    }

    await (this.flightSeatService || require('../../services/flight.service')).checkAndEmitSeatWarning(flightId);
  }

  /**
   * Alias for createHoldingBooking
   */
  async createBooking(data) {
    return this.createHoldingBooking(data);
  }

  /**
   * 1. Create holding booking with row-level locking
   */
  async createHoldingBooking({ flight_id, fare_class_id, promotion_code, passengers, guest_email, user_id, currentUser = null }) {
    guest_email = normalizeGuestEmail(guest_email);
    if (!user_id && !guest_email) {
      const error = new Error('Guest email is required if you are not logged in');
      error.statusCode = 400;
      throw error;
    }

    const passengerCount = passengers.length;
    const holdingMinutes = parseInt(process.env.HOLDING_TIME_MINUTES || '15', 10);
    const holdExpiresAt = new Date(Date.now() + holdingMinutes * 60 * 1000);

    const result = await this.transactionManager.transaction(async (t) => {
      // 1. Lock flight row to check seat availability
      const flight = await this.repository.findFlightForUpdate(flight_id, t);

      if (!flight) {
        const error = new Error('Flight not found');
        error.statusCode = 404;
        throw error;
      }

      if (flight.status !== 'scheduled') {
        const error = new Error('Flight is not available for booking');
        error.statusCode = 400;
        throw error;
      }

      // Reject bookings for flights that have already departed
      const departureTime = new Date(flight.departure_time);

      if (
        Number.isNaN(departureTime.getTime()) ||
        departureTime.getTime() <= Date.now()
      ) {
        const error = new Error(
          'Cannot book a flight that has already departed'
        );
        error.statusCode = 400;
        throw error;
      }

      if (flight.available_seats < passengerCount) {
        const error = new Error(
          `Not enough available seats. Only ${flight.available_seats} remaining`
        );
        error.statusCode = 400;
        throw error;
      }

      // 2. Validate fare class
      const fareClass = await this.repository.findFareClassForFlight(fare_class_id, flight_id, t);

      if (!fareClass) {
        const error = new Error('Selected fare class does not belong to this flight');
        error.statusCode = 404;
        throw error;
      }

      const baseAmount = Number(fareClass.price) * passengerCount;
      let totalAmount = baseAmount;
      let promotionId = null;

      // 3. Check promotion if provided
      if (promotion_code) {
        const promo = await this.repository.findPromotionByCodeForUpdate(promotion_code, t);

        if (!promo) {
          const error = new Error('Promotion code not found');
          error.statusCode = 404;
          throw error;
        }

        const now = new Date();
        if (now < new Date(promo.valid_from) || now > new Date(promo.valid_to)) {
          const error = new Error('Promotion code is expired or not yet active');
          error.statusCode = 400;
          throw error;
        }

        if (promo.max_uses !== null && promo.used_count >= promo.max_uses) {
          const error = new Error('Promotion code usage limit has been reached');
          error.statusCode = 400;
          throw error;
        }

        let discount = 0;
        if (promo.discount_type === 'percent') {
          discount = (baseAmount * Number(promo.discount_value)) / 100;
        } else if (promo.discount_type === 'amount') {
          discount = Number(promo.discount_value);
        }

        totalAmount = Math.max(0, baseAmount - discount);
        promotionId = promo.id;

        // Increment promotion usage
        await this.repository.increment(promo, 'used_count', { by: 1, transaction: t });
      }

      // 4. Deduct seats from flight
      flight.available_seats -= passengerCount;
      await this.repository.save(flight, { transaction: t });

      // 5. Generate unique booking code
      let bookingCode = this._generateBookingCode();
      let isCodeUnique = false;
      while (!isCodeUnique) {
        const existing = await this.repository.findBookingCode(bookingCode, t);
        if (!existing) {
          isCodeUnique = true;
        } else {
          bookingCode = this._generateBookingCode();
        }
      }

      // 6. Create Booking
      const booking = await this.repository.createBooking(
        {
          booking_code: bookingCode,
          user_id: user_id || null,
          flight_id,
          fare_class_id,
          promotion_id: promotionId,
          status: 'holding',
          total_amount: totalAmount,
          hold_expires_at: holdExpiresAt,
          guest_email: user_id ? null : guest_email,
        },
        { transaction: t }
      );

      // 7. Create Passenger records
      const passengerRecords = passengers.map((p) => ({
        booking_id: booking.id,
        passenger_name: p.passenger_name,
        passport_no: p.passport_no || null,
        seat_no: p.seat_no || null,
      }));

      await this.repository.createPassengers(passengerRecords, { transaction: t });

      return { booking, flightAvailableSeats: flight.available_seats };
    });

    // Real-time notification after transaction commits
    await this._emitSocketSeatUpdate(flight_id, result.flightAvailableSeats);

    return this.getBookingById(result.booking.id, currentUser, guest_email);
  }

  /**
   * 2. Get booking details by ID or code
   */
  async getBookingById(bookingId, currentUser = null, guestEmail = null) {
    guestEmail = normalizeGuestEmail(guestEmail);
    const booking = await this.repository.findBookingDetail(bookingId);

    if (!booking) {
      const error = new Error('Booking not found');
      error.statusCode = 404;
      throw error;
    }

    verifyBookingAccess(booking, currentUser, guestEmail);

    return booking;
  }

  /**
   * Public lookup is restricted to guest bookings and requires the guest email.
   * Registered users must access their bookings through authenticated endpoints.
   */
  async getBookingByCode(bookingCode, guestEmail = null) {
    const booking = await this.repository.findBookingByCode(bookingCode);

    if (!booking) {
      const error = new Error('Booking not found with this code');
      error.statusCode = 404;
      throw error;
    }

    const normalizedEmail = normalizeGuestEmail(guestEmail) || '';
    const normalizedGuestEmail = booking.guest_email ? booking.guest_email.trim().toLowerCase() : '';

    if (
      booking.user_id !== null ||
      !normalizedGuestEmail ||
      !normalizedEmail ||
      normalizedGuestEmail !== normalizedEmail
    ) {
      const error = new Error('Booking access denied');
      error.statusCode = 403;
      throw error;
    }

    return booking;
  }

  /**
   * 3. Get list of bookings for current authenticated user
   */
  async getUserBookings(userId, { page = 1, limit = 10, status }) {
    const offset = (page - 1) * limit;
    const { count, rows } = await this.repository.listUserBookings(userId, { status, limit: Number(limit), offset: Number(offset) });

    return {
      total: count,
      page,
      limit,
      data: rows,
    };
  }

  /**
   * 4. Cancel holding booking by user
   */
  async cancelHoldingBooking(bookingId, currentUser = null, guestEmail = null) {
    guestEmail = normalizeGuestEmail(guestEmail);
    let flightIdToEmit = null;
    let newAvailableSeats = null;

    await this.transactionManager.transaction(async (t) => {
      const booking = await this.repository.findBookingForCancellation(bookingId, t);

      if (!booking) {
        const error = new Error('Booking not found');
        error.statusCode = 404;
        throw error;
      }

      verifyBookingAccess(booking, currentUser, guestEmail);

      if (booking.status !== 'holding') {
        const error = new Error(`Cannot cancel booking with status: ${booking.status}. Only holding bookings can be cancelled.`);
        error.statusCode = 400;
        throw error;
      }

      // 1. Release seats back to flight
      const flight = await this.repository.findFlightForUpdate(booking.flight_id, t);

      if (flight) {
        const passengerCount = booking.passengers ? booking.passengers.length : 1;
        flight.available_seats += passengerCount;
        await this.repository.save(flight, { transaction: t });
        flightIdToEmit = flight.id;
        newAvailableSeats = flight.available_seats;
      }

      // 2. Rollback promotion if used
      if (booking.promotion_id) {
        const promo = await this.repository.findPromotionByIdForUpdate(booking.promotion_id, t);
        if (promo && promo.used_count > 0) {
          await this.repository.decrement(promo, 'used_count', { by: 1, transaction: t });
        }
      }

      // 3. Update status to cancelled
      booking.status = 'cancelled';
      await this.repository.save(booking, { transaction: t });
    });

    if (flightIdToEmit) {
      await this._emitSocketSeatUpdate(flightIdToEmit, newAvailableSeats);
    }

    return { message: 'Booking cancelled successfully' };
  }

  /**
   * 5. Expire holding bookings (Used by cron job)
   * CRITICAL: where condition MUST be { status: 'holding' } only!
   * NOT including 'pending_payment'!
   */
  async expireHoldingBookings() {
    const expiredBookings = await this.repository.findExpiredHoldingBookings(new Date());

    if (expiredBookings.length === 0) {
      return { expiredCount: 0 };
    }

    console.log(`[Cron] Found ${expiredBookings.length} holding bookings to expire.`);
    let expiredCount = 0;

    for (const booking of expiredBookings) {
      try {
        let flightIdToEmit = null;
        let newAvailableSeats = null;

        await this.transactionManager.transaction(async (t) => {
          const lockedBooking = await this.repository.findHoldingBookingForExpiry(booking.id, t);

          if (!lockedBooking) return; // Might have been processed concurrently

          const flight = await this.repository.findFlightForUpdate(lockedBooking.flight_id, t);

          if (flight) {
            const seats = booking.passengers ? booking.passengers.length : 1;
            flight.available_seats += seats;
            await this.repository.save(flight, { transaction: t });
            flightIdToEmit = flight.id;
            newAvailableSeats = flight.available_seats;
          }

          if (lockedBooking.promotion_id) {
            const promo = await this.repository.findPromotionByIdForUpdate(lockedBooking.promotion_id, t);
            if (promo && promo.used_count > 0) {
              await this.repository.decrement(promo, 'used_count', { by: 1, transaction: t });
            }
          }

          lockedBooking.status = 'expired';
          await this.repository.save(lockedBooking, { transaction: t });
          expiredCount++;
        });

        if (flightIdToEmit) {
          await this._emitSocketSeatUpdate(flightIdToEmit, newAvailableSeats);
        }
      } catch (err) {
        console.error(`[Cron] Error expiring booking #${booking.id}:`, err.message);
      }
    }

    return { expiredCount };
  }

  /**
   * Reconcile payment attempts that never receive a gateway callback.
   * This remains separate from expireHoldingBookings(): pending payments get
   * a callback grace period and are never expired by the holding-only query.
   */
  async reconcileStalePendingPayments() {
    const configuredGrace = Number.parseFloat(process.env.PAYMENT_PENDING_GRACE_MINUTES || '5');
    const graceMinutes = Number.isFinite(configuredGrace) && configuredGrace >= 0 ? configuredGrace : 5;
    const cutoff = new Date(Date.now() - graceMinutes * 60 * 1000);

    const candidates = await this.repository.findStalePendingBookings(cutoff);

    let reconciledCount = 0;

    for (const candidate of candidates) {
      try {
        let flightIdToEmit = null;
        let newAvailableSeats = null;

        await this.transactionManager.transaction(async (t) => {
          // Match the webhook lock order (Payment -> Booking) when a pending
          // payment exists, reducing deadlock risk during callback races.
          const payment = await this.repository.findPendingPaymentForReconciliation(candidate.id, t);

          const booking = await this.repository.findBookingForReconciliation(candidate.id, t);

          if (!booking || booking.status !== 'pending_payment') return;
          // A pending_payment booking is expected to have one pending Payment.
          // If that invariant is broken, leave the booking untouched for manual
          // investigation instead of risking expiry after a successful charge.
          if (!payment) return;
          if (!booking.hold_expires_at || new Date(booking.hold_expires_at) >= cutoff) return;

          payment.status = 'failed';
          await this.repository.save(payment, { transaction: t });

          const flight = await this.repository.findFlightForUpdate(booking.flight_id, t);

          if (flight) {
            const seats = booking.passengers ? booking.passengers.length : 1;
            flight.available_seats += seats;
            await this.repository.save(flight, { transaction: t });
            flightIdToEmit = flight.id;
            newAvailableSeats = flight.available_seats;
          }

          if (booking.promotion_id) {
            const promo = await this.repository.findPromotionByIdForUpdate(booking.promotion_id, t);
            if (promo && promo.used_count > 0) {
              await this.repository.decrement(promo, 'used_count', { by: 1, transaction: t });
            }
          }

          booking.status = 'expired';
          await this.repository.save(booking, { transaction: t });
          reconciledCount++;
        });

        if (flightIdToEmit) {
          await this._emitSocketSeatUpdate(flightIdToEmit, newAvailableSeats);
        }
      } catch (error) {
        console.error(`[Cron] Error reconciling pending booking #${candidate.id}:`, error.message);
      }
    }

    return { reconciledCount };
  }

  /**
   * Admin/Staff: Get all bookings
   */
  async getAllBookings({ page = 1, limit = 10, status, search }) {
    const offset = (page - 1) * limit;
    const { count, rows } = await this.repository.listAllBookings({ status, search, limit: Number(limit), offset: Number(offset) });

    return {
      total: count,
      page,
      limit,
      data: rows,
    };
  }
}

module.exports = BookingService;
