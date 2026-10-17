const Sequelize = require('sequelize');

class SequelizeFlightRepository {
  constructor({ sequelize, Flight, Airline, Airport, FareClass, Booking, Op } = {}) {
    if (!sequelize || !Flight || !Airline || !Airport || !FareClass || !Booking || !Op) {
      throw new TypeError('Flight repository requires Sequelize models and operators');
    }
    Object.assign(this, { sequelize, Flight, Airline, Airport, FareClass, Booking, Op });
  }

  searchPage({
    departure_airport_id, arrival_airport_id, airline_id, min_seats, dateStart, dateEnd,
    min_price, max_price, fare_class, departure_time_from, departure_time_to,
    arrival_time_from, arrival_time_to, min_duration_minutes, max_duration_minutes,
    sort_by = 'departure_earliest', page, limit,
  }) {
    const where = { status: 'scheduled' };
    const fareWhere = {};
    const and = [];
    if (departure_airport_id) where.departure_airport_id = departure_airport_id;
    if (arrival_airport_id) where.arrival_airport_id = arrival_airport_id;
    if (airline_id) where.airline_id = airline_id;
    if (min_seats) where.available_seats = { [this.Op.gte]: Number(min_seats) };
    if (dateStart) where.departure_time = { [this.Op.gte]: dateStart, [this.Op.lt]: dateEnd };
    if (min_seats) {
      fareWhere[this.Op.or] = [
        { seat_quota: { [this.Op.is]: null } },
        { seat_quota: { [this.Op.gte]: Number(min_seats) } },
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
  findSeatSnapshot(id) { return this.Flight.findByPk(id, { attributes: ['id', 'available_seats'] }); }
  findAirlineById(id) { return this.Airline.findByPk(id); }
  findAirportById(id) { return this.Airport.findByPk(id); }
  create(data) { return this.Flight.create(data); }
  update(flight, data) { return flight.update(data); }
  transaction(work) { return this.sequelize.transaction(work); }
  countBookings(flightId, transaction) { return this.Booking.count({ where: { flight_id: flightId }, transaction }); }
  deleteFareClasses(flightId, transaction) { return this.FareClass.destroy({ where: { flight_id: flightId }, transaction }); }
  deleteFlight(flight, transaction) { return flight.destroy({ transaction }); }

  findAdminPage({ page, limit, status }) {
    const where = {};
    if (status) where.status = status;
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
}

module.exports = { SequelizeFlightRepository };
