const { Op } = require('sequelize');

class SequelizeBookingRepository {
  constructor({ Booking, BookingPassenger, BookingSegment, Flight, FareClass, Promotion, User, Payment, Airline, Airport, FlightSeat } = {}) {
    if (![Booking, BookingPassenger, Flight, FareClass, Promotion, User, Payment, Airline, Airport].every(Boolean)) {
      throw new TypeError('Booking repository requires all Booking association models');
    }
    Object.assign(this, { Booking, BookingPassenger, BookingSegment, Flight, FareClass, Promotion, User, Payment, Airline, Airport, FlightSeat });
  }

  findFlight(options) { return this.Flight.findOne(options); }
  findFlightForUpdate(id, transaction) {
    return this.Flight.findOne({ where: { id }, lock: transaction.LOCK.UPDATE, transaction });
  }
  findFareClass(options) { return this.FareClass.findOne(options); }
  findFareClassForFlight(id, flightId, transaction) {
    return this.FareClass.findOne({ where: { id, flight_id: flightId }, lock: transaction.LOCK.UPDATE, transaction });
  }
  countReservedFareSeats(fareClassId, transaction) {
    // Count passengers, not bookings. DISTINCT avoids multiplying passengers by
    // the additional legs joined to their booking. Expiry frees quota only when
    // its status transition and physical seat release commit together.
    const fares = [{ '$booking.fare_class_id$': fareClassId }];
    if (this.BookingSegment) fares.push({ '$booking.itinerarySegments.fare_class_id$': fareClassId });
    return this.BookingPassenger.count({
      distinct: true, col: 'id', transaction,
      where: { [Op.or]: fares },
      include: [{
        model: this.Booking, as: 'booking', required: true, attributes: [],
        where: { status: { [Op.in]: ['holding', 'pending_payment', 'confirmed'] } },
        include: this.BookingSegment ? [{
          model: this.BookingSegment, as: 'itinerarySegments', required: false, attributes: [],
        }] : [],
      }],
    });
  }
  findPromotion(options) { return this.Promotion.findOne(options); }
  findPromotionByCodeForUpdate(code, transaction) {
    return this.Promotion.findOne({ where: { code }, lock: transaction.LOCK.UPDATE, transaction });
  }
  findPromotionByIdForUpdate(id, transaction) {
    return this.Promotion.findOne({ where: { id }, lock: transaction.LOCK.UPDATE, transaction });
  }
  findBooking(options) { return this.Booking.findOne(options); }
  findBookingCode(code, transaction) {
    return this.Booking.findOne({ where: { booking_code: code }, transaction });
  }
  findBookingForCancellation(id, transaction) {
    return this.Booking.findOne({ where: { id }, lock: transaction.LOCK.UPDATE, transaction, include: [{ model: this.BookingPassenger, as: 'passengers' }, ...this._seatAssignmentsInclude(), ...this._itineraryInclude()] });
  }
  findHoldingBookingForExpiry(id, transaction) {
    return this.Booking.findOne({ where: { id, status: 'holding' }, lock: transaction.LOCK.UPDATE, transaction, include: [
      { model: this.BookingPassenger, as: 'passengers' },
      ...this._seatAssignmentsInclude(),
      ...this._itineraryInclude(),
    ] });
  }
  findBookingForReconciliation(id, transaction) {
    return this.Booking.findOne({ where: { id }, include: [{ model: this.BookingPassenger, as: 'passengers' }, ...this._seatAssignmentsInclude(), ...this._itineraryInclude()], lock: transaction.LOCK.UPDATE, transaction });
  }
  findBookingByPk(id, options) { return this.Booking.findByPk(id, options); }
  findBookingSegments(bookingId, transaction) {
    if (!this.BookingSegment) return Promise.resolve([]);
    return this.BookingSegment.findAll({ where: { booking_id: bookingId }, order: [['leg_order', 'ASC']], transaction });
  }
  createBookingSegments(values, options) {
    if (!this.BookingSegment) throw new TypeError('BookingSegment model is required for multi-leg bookings');
    return this.BookingSegment.bulkCreate(values, options);
  }
  _itineraryInclude() {
    if (!this.BookingSegment) return [];
    return [{ model: this.BookingSegment, as: 'itinerarySegments', include: [
      { model: this.Flight, as: 'flight', include: [
        { model: this.Airline, as: 'airline' },
        { model: this.Airport, as: 'departureAirport' },
        { model: this.Airport, as: 'arrivalAirport' },
      ] },
      { model: this.FareClass, as: 'fareClass' },
    ] }];
  }
  _seatAssignmentsInclude() {
    return this.FlightSeat ? [{ model: this.FlightSeat, as: 'seatAssignments', attributes: ['id'], required: false }] : [];
  }
  findBookingDetail(id) {
    return this.Booking.findByPk(id, {
      include: [
        {
          model: this.Flight, as: 'flight', include: [
            { model: this.Airline, as: 'airline', attributes: ['id', 'name', 'iata_code', 'logo_url'] },
            { model: this.Airport, as: 'departureAirport', attributes: ['id', 'name', 'iata_code', 'city', 'country'] },
            { model: this.Airport, as: 'arrivalAirport', attributes: ['id', 'name', 'iata_code', 'city', 'country'] },
          ],
        },
        { model: this.FareClass, as: 'fareClass' },
        { model: this.Promotion, as: 'promotion' },
        { model: this.BookingPassenger, as: 'passengers' },
        ...(this.FlightSeat ? [{ model: this.FlightSeat, as: 'seatAssignments', attributes: ['flight_id', 'seat_no', 'leg_order', 'booking_passenger_id', 'status'] }] : []),
        { model: this.Payment, as: 'payments' },
        { model: this.User, as: 'user', attributes: ['id', 'full_name', 'email', 'phone'] },
        ...this._itineraryInclude(),
      ],
    });
  }
  findBookingByCode(code) {
    return this.Booking.findOne({
      where: { booking_code: code },
      include: [
        { model: this.Flight, as: 'flight', include: [
          { model: this.Airline, as: 'airline' },
          { model: this.Airport, as: 'departureAirport' },
          { model: this.Airport, as: 'arrivalAirport' },
        ] },
        { model: this.FareClass, as: 'fareClass' },
        { model: this.Promotion, as: 'promotion' },
        { model: this.BookingPassenger, as: 'passengers' },
        { model: this.Payment, as: 'payments' },
        ...this._itineraryInclude(),
      ],
    });
  }
  listUserBookings(userId, { status, limit, offset }) {
    const where = { user_id: userId };
    if (status) where.status = status;
    return this.Booking.findAndCountAll({
      distinct: true, where, limit, offset, order: [['created_at', 'DESC']],
      include: [
        { model: this.Flight, as: 'flight', include: [
          { model: this.Airline, as: 'airline' },
          { model: this.Airport, as: 'departureAirport' },
          { model: this.Airport, as: 'arrivalAirport' },
        ] },
        { model: this.FareClass, as: 'fareClass' },
        { model: this.BookingPassenger, as: 'passengers' },
        { model: this.Payment, as: 'payments' },
        ...this._itineraryInclude(),
      ],
    });
  }
  listAllBookings({ status, search, limit, offset }) {
    const where = {};
    if (status) where.status = status;
    if (search) {
      where[Op.or] = [
        { booking_code: { [Op.like]: `%${search}%` } },
        { guest_email: { [Op.like]: `%${search}%` } },
      ];
    }
    return this.Booking.findAndCountAll({
      distinct: true, where, limit, offset, order: [['created_at', 'DESC']],
      include: [
        { model: this.Flight, as: 'flight', include: [
          { model: this.Airline, as: 'airline' },
          { model: this.Airport, as: 'departureAirport' },
          { model: this.Airport, as: 'arrivalAirport' },
        ] },
        { model: this.FareClass, as: 'fareClass' },
        { model: this.BookingPassenger, as: 'passengers' },
        { model: this.Payment, as: 'payments' },
        { model: this.User, as: 'user', attributes: ['id', 'full_name', 'email'] },
        ...this._itineraryInclude(),
      ],
    });
  }
  findBookings(options) { return this.Booking.findAll(options); }
  findExpiredHoldingBookings(now) {
    return this.Booking.findAll({ where: { status: 'holding', hold_expires_at: { [Op.lt]: now } }, include: [{ model: this.BookingPassenger, as: 'passengers' }, ...this._itineraryInclude()] });
  }
  findStalePendingBookings(cutoff) {
    return this.Booking.findAll({ where: { status: 'pending_payment', hold_expires_at: { [Op.lt]: cutoff } }, attributes: ['id'] });
  }
  findAndCountBookings(options) { return this.Booking.findAndCountAll(options); }
  findPayment(options) { return this.Payment.findOne(options); }
  findPendingPaymentForReconciliation(bookingId, transaction) {
    return this.Payment.findOne({ where: { booking_id: bookingId, status: 'pending' }, order: [['created_at', 'DESC']], lock: transaction.LOCK.UPDATE, transaction });
  }
  createBooking(values, options) { return this.Booking.create(values, options); }
  createPassengers(values, options) { return this.BookingPassenger.bulkCreate(values, options); }
  save(instance, options) { return instance.save(options); }
  increment(instance, field, options) { return instance.increment(field, options); }
  decrement(instance, field, options) { return instance.decrement(field, options); }
}

module.exports = { SequelizeBookingRepository };
