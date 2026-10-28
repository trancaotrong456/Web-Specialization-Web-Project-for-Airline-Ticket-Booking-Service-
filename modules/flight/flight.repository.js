const Sequelize = require('sequelize');

class SequelizeFlightRepository {
  constructor({ sequelize, Flight, Airline, Airport, FareClass, Booking, BookingSegment, FlightStatusHistory, User, Op } = {}) {
    if (!sequelize || !Flight || !Airline || !Airport || !FareClass || !Booking || !Op) {
      throw new TypeError('Flight repository requires Sequelize models and operators');
    }
    Object.assign(this, { sequelize, Flight, Airline, Airport, FareClass, Booking, BookingSegment, FlightStatusHistory, User, Op });
  }

  searchPage({
    departure_airport_id, arrival_airport_id, airline_id, min_seats, dateStart, dateEnd,
    min_price, max_price, fare_class, departure_time_from, departure_time_to,
    arrival_time_from, arrival_time_to, min_duration_minutes, max_duration_minutes,
    sort_by = 'departure_earliest', page, limit, matchingFlightIds,
  }) {
    const where = { status: 'scheduled' };
    if (matchingFlightIds && matchingFlightIds.length > 0) {
      where.id = { [this.Op.in]: matchingFlightIds };
    }
    const fareWhere = {};
    const and = [];
    if (departure_airport_id) where.departure_airport_id = departure_airport_id;
    if (arrival_airport_id) where.arrival_airport_id = arrival_airport_id;
    if (airline_id) where.airline_id = airline_id;
    if (min_seats) where.available_seats = { [this.Op.gte]: Number(min_seats) };
    if (dateStart) where.departure_time = { [this.Op.gte]: dateStart, [this.Op.lt]: dateEnd };
    if (min_seats) {
      // Match BookingRepository.countReservedFareSeats: count distinct passengers
      // on active bookings, including every itinerary segment for this fare.
      const segmentJoin = this.BookingSegment
        ? 'LEFT JOIN `booking_segments` AS `reserved_segment` ON `reserved_segment`.`booking_id` = `reserved_booking`.`id`'
        : '';
      const segmentFare = this.BookingSegment
        ? ' OR `reserved_segment`.`fare_class_id` = `fareClasses`.`id`'
        : '';
      const remainingQuota = Sequelize.literal([
        '(`fareClasses`.`seat_quota` - (',
        'SELECT COUNT(DISTINCT `reserved_passenger`.`id`)',
        'FROM `booking_passengers` AS `reserved_passenger`',
        'JOIN `bookings` AS `reserved_booking` ON `reserved_booking`.`id` = `reserved_passenger`.`booking_id`',
        segmentJoin,
        "WHERE `reserved_booking`.`status` IN ('holding', 'pending_payment', 'confirmed')",
        `AND (\`reserved_booking\`.\`fare_class_id\` = \`fareClasses\`.\`id\`${segmentFare})`,
        '))',
      ].join(' '));
      fareWhere[this.Op.or] = [
        { seat_quota: { [this.Op.is]: null } },
        Sequelize.where(remainingQuota, '>=', Number(min_seats)),
      ];
    }
    if (min_price !== undefined || max_price !== undefined) {
      fareWhere.price = {};
      if (min_price !== undefined) fareWhere.price[this.Op.gte] = min_price;
      if (max_price !== undefined) fareWhere.price[this.Op.lte] = max_price;
    }
    if (fare_class) fareWhere.class_name = fare_class;

    const addTimeFilter = (column, from, to) => {
      if (!from && !to) return;
      const localTime = Sequelize.fn('TIME', Sequelize.literal('DATE_ADD(`' + column + '`, INTERVAL 7 HOUR)'));
      const range = {};
      if (from && to) range[this.Op.between] = [from, to];
      else if (from) range[this.Op.gte] = from;
      else range[this.Op.lte] = to;
      and.push(Sequelize.where(localTime, range));
    };
    addTimeFilter('departure_time', departure_time_from, departure_time_to);
    addTimeFilter('arrival_time', arrival_time_from, arrival_time_to);

    const duration = Sequelize.fn(
      'TIMESTAMPDIFF', Sequelize.literal('MINUTE'),
      Sequelize.col('departure_time'), Sequelize.col('arrival_time'),
    );
    if (min_duration_minutes !== undefined) and.push(Sequelize.where(duration, { [this.Op.gte]: Number(min_duration_minutes) }));
    if (max_duration_minutes !== undefined) and.push(Sequelize.where(duration, { [this.Op.lte]: Number(max_duration_minutes) }));
    if (and.length) where[this.Op.and] = and;

    const priceOrder = [[{ model: this.FareClass, as: 'fareClasses' }, 'price', sort_by === 'price_high' ? 'DESC' : 'ASC']];
    const durationOrder = [[duration, 'ASC']];
    const orders = {
      departure_earliest: [['departure_time', 'ASC']],
      departure_latest: [['departure_time', 'DESC']],
      arrival_earliest: [['arrival_time', 'ASC']],
      duration_shortest: durationOrder,
      price_low: priceOrder,
      price_high: priceOrder,
    };
    return this.Flight.findAndCountAll({
      where, distinct: true, limit: Number(limit), offset: Number((page - 1) * limit),
      order: orders[sort_by] || orders.departure_earliest,
      include: [
        { model: this.Airline, as: 'airline', attributes: ['id', 'name', 'iata_code', 'logo_url'] },
        { model: this.Airport, as: 'departureAirport', attributes: ['id', 'name', 'iata_code', 'city', 'country'] },
        { model: this.Airport, as: 'arrivalAirport', attributes: ['id', 'name', 'iata_code', 'city', 'country'] },
        { model: this.FareClass, as: 'fareClasses', attributes: ['id', 'class_name', 'price', 'seat_quota'], where: fareWhere, required: true },
      ],
    });
  }

  findDetail(id) {
    return this.Flight.findByPk(id, { include: [
      { model: this.Airline, as: 'airline' },
      { model: this.Airport, as: 'departureAirport' },
      { model: this.Airport, as: 'arrivalAirport' },
      { model: this.FareClass, as: 'fareClasses', attributes: ['id', 'class_name', 'price', 'seat_quota'] },
    ] });
  }

  findById(id, options) {
    return options === undefined ? this.Flight.findByPk(id) : this.Flight.findByPk(id, options);
  }
  findFlightForStatusUpdate(id, transaction) {
    return this.Flight.findByPk(id, { lock: transaction.LOCK.UPDATE, transaction });
  }
  findStatusHistory(flightId) {
    return this.FlightStatusHistory.findAll({
      where: { flight_id: flightId },
      order: [['created_at', 'DESC'], ['id', 'DESC']],
      ...(this.User ? { include: [{ model: this.User, as: 'actor', attributes: ['id', 'full_name'] }] } : {}),
    });
  }
  createStatusHistory(values, transaction) {
    return this.FlightStatusHistory.create(values, { transaction });
  }
  async findStatusNotificationRecipients(flightId, transaction) {
    const activeStatuses = ['holding', 'pending_payment', 'confirmed'];
    const [legacyBookings, itinerarySegments] = await Promise.all([
      this.Booking.findAll({
        where: { flight_id: flightId, status: activeStatuses },
        attributes: ['id', 'user_id', 'guest_email', 'booking_code'],
        transaction,
      }),
      this.BookingSegment ? this.BookingSegment.findAll({
        where: { flight_id: flightId },
        attributes: ['booking_id'],
        include: [{
          model: this.Booking,
          as: 'booking',
          where: { status: activeStatuses },
          attributes: ['id', 'user_id', 'guest_email', 'booking_code'],
          required: true,
        }],
        transaction,
      }) : [],
    ]);
    const bookings = [...legacyBookings, ...itinerarySegments.map((segment) => segment.booking)];
    const unique = new Map();
    for (const booking of bookings) {
      if (!booking?.id) continue;
      const email = typeof booking.guest_email === 'string' ? booking.guest_email.trim().toLowerCase() : null;
      if (booking.user_id || email) unique.set(String(booking.id), {
        bookingId: booking.id, userId: booking.user_id || null, email: booking.user_id ? null : email,
        flightCode: String(flightId),
      });
    }
    return [...unique.values()];
  }
  findSeatSnapshot(id) { return this.Flight.findByPk(id, { attributes: ['id', 'available_seats'] }); }
  findAirlineById(id) { return this.Airline.findByPk(id); }
  findAirportById(id) { return this.Airport.findByPk(id); }
  create(data) { return this.Flight.create(data); }
  update(flight, data, options) { return flight.update(data, options); }
  transaction(work) { return this.sequelize.transaction(work); }
  countBookings(flightId, transaction) { return this.Booking.count({ where: { flight_id: flightId }, transaction }); }
  deleteFareClasses(flightId, transaction) { return this.FareClass.destroy({ where: { flight_id: flightId }, transaction }); }
  deleteFlight(flight, transaction) { return flight.destroy({ transaction }); }

  findAdminPage({ page, limit, status, date_from, date_to }) {
    const where = {};
    if (status) where.status = status;
    if (date_from || date_to) {
      where.departure_time = {};
      if (date_from) where.departure_time[this.Op.gte] = new Date(date_from);
      if (date_to) where.departure_time[this.Op.lte] = new Date(date_to);
    }
    return this.Flight.findAndCountAll({
      where, distinct: true, limit: Number(limit), offset: Number((page - 1) * limit),
      order: [['departure_time', 'ASC']],
      include: [
        { model: this.Airline, as: 'airline', attributes: ['id', 'name', 'iata_code'] },
        { model: this.Airport, as: 'departureAirport', attributes: ['id', 'name', 'iata_code', 'city'] },
        { model: this.Airport, as: 'arrivalAirport', attributes: ['id', 'name', 'iata_code', 'city'] },
        { model: this.FareClass, as: 'fareClasses', attributes: ['id', 'class_name', 'price'] },
      ],
    });
  }

  /**
   * Lấy danh sách chuyến bay trong khoảng thời gian để hiển thị dạng lịch (calendar).
   * Không phân trang — frontend cần toàn bộ dữ liệu trong tuần/tháng để render.
   *
   * @param {Date} dateStart - Đầu khoảng thời gian (inclusive)
   * @param {Date} dateEnd   - Cuối khoảng thời gian (exclusive)
   * @param {string|null} status - Lọc theo trạng thái (tuỳ chọn)
   * @param {number} limit   - Giới hạn tối đa bản ghi trả về (bảo vệ tải hệ thống)
   * @returns {Promise<import('sequelize').Model[]>}
   */
  findCalendar({ dateStart, dateEnd, status, limit = 500 }) {
    const where = {
      departure_time: { [this.Op.gte]: dateStart, [this.Op.lt]: dateEnd },
    };
    if (status) where.status = status;
    return this.Flight.findAll({
      where,
      limit: Number(limit),
      order: [['departure_time', 'ASC']],
      include: [
        { model: this.Airline, as: 'airline', attributes: ['id', 'name', 'iata_code', 'logo_url'] },
        { model: this.Airport, as: 'departureAirport', attributes: ['id', 'name', 'iata_code', 'city'] },
        { model: this.Airport, as: 'arrivalAirport', attributes: ['id', 'name', 'iata_code', 'city'] },
        { model: this.FareClass, as: 'fareClasses', attributes: ['id', 'class_name', 'price'] },
      ],
    });
  }
}

module.exports = { SequelizeFlightRepository };
