class SequelizeFlightRepository {
  constructor({ sequelize, Flight, Airline, Airport, FareClass, Booking, FlightStatusHistory, User, Op } = {}) {
    if (!sequelize || !Flight || !Airline || !Airport || !FareClass || !Booking || !Op) {
      throw new TypeError('Flight repository requires Sequelize models and operators');
    }
    Object.assign(this, { sequelize, Flight, Airline, Airport, FareClass, Booking, FlightStatusHistory, User, Op });
  }

  searchPage({ departure_airport_id, arrival_airport_id, airline_id, min_seats, dateStart, dateEnd, page, limit }) {
    const where = { status: 'scheduled' };
    if (departure_airport_id) where.departure_airport_id = departure_airport_id;
    if (arrival_airport_id) where.arrival_airport_id = arrival_airport_id;
    if (airline_id) where.airline_id = airline_id;
    if (min_seats) where.available_seats = { [this.Op.gte]: Number(min_seats) };
    if (dateStart) where.departure_time = { [this.Op.gte]: dateStart, [this.Op.lt]: dateEnd };
    return this.Flight.findAndCountAll({
      where, distinct: true, limit: Number(limit), offset: Number((page - 1) * limit),
      order: [['departure_time', 'ASC']],
      include: [
        { model: this.Airline, as: 'airline', attributes: ['id', 'name', 'iata_code', 'logo_url'] },
        { model: this.Airport, as: 'departureAirport', attributes: ['id', 'name', 'iata_code', 'city', 'country'] },
        { model: this.Airport, as: 'arrivalAirport', attributes: ['id', 'name', 'iata_code', 'city', 'country'] },
        { model: this.FareClass, as: 'fareClasses', attributes: ['id', 'class_name', 'price', 'seat_quota'] },
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
  findSeatSnapshot(id) { return this.Flight.findByPk(id, { attributes: ['id', 'available_seats'] }); }
  findAirlineById(id) { return this.Airline.findByPk(id); }
  findAirportById(id) { return this.Airport.findByPk(id); }
  create(data) { return this.Flight.create(data); }
  update(flight, data, options) { return flight.update(data, options); }
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
