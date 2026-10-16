'use strict';
const { Op } = require('sequelize');

class SequelizeSeatSelectionRepository {
  constructor({ SeatMapTemplate, FlightSeatMap, FlightSeat, Flight, FareClass } = {}) {
    if (![SeatMapTemplate, FlightSeatMap, FlightSeat, Flight, FareClass].every(Boolean)) throw new TypeError('Seat selection models are required');
    Object.assign(this, { SeatMapTemplate, FlightSeatMap, FlightSeat, Flight, FareClass });
  }
  listCurrentTemplates() { return this.SeatMapTemplate.findAll({ where: { is_current: true }, order: [['name', 'ASC']] }); }
  findTemplate(id, options = {}) { return this.SeatMapTemplate.findByPk(id, options); }
  createTemplate(values, options) { return this.SeatMapTemplate.create(values, options); }
  findLatestTemplate(name, transaction) { return this.SeatMapTemplate.findOne({ where: { name }, order: [['version', 'DESC']], transaction, lock: transaction?.LOCK?.UPDATE }); }
  findFlight(id, transaction) { return this.Flight.findByPk(id, { transaction, ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}) }); }
  findFlightFareClasses(flightId, ids, transaction) { return this.FareClass.findAll({ where: { flight_id: flightId, id: { [Op.in]: ids } }, transaction }); }
  findFlightMap(flightId, transaction) { return this.FlightSeatMap.findOne({ where: { flight_id: flightId }, transaction, ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}) }); }
  listFlightSeats(flightId, transaction, lock = false) { return this.FlightSeat.findAll({ where: { flight_id: flightId }, order: [['seat_no', 'ASC']], transaction, ...(lock && transaction ? { lock: transaction.LOCK.UPDATE } : {}) }); }
  createFlightMap(values, transaction) { return this.FlightSeatMap.create(values, { transaction }); }
  updateFlightMap(map, values, transaction) { return map.update(values, { transaction }); }
  deleteFlightSeats(flightId, transaction) { return this.FlightSeat.destroy({ where: { flight_id: flightId }, transaction }); }
  bulkCreateFlightSeats(values, transaction) { return this.FlightSeat.bulkCreate(values, { transaction }); }
  updateTemplate(template, values, transaction) { return template.update(values, { transaction }); }
  deleteTemplate(template, transaction) { return template.destroy({ transaction }); }
  findTemplateSnapshots(templateId) { return this.FlightSeatMap.count({ where: { template_id: templateId } }); }
  findFlightSeatForUpdate(flightId, seatNo, transaction) { return this.FlightSeat.findOne({ where: { flight_id: flightId, seat_no: seatNo }, transaction, lock: transaction.LOCK.UPDATE }); }
  reserveFlightSeat(seat, values, transaction) { return seat.update(values, { transaction }); }
  findBookingSeats(bookingId, transaction, lock = false) { return this.FlightSeat.findAll({ where: { booking_id: bookingId, status: { [Op.in]: ['held', 'booked'] } }, order: [['flight_id', 'ASC'], ['seat_no', 'ASC']], transaction, ...(lock ? { lock: transaction.LOCK.UPDATE } : {}) }); }
}

module.exports = SequelizeSeatSelectionRepository;
