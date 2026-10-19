class SequelizeFareClassRepository {
  constructor({ FareClass, Flight, Booking } = {}) {
    if (!FareClass || !Flight || !Booking) throw new TypeError('FareClass, Flight and Booking models are required');
    this.FareClass = FareClass;
    this.Flight = Flight;
    this.Booking = Booking;
  }

  findByFlight(flight_id) {
    return this.FareClass.findAll({ where: { flight_id }, order: [['price', 'ASC']] });
  }
  findById(id) {
    return this.FareClass.findByPk(id, { include: [{ model: this.Flight, as: 'flight' }] });
  }
  findFlightById(id) { return this.Flight.findByPk(id); }
  create(data) { return this.FareClass.create(data); }
  update(fareClass, data) { return fareClass.update(data); }
  countBookingsByFareClassId(id) { return this.Booking.count({ where: { fare_class_id: id } }); }
  delete(fareClass) { return fareClass.destroy(); }
}

module.exports = { SequelizeFareClassRepository };
