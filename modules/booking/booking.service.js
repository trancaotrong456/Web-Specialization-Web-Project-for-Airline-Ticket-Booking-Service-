const crypto = require('crypto');
const { getIO } = require('../../sockets');
const { verifyBookingAccess } = require('../../utils/bookingAccess.util');
const { normalizeGuestEmail } = require('../../utils/guestEmail.util');
const { releaseBookingFlightSeats } = require('../../utils/bookingItinerary.util');
const { redactString } = require('../../shared/security/redactSensitive');
const { toMinorUnits, fromMinorUnits, wholeVndAmount } = require('../ancillaries/money.util');
const { recordBookingStatusTransition } = require('./bookingStatusHistory.util');

class BookingService {
  constructor({ repository, transactionManager, socket = getIO, flightSeatService, payosStatusLookup, payosReconciliationAvailable, seatSelectionService, ancillaryService, notificationPublisher } = {}) {
    if (!repository || !transactionManager) throw new TypeError('Booking repository and transaction manager are required');
    this.repository = repository;
    this.transactionManager = transactionManager;
    this.socket = socket;
    this.flightSeatService = flightSeatService;
    this.payosStatusLookup = payosStatusLookup;
    this.payosReconciliationAvailable = payosReconciliationAvailable;
    this.seatSelectionService = seatSelectionService;
    this.ancillaryService = ancillaryService;
    this.notificationPublisher = notificationPublisher;
  }

  async _lookupPayosStatus(transactionRef) {
    if (typeof this.payosStatusLookup !== 'function') return null;
    return this.payosStatusLookup(transactionRef);
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
  async _emitSeatUpdates(updates = []) {
    for (const update of updates) await this._emitSocketSeatUpdate(update.flight_id, update.available_seats);
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
  async createHoldingBooking({ flight_id, fare_class_id, trip_type, itinerary_legs, seat_selections = [], ancillary_selections = [], promotion_code, passengers, guest_email, user_id, currentUser = null }) {
    guest_email = normalizeGuestEmail(guest_email);
    if (!user_id && !guest_email) {
      const error = new Error('Guest email is required if you are not logged in');
      error.statusCode = 400;
      throw error;
    }

    if (!Array.isArray(passengers) || passengers.length === 0) {
      const error = new Error('passengers must contain at least 1 passenger');
      error.statusCode = 400;
      throw error;
    }
    const passengerCount = passengers.length;
    const holdingMinutes = parseInt(process.env.HOLDING_TIME_MINUTES || '15', 10);
    const holdExpiresAt = new Date(Date.now() + holdingMinutes * 60 * 1000);

    const requestedLegs = Array.isArray(itinerary_legs) && itinerary_legs.length
      ? itinerary_legs.map((leg) => ({ flight_id: Number(leg.flight_id), fare_class_id: Number(leg.fare_class_id) }))
      : [{ flight_id: Number(flight_id), fare_class_id: Number(fare_class_id) }];
    if (requestedLegs.length > 4 || (Array.isArray(itinerary_legs) && itinerary_legs.length < 2) || requestedLegs.some((leg) => !Number.isInteger(leg.flight_id) || leg.flight_id < 1 || !Number.isInteger(leg.fare_class_id) || leg.fare_class_id < 1)) {
      const error = new Error('Itinerary must contain 1 to 4 valid flight and fare selections');
      error.statusCode = 400;
      throw error;
    }
    if (trip_type && !['one_way', 'round_trip', 'multi_city'].includes(trip_type)) {
      const error = new Error('Trip type must be one_way, round_trip, or multi_city'); error.statusCode = 400; throw error;
    }
    if ((trip_type === 'round_trip' && requestedLegs.length !== 2)
      || (trip_type === 'multi_city' && requestedLegs.length < 2)
      || (trip_type === 'one_way' && requestedLegs.length !== 1)) {
      const error = new Error('Selected trip type does not match the itinerary legs'); error.statusCode = 400; throw error;
    }
    if (requestedLegs[0].flight_id !== Number(flight_id) || requestedLegs[0].fare_class_id !== Number(fare_class_id)) {
      const error = new Error('The first itinerary leg must match flight_id and fare_class_id');
      error.statusCode = 400;
      throw error;
    }
    if (new Set(requestedLegs.map((leg) => leg.flight_id)).size !== requestedLegs.length) {
      const error = new Error('A flight cannot appear more than once in an itinerary');
      error.statusCode = 400;
      throw error;
    }

    const result = await this.transactionManager.transaction(async (t) => {
      // Lock in a stable id order to avoid deadlocks when concurrent itineraries overlap.
      const lockedFlights = new Map();
      for (const id of [...new Set(requestedLegs.map((leg) => leg.flight_id))].sort((a, b) => a - b)) {
        lockedFlights.set(id, await this.repository.findFlightForUpdate(id, t));
      }
      const legs = [];
      for (let index = 0; index < requestedLegs.length; index += 1) {
        const requested = requestedLegs[index];
        const flight = lockedFlights.get(requested.flight_id);
        if (!flight) {
          const error = new Error('Flight not found'); error.statusCode = 404; throw error;
        }
        if (flight.status !== 'scheduled') {
          const error = new Error('Flight is not available for booking'); error.statusCode = 400; throw error;
        }
        const departureTime = new Date(flight.departure_time);
        if (Number.isNaN(departureTime.getTime()) || departureTime.getTime() <= Date.now()) {
          const error = new Error('Cannot book a flight that has already departed'); error.statusCode = 400; throw error;
        }
        if (flight.available_seats < passengerCount) {
          const error = new Error(`Not enough available seats. Only ${flight.available_seats} remaining`); error.statusCode = 400; throw error;
        }
        if (index > 0) {
          const previousFlight = legs[index - 1].flight;
          const previousArrival = new Date(previousFlight.arrival_time).getTime();
          const connectingAtSameAirport = Number(previousFlight.arrival_airport_id) === Number(flight.departure_airport_id);
          if (!connectingAtSameAirport) {
            const error = new Error('Each itinerary flight must connect to the previous arrival airport'); error.statusCode = 400; throw error;
          }
          if (!Number.isFinite(previousArrival) || departureTime.getTime() - previousArrival < 60 * 60 * 1000) {
            const error = new Error('Connecting flights require at least 60 minutes between arrival and departure'); error.statusCode = 400; throw error;
          }
        }
        const fareClass = await this.repository.findFareClassForFlight(requested.fare_class_id, requested.flight_id, t);
        if (!fareClass) {
          const error = new Error('Selected fare class does not belong to this flight'); error.statusCode = 404; throw error;
        }
        if (fareClass.seat_quota !== null && fareClass.seat_quota !== undefined && typeof this.repository.countReservedFareSeats === 'function') {
          const reserved = Number(await this.repository.countReservedFareSeats(requested.fare_class_id, t));
          const quota = Number(fareClass.seat_quota);
          if (!Number.isSafeInteger(quota) || quota < 0 || !Number.isSafeInteger(reserved) || reserved < 0) throw new Error('Invalid fare inventory data');
          const remaining = Math.max(0, quota - reserved);
          if (passengerCount > remaining) {
            const error = new Error(`Not enough seats in selected fare class. Only ${remaining} remaining`);
            error.statusCode = 400;
            throw error;
          }
        }
        legs.push({ ...requested, flight, fareClass });
      }

      if (trip_type === 'round_trip') {
        const [outbound, inbound] = legs.map(({ flight }) => flight);
        if (Number(outbound.departure_airport_id) !== Number(inbound.arrival_airport_id)
          || Number(outbound.arrival_airport_id) !== Number(inbound.departure_airport_id)) {
          const error = new Error('Round-trip flights must return to the original departure airport'); error.statusCode = 400; throw error;
        }
      }

      const baseAmountMinor = legs.reduce((sum, leg) => sum + wholeVndAmount(leg.fareClass.price) * 100 * passengerCount, 0);
      let totalAmountMinor = baseAmountMinor;
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

        let discountMinor = 0;
        if (promo.discount_type === 'percent') {
          const percentHundredths = BigInt(toMinorUnits(promo.discount_value));
          discountMinor = Number((BigInt(baseAmountMinor) * percentHundredths + 5000n) / 10000n);
        } else if (promo.discount_type === 'amount') {
          discountMinor = toMinorUnits(promo.discount_value);
        }

        totalAmountMinor = Math.max(0, baseAmountMinor - discountMinor);
        promotionId = promo.id;

        // Increment promotion usage
        await this.repository.increment(promo, 'used_count', { by: 1, transaction: t });
      }

      wholeVndAmount(fromMinorUnits(totalAmountMinor));

      // 4. Hold seats on every selected flight atomically.
      for (const leg of legs) {
        leg.flight.available_seats -= passengerCount;
        await this.repository.save(leg.flight, { transaction: t });
      }

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
          total_amount: Number(fromMinorUnits(totalAmountMinor)),
          hold_expires_at: holdExpiresAt,
          guest_email: user_id ? null : guest_email,
        },
        { transaction: t }
      );

      if (typeof this.repository.createStatusHistory === 'function'
        && (t?.id || t?.connection || !Object.prototype.hasOwnProperty.call(this.repository, 'BookingStatusHistory'))) {
        await recordBookingStatusTransition({ booking, fromStatusOverride: null, toStatus: 'holding', source: 'booking_created', actorUserId: user_id, repository: this.repository, transaction: t });
      }

      let createdSegments = [];
      if (legs.length > 0 && (t?.id || t?.connection || !Object.prototype.hasOwnProperty.call(this.repository, 'BookingSegment'))) {
        createdSegments = await this.repository.createBookingSegments(legs.map((leg, index) => ({
          booking_id: booking.id,
          leg_order: index + 1,
          flight_id: leg.flight_id,
          fare_class_id: leg.fare_class_id,
          price_per_passenger: Number(leg.fareClass.price),
        })), { transaction: t });
      }

      // 7. Create Passenger records
      const passengerRecords = passengers.map((p, passengerIndex) => ({
        booking_id: booking.id,
        passenger_name: p.passenger_name,
        passport_no: p.passport_no || null,
        seat_no: seat_selections.find((selection) => Number(selection.leg_order) === 1 && Number(selection.passenger_index) === passengerIndex)?.seat_no || p.seat_no || null,
      }));

      const createdPassengers = await this.repository.createPassengers(passengerRecords, { transaction: t });
      if (seat_selections.length) {
        if (!this.seatSelectionService) throw new Error('Seat selection is not available for this booking');
        await this.seatSelectionService.reserveSeats({ bookingId: booking.id, passengers: createdPassengers, selections: seat_selections, legs, holdExpiresAt, transaction: t });
      }
      if (ancillary_selections.length) {
        if (!this.ancillaryService) throw new Error('Ancillary services are not available for this booking');
        const reserved = await this.ancillaryService.reserveForBooking({ booking, passengers: createdPassengers, segments: createdSegments, selections: ancillary_selections, transaction: t });
        booking.total_amount = wholeVndAmount(fromMinorUnits(toMinorUnits(booking.total_amount) + toMinorUnits(reserved.subtotal)));
        await this.repository.save(booking, { transaction: t });
      }
      if (this.notificationPublisher) {
        await this.notificationPublisher.publish({
          eventKey: `booking:${booking.id}:created`, eventType: 'BOOKING_CREATED', aggregateType: 'booking', aggregateId: booking.id,
          recipientUserId: booking.user_id, recipientEmail: guest_email, relatedType: 'booking', relatedId: booking.id,
          variables: { code: booking.booking_code },
        }, { transaction: t });
      }

      return { booking, flightSeatUpdates: legs.map(({ flight }) => ({ id: flight.id, availableSeats: flight.available_seats })) };
    });

    // Real-time notification after transaction commits
    for (const flight of result.flightSeatUpdates) await this._emitSocketSeatUpdate(flight.id, flight.availableSeats);

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
    let seatUpdates = [];

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
      seatUpdates = await releaseBookingFlightSeats(booking, { repository: this.repository, transaction: t, findFlight: this.repository.findFlightForUpdate.bind(this.repository) });

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

    await this._emitSeatUpdates(seatUpdates);

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
        let seatUpdates = [];

        await this.transactionManager.transaction(async (t) => {
          const lockedBooking = await this.repository.findHoldingBookingForExpiry(booking.id, t);

          if (!lockedBooking) return; // Might have been processed concurrently

          seatUpdates = await releaseBookingFlightSeats(lockedBooking, { repository: this.repository, transaction: t, findFlight: this.repository.findFlightForUpdate.bind(this.repository) });

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

        await this._emitSeatUpdates(seatUpdates);
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
        let seatUpdates = [];

        // Gateway calls must happen without database row locks. A payOS
        // payment-link timeout is ambiguous, so query the same orderCode
        // before deciding whether to fail the local attempt.
        const paymentSnapshot = typeof this.repository.findPendingPaymentSnapshotForReconciliation === 'function'
          ? await this.repository.findPendingPaymentSnapshotForReconciliation(candidate.id)
          : null;
        if (process.env.PAYOS_RECONCILIATION_WORKER === 'true'
          && paymentSnapshot?.payment_method === 'payos') continue;
        if (process.env.VNPAY_RECONCILIATION_WORKER === 'true'
          && paymentSnapshot?.payment_method === 'vnpay') continue;
        let payosStatus = null;
        if (paymentSnapshot && paymentSnapshot.payment_method === 'payos') {
          if (paymentSnapshot.status === 'success') {
            payosStatus = {
              status: 'PAID', orderCode: paymentSnapshot.transaction_ref, amount: paymentSnapshot.amount,
            };
          } else {
            if (typeof this.payosReconciliationAvailable === 'function'
              && !this.payosReconciliationAvailable()) continue;
            try {
              payosStatus = await this._lookupPayosStatus(paymentSnapshot.transaction_ref);
            } catch (error) {
              console.warn(`[Cron] payOS status lookup unavailable for booking #${candidate.id}:`, redactString(error.message));
              continue;
            }
          }
        }

        await this.transactionManager.transaction(async (t) => {
          // Match the webhook lock order (Payment -> Booking) when a pending
          // payment exists, reducing deadlock risk during callback races.
          const payment = typeof this.repository.findPaymentForReconciliation === 'function'
            ? await this.repository.findPaymentForReconciliation(candidate.id, t)
            : await this.repository.findPendingPaymentForReconciliation(candidate.id, t);

          const booking = await this.repository.findBookingForReconciliation(candidate.id, t);

          if (!booking || booking.status !== 'pending_payment') return;
          // A pending_payment booking is expected to have one pending Payment.
          // If that invariant is broken, leave the booking untouched for manual
          // investigation instead of risking expiry after a successful charge.
          if (!payment) return;
          if (!booking.hold_expires_at || new Date(booking.hold_expires_at) >= cutoff) return;
          // The expanded lookup includes a successful payOS payment only so a
          // webhook/reconciliation race can finish expiring its booking. Keep
          // the legacy VNPay reconciliation path unchanged.
          if (payment.status === 'success' && payment.payment_method !== 'payos') return;

          if (payment.payment_method === 'payos') {
            const status = payment.status === 'success'
              ? 'PAID'
              : String(payosStatus?.status || '').toUpperCase();

            const sameOrder = String(payosStatus?.orderCode ?? payosStatus?.order_code ?? '')
              === String(payment.transaction_ref);
            const sameAmount = Number(payosStatus?.amount) === Number(payment.amount);

            // PENDING, unknown and malformed responses remain pending for a
            // later reconciliation. They must never release inventory.
            if (!['PAID', 'CANCELLED'].includes(status) || !sameOrder || !sameAmount) return;

            if (status === 'PAID') {
              if (payment.status === 'pending') {
                payment.status = 'success';
                payment.paid_at = payment.paid_at || new Date();
                await this.repository.save(payment, { transaction: t });
              }

              // The hold has expired, so record the charge for manual review
              // but do not confirm the expired booking. Release resources only
              // while transitioning this pending booking once.
              seatUpdates = await releaseBookingFlightSeats(booking, { repository: this.repository, transaction: t, findFlight: this.repository.findFlightForUpdate.bind(this.repository) });
              if (booking.promotion_id) {
                const promo = await this.repository.findPromotionByIdForUpdate(booking.promotion_id, t);
                if (promo && promo.used_count > 0) {
                  await this.repository.decrement(promo, 'used_count', { by: 1, transaction: t });
                }
              }
              booking.status = 'expired';
              await this.repository.save(booking, { transaction: t });
              reconciledCount++;
              return;
            }
          }

          payment.status = 'failed';
          await this.repository.save(payment, { transaction: t });

          seatUpdates = await releaseBookingFlightSeats(booking, { repository: this.repository, transaction: t, findFlight: this.repository.findFlightForUpdate.bind(this.repository) });

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

        await this._emitSeatUpdates(seatUpdates);
      } catch (error) {
          console.error(`[Cron] Error reconciling pending booking #${candidate.id}:`, redactString(error.message));
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
