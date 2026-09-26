const crypto = require('crypto');
const { Op } = require('sequelize');
const {
  sequelize,
  Booking,
  BookingPassenger,
  Flight,
  FareClass,
  Promotion,
  User,
  Payment,
  Airline,
  Airport,
} = require('../models');
const { getIO } = require('../sockets');
const flightService = require('./flight.service');
const { verifyBookingAccess } = require('../utils/bookingAccess.util');

class BookingService {
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
      // Socket might not be initialized in test environment
    }

    await flightService.checkAndEmitSeatWarning(flightId);
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
    if (!user_id && !guest_email) {
      const error = new Error('Guest email is required if you are not logged in');
      error.statusCode = 400;
      throw error;
    }

    const passengerCount = passengers.length;
    const holdingMinutes = parseInt(process.env.HOLDING_TIME_MINUTES || '15', 10);
    const holdExpiresAt = new Date(Date.now() + holdingMinutes * 60 * 1000);

    const result = await sequelize.transaction(async (t) => {
      // 1. Lock flight row to check seat availability
      const flight = await Flight.findOne({
        where: { id: flight_id },
        lock: t.LOCK.UPDATE,
        transaction: t,
      });

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

      if (flight.available_seats < passengerCount) {
        const error = new Error(`Not enough available seats. Only ${flight.available_seats} remaining`);
        error.statusCode = 400;
        throw error;
      }

      // 2. Validate fare class
      const fareClass = await FareClass.findOne({
        where: { id: fare_class_id, flight_id },
        transaction: t,
      });

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
        const promo = await Promotion.findOne({
          where: { code: promotion_code },
          lock: t.LOCK.UPDATE,
          transaction: t,
        });

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
        await promo.increment('used_count', { by: 1, transaction: t });
      }

      // 4. Deduct seats from flight
      flight.available_seats -= passengerCount;
      await flight.save({ transaction: t });

      // 5. Generate unique booking code
      let bookingCode = this._generateBookingCode();
      let isCodeUnique = false;
      while (!isCodeUnique) {
        const existing = await Booking.findOne({ where: { booking_code: bookingCode }, transaction: t });
        if (!existing) {
          isCodeUnique = true;
        } else {
          bookingCode = this._generateBookingCode();
        }
      }

      // 6. Create Booking
      const booking = await Booking.create(
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

      await BookingPassenger.bulkCreate(passengerRecords, { transaction: t });

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
    const booking = await Booking.findByPk(bookingId, {
      include: [
        {
          model: Flight,
          as: 'flight',
          include: [
            { model: Airline, as: 'airline', attributes: ['id', 'name', 'iata_code', 'logo_url'] },
            { model: Airport, as: 'departureAirport', attributes: ['id', 'name', 'iata_code', 'city', 'country'] },
            { model: Airport, as: 'arrivalAirport', attributes: ['id', 'name', 'iata_code', 'city', 'country'] },
          ],
        },
        { model: FareClass, as: 'fareClass' },
        { model: Promotion, as: 'promotion' },
        { model: BookingPassenger, as: 'passengers' },
        { model: Payment, as: 'payments' },
        { model: User, as: 'user', attributes: ['id', 'full_name', 'email', 'phone'] },
      ],
    });

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
  async getBookingByCode(bookingCode, email = null) {
    const where = { booking_code: bookingCode };

    const booking = await Booking.findOne({
      where,
      include: [
        {
          model: Flight,
          as: 'flight',
          include: [
            { model: Airline, as: 'airline' },
            { model: Airport, as: 'departureAirport' },
            { model: Airport, as: 'arrivalAirport' },
          ],
        },
        { model: FareClass, as: 'fareClass' },
        { model: Promotion, as: 'promotion' },
        { model: BookingPassenger, as: 'passengers' },
        { model: Payment, as: 'payments' },
      ],
    });

    if (!booking) {
      const error = new Error('Booking not found with this code');
      error.statusCode = 404;
      throw error;
    }

    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
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
    const where = { user_id: userId };
    if (status) {
      where.status = status;
    }

    const { count, rows } = await Booking.findAndCountAll({
      where,
      limit: Number(limit),
      offset: Number(offset),
      order: [['created_at', 'DESC']],
      include: [
        {
          model: Flight,
          as: 'flight',
          include: [
            { model: Airline, as: 'airline' },
            { model: Airport, as: 'departureAirport' },
            { model: Airport, as: 'arrivalAirport' },
          ],
        },
        { model: FareClass, as: 'fareClass' },
        { model: BookingPassenger, as: 'passengers' },
        { model: Payment, as: 'payments' },
      ],
    });

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
    let flightIdToEmit = null;
    let newAvailableSeats = null;

    await sequelize.transaction(async (t) => {
      const booking = await Booking.findOne({
        where: { id: bookingId },
        lock: t.LOCK.UPDATE,
        transaction: t,
        include: [{ model: BookingPassenger, as: 'passengers' }],
      });

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
      const flight = await Flight.findOne({
        where: { id: booking.flight_id },
        lock: t.LOCK.UPDATE,
        transaction: t,
      });

      if (flight) {
        const passengerCount = booking.passengers ? booking.passengers.length : 1;
        flight.available_seats += passengerCount;
        await flight.save({ transaction: t });
        flightIdToEmit = flight.id;
        newAvailableSeats = flight.available_seats;
      }

      // 2. Rollback promotion if used
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

      // 3. Update status to cancelled
      booking.status = 'cancelled';
      await booking.save({ transaction: t });
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
    const expiredBookings = await Booking.findAll({
      where: {
        status: 'holding',
        hold_expires_at: {
          [Op.lt]: new Date(),
        },
      },
      include: [{ model: BookingPassenger, as: 'passengers' }],
    });

    if (expiredBookings.length === 0) {
      return { expiredCount: 0 };
    }

    console.log(`[Cron] Found ${expiredBookings.length} holding bookings to expire.`);
    let expiredCount = 0;

    for (const booking of expiredBookings) {
      try {
        let flightIdToEmit = null;
        let newAvailableSeats = null;

        await sequelize.transaction(async (t) => {
          const lockedBooking = await Booking.findOne({
            where: { id: booking.id, status: 'holding' },
            lock: t.LOCK.UPDATE,
            transaction: t,
          });

          if (!lockedBooking) return; // Might have been processed concurrently

          const flight = await Flight.findOne({
            where: { id: lockedBooking.flight_id },
            lock: t.LOCK.UPDATE,
            transaction: t,
          });

          if (flight) {
            const seats = booking.passengers ? booking.passengers.length : 1;
            flight.available_seats += seats;
            await flight.save({ transaction: t });
            flightIdToEmit = flight.id;
            newAvailableSeats = flight.available_seats;
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

          lockedBooking.status = 'expired';
          await lockedBooking.save({ transaction: t });
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
   * Admin/Staff: Get all bookings
   */
  async getAllBookings({ page = 1, limit = 10, status, search }) {
    const offset = (page - 1) * limit;
    const where = {};
    if (status) where.status = status;
    if (search) {
      where[Op.or] = [
        { booking_code: { [Op.like]: `%${search}%` } },
        { guest_email: { [Op.like]: `%${search}%` } },
      ];
    }

    const { count, rows } = await Booking.findAndCountAll({
      where,
      limit: Number(limit),
      offset: Number(offset),
      order: [['created_at', 'DESC']],
      include: [
        {
          model: Flight,
          as: 'flight',
          include: [
            { model: Airline, as: 'airline' },
            { model: Airport, as: 'departureAirport' },
            { model: Airport, as: 'arrivalAirport' },
          ],
        },
        { model: FareClass, as: 'fareClass' },
        { model: BookingPassenger, as: 'passengers' },
        { model: Payment, as: 'payments' },
        { model: User, as: 'user', attributes: ['id', 'full_name', 'email'] },
      ],
    });

    return {
      total: count,
      page,
      limit,
      data: rows,
    };
  }
}

module.exports = new BookingService();
