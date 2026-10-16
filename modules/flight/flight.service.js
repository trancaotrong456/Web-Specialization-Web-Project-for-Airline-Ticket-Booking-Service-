const { getIO: defaultGetIO } = require('../../sockets');

class FlightService {
  constructor({ repository, getIO = defaultGetIO } = {}) {
    if (!repository) throw new TypeError('A Flight repository is required');
    this.repository = repository;
    this.getIO = getIO;
  }

  _broadcastFlightUpdate(flightId, data) {
    try {
      const io = this.getIO();
      io.to(`flight_${flightId}`).emit('flight_updated', data);
    } catch (_err) {
      // Ignore if socket not initialized.
    }
  }

  async checkAndEmitSeatWarning(flightId) {
    try {
      const flight = await this.repository.findSeatSnapshot(flightId);
      if (!flight) return;
      const threshold = Number.parseInt(process.env.SEAT_WARNING_THRESHOLD || '5', 10);
      const availableSeats = Number(flight.available_seats);
      if (!Number.isFinite(threshold) || availableSeats > threshold) return;
      const io = this.getIO();
      io.to(`flight_${flight.id}`).emit('seat-warning', {
        flightId: flight.id,
        availableSeats,
        message: `Chỉ còn ${availableSeats} ghế!`,
      });
    } catch (_err) {
      // Ignore if socket.io is not initialized (for example, unit tests).
    }
  }

  async searchFlights({ departure_airport_id, arrival_airport_id, airline_id, departure_date, min_seats = 1, page = 1, limit = 20 }) {
    let dateStart;
    let dateEnd;
    if (departure_date) {
      const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
      dateStart = new Date(new Date(departure_date).getTime() - VN_OFFSET_MS);
      dateEnd = new Date(dateStart.getTime() + 24 * 60 * 60 * 1000);
    }
    const { count, rows } = await this.repository.searchPage({
      departure_airport_id, arrival_airport_id, airline_id, min_seats, dateStart, dateEnd, page, limit,
    });
    return { total: count, page, limit, data: rows };
  }

  async getFlightById(id) {
    const flight = await this.repository.findDetail(id);
    if (!flight) { const error = new Error('Flight not found'); error.statusCode = 404; throw error; }
    return flight;
  }

  async createFlight(data) {
    if (!data || typeof data !== 'object') {
      const error = new Error('Dữ liệu chuyến bay không hợp lệ'); error.statusCode = 400; throw error;
    }
    if (Object.prototype.hasOwnProperty.call(data, 'available_seats')) {
      const error = new Error('available_seats do hệ thống quản lý, không thể thiết lập trực tiếp'); error.statusCode = 400; throw error;
    }
    const systemFields = ['id', 'created_at', 'updated_at', 'createdAt', 'updatedAt'];
    for (const field of systemFields) {
      if (Object.prototype.hasOwnProperty.call(data, field)) {
        const error = new Error(`Không được phép truyền trường hệ thống: ${field}`); error.statusCode = 400; throw error;
      }
    }
    if (data.departure_airport_id && data.arrival_airport_id && Number(data.departure_airport_id) === Number(data.arrival_airport_id)) {
      const error = new Error('Sân bay đi và sân bay đến không được trùng nhau'); error.statusCode = 400; throw error;
    }
    if (data.departure_time && data.arrival_time && new Date(data.arrival_time) <= new Date(data.departure_time)) {
      const error = new Error('Thời gian đến phải sau thời gian khởi hành'); error.statusCode = 400; throw error;
    }
    if (data.airline_id) {
      const airline = await this.repository.findAirlineById(data.airline_id);
      if (!airline) { const error = new Error('Hãng hàng không không tồn tại'); error.statusCode = 404; throw error; }
    }
    if (data.departure_airport_id) {
      const depAirport = await this.repository.findAirportById(data.departure_airport_id);
      if (!depAirport) { const error = new Error('Sân bay đi không tồn tại'); error.statusCode = 404; throw error; }
    }
    if (data.arrival_airport_id) {
      const arrAirport = await this.repository.findAirportById(data.arrival_airport_id);
      if (!arrAirport) { const error = new Error('Sân bay đến không tồn tại'); error.statusCode = 404; throw error; }
    }
    const flight = await this.repository.create({
      airline_id: data.airline_id,
      departure_airport_id: data.departure_airport_id,
      arrival_airport_id: data.arrival_airport_id,
      departure_time: data.departure_time,
      arrival_time: data.arrival_time,
      total_seats: data.total_seats,
      status: data.status || 'scheduled',
      available_seats: data.total_seats,
    });
    return this.getFlightById(flight.id);
  }

  async updateFlight(flightId, data) {
    if (!data || typeof data !== 'object') {
      const error = new Error('Dữ liệu cập nhật không hợp lệ'); error.statusCode = 400; throw error;
    }
    const payloadKeys = Object.keys(data);
    if (payloadKeys.length === 0) {
      const error = new Error('Vui lòng cung cấp ít nhất một trường cần cập nhật'); error.statusCode = 400; throw error;
    }
    const ALLOWED_FIELDS = ['departure_time', 'arrival_time', 'status'];
    const disallowedFields = payloadKeys.filter((key) => !ALLOWED_FIELDS.includes(key));
    if (disallowedFields.length > 0) {
      const error = new Error(`Không được phép chỉnh sửa các trường: ${disallowedFields.join(', ')}`); error.statusCode = 400; throw error;
    }
    const flight = await this.repository.findById(flightId);
    if (!flight) { const error = new Error('Flight not found'); error.statusCode = 404; throw error; }
    const newDep = data.departure_time !== undefined ? new Date(data.departure_time) : new Date(flight.departure_time);
    const newArr = data.arrival_time !== undefined ? new Date(data.arrival_time) : new Date(flight.arrival_time);
    if (Number.isNaN(newDep.getTime()) || Number.isNaN(newArr.getTime())) {
      const error = new Error('Thời gian bay không hợp lệ'); error.statusCode = 400; throw error;
    }
    if (newArr <= newDep) {
      const error = new Error('Thời gian đến phải sau thời gian khởi hành'); error.statusCode = 400; throw error;
    }
    if (data.status !== undefined && !['scheduled', 'cancelled', 'completed'].includes(data.status)) {
      const error = new Error('Trạng thái chuyến bay không hợp lệ'); error.statusCode = 400; throw error;
    }
    const safeUpdate = {};
    if (data.departure_time !== undefined) safeUpdate.departure_time = data.departure_time;
    if (data.arrival_time !== undefined) safeUpdate.arrival_time = data.arrival_time;
    if (data.status !== undefined) safeUpdate.status = data.status;
    await this.repository.update(flight, safeUpdate);
    const updated = await this.getFlightById(flightId);
    this._broadcastFlightUpdate(flightId, {
      flight_id: updated.id,
      status: updated.status,
      available_seats: updated.available_seats,
      departure_time: updated.departure_time,
      arrival_time: updated.arrival_time,
    });
    return updated;
  }

  async cancelFlight(flightId) { return this.updateFlight(flightId, { status: 'cancelled' }); }

  async deleteFlight(flightId) {
    return this.repository.transaction(async (transaction) => {
      const flight = await this.repository.findById(flightId, { lock: transaction.LOCK.UPDATE, transaction });
      if (!flight) { const error = new Error('Flight not found'); error.statusCode = 404; throw error; }
      const bookingCount = await this.repository.countBookings(flightId, transaction);
      if (bookingCount > 0) {
        const error = new Error('Không thể xóa chuyến bay đã có lịch sử đặt vé. Vui lòng dùng chức năng hủy chuyến bay thay thế.');
        error.statusCode = 409;
        throw error;
      }
      await this.repository.deleteFareClasses(flightId, transaction);
      await this.repository.deleteFlight(flight, transaction);
      return { message: 'Flight deleted successfully' };
    });
  }

  async getAllFlights({ page = 1, limit = 20, status }) {
    const { count, rows } = await this.repository.findAdminPage({ page, limit, status });
    return { total: count, page, limit, data: rows };
  }
}

module.exports = FlightService;
