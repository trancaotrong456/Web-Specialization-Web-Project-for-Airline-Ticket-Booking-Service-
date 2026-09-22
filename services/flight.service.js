const { Op } = require('sequelize');
const { sequelize, Flight, Airline, Airport, FareClass, Booking } = require('../models');
const { getIO } = require('../sockets');

class FlightService {
  /**
   * Helper to broadcast flight update
   */
  _broadcastFlightUpdate(flightId, data) {
    try {
      const io = getIO();
      io.to(`flight_${flightId}`).emit('flight_updated', data);
    } catch (_err) {
      // Ignore if socket not initialized
    }
  }

  /**
   * Notify clients subscribed to a flight when its remaining seats are low.
   * The flight is read after the seat-change transaction has committed so the
   * warning always reflects the current persisted value.
   */
  async checkAndEmitSeatWarning(flightId) {
    try {
      const flight = await Flight.findByPk(flightId, { attributes: ['id', 'available_seats'] });
      if (!flight) return;

      const threshold = Number.parseInt(process.env.SEAT_WARNING_THRESHOLD || '5', 10);
      const availableSeats = Number(flight.available_seats);
      if (!Number.isFinite(threshold) || availableSeats > threshold) return;

      const io = getIO();
      io.to(`flight_${flight.id}`).emit('seat-warning', {
        flightId: flight.id,
        availableSeats,
        message: `Chỉ còn ${availableSeats} ghế!`,
      });
    } catch (_err) {
      // Ignore if socket.io is not initialized (for example, unit tests).
    }
  }

  /**
   * Search flights
   */
  async searchFlights({ departure_airport_id, arrival_airport_id, departure_date, min_seats = 1, page = 1, limit = 20 }) {
    const offset = (page - 1) * limit;
    const where = { status: 'scheduled' };

    if (departure_airport_id) where.departure_airport_id = departure_airport_id;
    if (arrival_airport_id) where.arrival_airport_id = arrival_airport_id;
    if (min_seats) where.available_seats = { [Op.gte]: Number(min_seats) };

    if (departure_date) {
      const dateStart = new Date(departure_date);
      const dateEnd = new Date(departure_date);
      dateEnd.setDate(dateEnd.getDate() + 1);
      where.departure_time = { [Op.gte]: dateStart, [Op.lt]: dateEnd };
    }

    const { count, rows } = await Flight.findAndCountAll({
      where,
      limit: Number(limit),
      offset: Number(offset),
      order: [['departure_time', 'ASC']],
      include: [
        { model: Airline, as: 'airline', attributes: ['id', 'name', 'iata_code', 'logo_url'] },
        { model: Airport, as: 'departureAirport', attributes: ['id', 'name', 'iata_code', 'city', 'country'] },
        { model: Airport, as: 'arrivalAirport', attributes: ['id', 'name', 'iata_code', 'city', 'country'] },
        { model: FareClass, as: 'fareClasses', attributes: ['id', 'class_name', 'price', 'seat_quota'] },
      ],
    });

    return { total: count, page, limit, data: rows };
  }

  /**
   * Get flight details with fare classes
   */
  async getFlightById(id) {
    const flight = await Flight.findByPk(id, {
      include: [
        { model: Airline, as: 'airline' },
        { model: Airport, as: 'departureAirport' },
        { model: Airport, as: 'arrivalAirport' },
        { model: FareClass, as: 'fareClasses', attributes: ['id', 'class_name', 'price', 'seat_quota'] },
      ],
    });

    if (!flight) {
      const error = new Error('Flight not found');
      error.statusCode = 404;
      throw error;
    }

    return flight;
  }

  /**
   * Create a new flight (Admin)
   */
  async createFlight(data) {
    const flight = await Flight.create({
      ...data,
      available_seats: data.total_seats,
    });

    return this.getFlightById(flight.id);
  }

  /**
   * Update flight info (Admin/Staff)
   */
  async updateFlight(flightId, data) {
    const flight = await Flight.findByPk(flightId);
    if (!flight) {
      const error = new Error('Flight not found');
      error.statusCode = 404;
      throw error;
    }

    await flight.update(data);
    const updated = await this.getFlightById(flightId);

    // Broadcast update via WebSocket
    this._broadcastFlightUpdate(flightId, {
      flight_id: updated.id,
      status: updated.status,
      available_seats: updated.available_seats,
      departure_time: updated.departure_time,
      arrival_time: updated.arrival_time,
    });

    if (Object.prototype.hasOwnProperty.call(data, 'available_seats')) {
      await this.checkAndEmitSeatWarning(flightId);
    }

    return updated;
  }

  /**
   * Cancel flight and release all seats to confirmed bookings? 
   * (Simple version: mark as cancelled via updateFlight)
   */
  async cancelFlight(flightId) {
    return this.updateFlight(flightId, { status: 'cancelled' });
  }

  /**
   * Permanently delete a flight only when it has never had a booking.
   * Fare classes are removed in the same transaction before the flight to be
   * safe on databases that do not have the migration's ON DELETE CASCADE.
   */
  async deleteFlight(flightId) {
    return sequelize.transaction(async (transaction) => {
      const flight = await Flight.findByPk(flightId, {
        lock: transaction.LOCK.UPDATE,
        transaction,
      });

      if (!flight) {
        const error = new Error('Flight not found');
        error.statusCode = 404;
        throw error;
      }

      const bookingCount = await Booking.count({
        where: { flight_id: flightId },
        transaction,
      });

      if (bookingCount > 0) {
        const error = new Error('Không thể xóa chuyến bay đã có lịch sử đặt vé. Vui lòng dùng chức năng hủy chuyến bay thay thế.');
        error.statusCode = 409;
        throw error;
      }

      await FareClass.destroy({ where: { flight_id: flightId }, transaction });
      await flight.destroy({ transaction });
      return { message: 'Flight deleted successfully' };
    });
  }

  /**
   * List all flights with pagination (Admin)
   */
  async getAllFlights({ page = 1, limit = 20, status }) {
    const offset = (page - 1) * limit;
    const where = {};
    if (status) where.status = status;

    const { count, rows } = await Flight.findAndCountAll({
      where,
      limit: Number(limit),
      offset: Number(offset),
      order: [['departure_time', 'ASC']],
      include: [
        { model: Airline, as: 'airline', attributes: ['id', 'name', 'iata_code'] },
        { model: Airport, as: 'departureAirport', attributes: ['id', 'name', 'iata_code', 'city'] },
        { model: Airport, as: 'arrivalAirport', attributes: ['id', 'name', 'iata_code', 'city'] },
        { model: FareClass, as: 'fareClasses', attributes: ['id', 'class_name', 'price'] },
      ],
    });

    return { total: count, page, limit, data: rows };
  }
}

module.exports = new FlightService();
