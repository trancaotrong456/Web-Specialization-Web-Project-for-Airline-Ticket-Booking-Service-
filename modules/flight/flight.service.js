const { getIO: defaultGetIO } = require('../../sockets');

const FLIGHT_STATUSES = ['scheduled', 'delayed', 'boarding', 'departed', 'arrived', 'cancelled', 'completed'];
const ALLOWED_TRANSITIONS = {
  scheduled: ['scheduled', 'delayed', 'boarding', 'cancelled'],
  delayed: ['delayed', 'boarding', 'cancelled'],
  boarding: ['boarding', 'departed', 'cancelled'],
  departed: ['departed', 'arrived'],
  arrived: ['arrived'],
  cancelled: ['cancelled'],
  completed: ['completed'],
};

function statusError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function statusDate(value, field, current) {
  if (value === undefined) return current ? new Date(current) : null;
  if (value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw statusError(`${field} không hợp lệ`);
  return date;
}

function sameDate(left, right) {
  return (left == null && right == null) || (left != null && right != null && new Date(left).getTime() === new Date(right).getTime());
}

class FlightService {
  constructor({ repository, getIO = defaultGetIO, flightStatusNotifier } = {}) {
    if (!repository) throw new TypeError('A Flight repository is required');
    this.repository = repository;
    this.getIO = getIO;
    this.flightStatusNotifier = flightStatusNotifier;
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

  async searchFlights({
    departure_airport_id, arrival_airport_id, airline_id, departure_date, min_seats = 1, page = 1, limit = 20,
    min_price, max_price, fare_class, departure_time_from, departure_time_to,
    arrival_time_from, arrival_time_to, min_duration_minutes, max_duration_minutes,
    sort_by = 'departure_earliest',
  }) {
    let dateStart;
    let dateEnd;
    if (departure_date) {
      const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
      dateStart = new Date(new Date(departure_date).getTime() - VN_OFFSET_MS);
      dateEnd = new Date(dateStart.getTime() + 24 * 60 * 60 * 1000);
    }
    const { count, rows } = await this.repository.searchPage({
      departure_airport_id, arrival_airport_id, airline_id, min_seats, dateStart, dateEnd,
      // Giữ chuỗi thập phân để MySQL so sánh đúng với cột DECIMAL(12,2).
      min_price,
      max_price,
      fare_class: fare_class?.trim(), departure_time_from, departure_time_to,
      arrival_time_from, arrival_time_to,
      min_duration_minutes: min_duration_minutes === undefined ? undefined : Number(min_duration_minutes),
      max_duration_minutes: max_duration_minutes === undefined ? undefined : Number(max_duration_minutes),
      sort_by, page, limit,
    });
    return { total: count, page, limit, data: rows };
  }

  async getFlightById(id) {
    const flight = await this.repository.findDetail(id);
    if (!flight) { const error = new Error('Flight not found'); error.statusCode = 404; throw error; }
    return flight;
  }

  async getFlightStatus(id) {
    const flight = await this.getFlightById(id);
    const history = this.repository.findStatusHistory ? await this.repository.findStatusHistory(id) : [];
    return { flight, history };
  }

  async updateFlightStatus(flightId, data = {}) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw statusError('Dữ liệu trạng thái chuyến bay không hợp lệ');
    if (data.status !== undefined && !FLIGHT_STATUSES.includes(data.status)) throw statusError('Trạng thái chuyến bay không hợp lệ');

    const updated = await this.repository.transaction(async (transaction) => {
      const flight = await this.repository.findFlightForStatusUpdate(flightId, transaction);
      if (!flight) throw statusError('Flight not found', 404);
      const oldStatus = flight.status;
      const nextStatus = data.status || oldStatus;
      if (!ALLOWED_TRANSITIONS[oldStatus]?.includes(nextStatus)) {
        throw statusError(`Không thể chuyển trạng thái chuyến bay từ ${oldStatus} sang ${nextStatus}`);
      }

      const departureTime = statusDate(data.departure_time, 'departure_time', flight.departure_time);
      const arrivalTime = statusDate(data.arrival_time, 'arrival_time', flight.arrival_time);
      const actualDepartureTime = statusDate(data.actual_departure_time, 'actual_departure_time', flight.actual_departure_time);
      const actualArrivalTime = statusDate(data.actual_arrival_time, 'actual_arrival_time', flight.actual_arrival_time);
      if (!departureTime || !arrivalTime || arrivalTime <= departureTime) throw statusError('Thời gian đến phải sau thời gian khởi hành');
      if (actualDepartureTime && actualArrivalTime && actualArrivalTime < actualDepartureTime) throw statusError('Thời gian đến thực tế phải sau thời gian khởi hành thực tế');

      const reason = data.reason === undefined ? (flight.status_reason || null) : (String(data.reason).trim() || null);
      if (['delayed', 'cancelled'].includes(nextStatus) && !reason) throw statusError('Vui lòng cung cấp lý do hoãn hoặc hủy chuyến');

      const nextValues = {
        status: nextStatus,
        departure_time: departureTime,
        arrival_time: arrivalTime,
        actual_departure_time: actualDepartureTime,
        actual_arrival_time: actualArrivalTime,
        status_reason: reason,
      };
      const unchanged = oldStatus === nextValues.status
        && sameDate(flight.departure_time, departureTime)
        && sameDate(flight.arrival_time, arrivalTime)
        && sameDate(flight.actual_departure_time, actualDepartureTime)
        && sameDate(flight.actual_arrival_time, actualArrivalTime)
        && (flight.status_reason || null) === reason;
      if (unchanged) return flight;

      const history = {
        flight_id: flight.id,
        from_status: oldStatus,
        to_status: nextStatus,
        actor_user_id: data.actorUserId || null,
        reason,
        old_departure_time: flight.departure_time,
        new_departure_time: departureTime,
        old_arrival_time: flight.arrival_time,
        new_arrival_time: arrivalTime,
        actual_departure_time: actualDepartureTime,
        actual_arrival_time: actualArrivalTime,
      };
      const scheduleChanged = !sameDate(flight.departure_time, departureTime) || !sameDate(flight.arrival_time, arrivalTime);
      await this.repository.update(flight, nextValues, { transaction });
      const createdHistory = await this.repository.createStatusHistory(history, transaction);
      const changeType = nextStatus === 'cancelled' ? 'cancelled'
        : nextStatus === 'delayed' ? 'delayed'
          : scheduleChanged ? 'schedule_changed' : null;
      if (changeType && this.flightStatusNotifier && this.repository.findStatusNotificationRecipients) {
        const recipients = await this.repository.findStatusNotificationRecipients(flight.id, transaction);
        await this.flightStatusNotifier.handleFlightStatusChanged({
          eventId: createdHistory?.id,
          flightId: flight.id,
          changeType,
          recipients,
          transaction,
        });
      }
      return flight;
    });

    const result = await this.getFlightById(flightId);
    this._broadcastFlightUpdate(flightId, {
      flight_id: result.id,
      status: result.status,
      available_seats: result.available_seats,
      departure_time: result.departure_time,
      arrival_time: result.arrival_time,
      actual_departure_time: result.actual_departure_time,
      actual_arrival_time: result.actual_arrival_time,
      status_reason: result.status_reason,
    });
    return result;
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
    if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length === 0) {
      throw statusError('Dữ liệu cập nhật không hợp lệ');
    }
    const allowed = ['departure_time', 'arrival_time', 'actual_departure_time', 'actual_arrival_time', 'status', 'reason', 'actorUserId'];
    const disallowed = Object.keys(data).filter((key) => !allowed.includes(key));
    if (disallowed.length) throw statusError(`Không được phép cập nhật trường: ${disallowed.join(', ')}`);
    return this.updateFlightStatus(flightId, data);
  }

  async cancelFlight(flightId, { reason, actorUserId } = {}) {
    return this.updateFlightStatus(flightId, { status: 'cancelled', reason, actorUserId });
  }

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

  async getAllFlights({ page = 1, limit = 20, status, date_from, date_to } = {}) {
    const { count, rows } = await this.repository.findAdminPage({ page, limit, status, date_from, date_to });
    return { total: count, page, limit, data: rows };
  }

  /**
   * Chức năng #27: Lịch chuyến bay dạng calendar (xem theo tuần/tháng).
   *
   * Query params:
   *   view  - 'week' | 'month' (default: 'week')
   *   date  - YYYY-MM-DD làm mốc điểm trong tuần/tháng cần xem (default: today)
   *   status - lọc trạng thái (tùy chọn)
   *
   * Giới hạn: tối đa 500 chuyến/tháng (bảo vệ tải).
   * Timezone: UTC+7 (Việt Nam) — ngày bắt đầu/kết thúc tính theo giờ địa phương.
   */
  async getFlightCalendar({ view = 'week', date, status } = {}) {
    const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7
    const MAX_FLIGHTS = 500;

    // Tính ngày gốc theo VN time
    const refDate = date ? new Date(date) : new Date();
    if (Number.isNaN(refDate.getTime())) {
      const error = new Error('date không hợp lệ, phải đúng định dạng YYYY-MM-DD');
      error.statusCode = 400;
      throw error;
    }

    let dateStart;
    let dateEnd;

    if (view === 'week') {
      // Tính thứ Hai đầu tuần (VN time)
      const vnNow = new Date(refDate.getTime() + VN_OFFSET_MS);
      const dayOfWeek = vnNow.getUTCDay(); // 0=CN, 1=T2, ..., 6=T7
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const monday = new Date(vnNow);
      monday.setUTCDate(vnNow.getUTCDate() + diffToMonday);
      // 00:00 VN = midnight VN = dateStart UTC
      dateStart = new Date(Date.UTC(
        monday.getUTCFullYear(),
        monday.getUTCMonth(),
        monday.getUTCDate(),
        0, 0, 0, 0,
      ) - VN_OFFSET_MS);
      dateEnd = new Date(dateStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    } else if (view === 'month') {
      // Đầu và cuối tháng (VN time)
      const vnNow = new Date(refDate.getTime() + VN_OFFSET_MS);
      const year = vnNow.getUTCFullYear();
      const month = vnNow.getUTCMonth(); // 0-indexed
      dateStart = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0) - VN_OFFSET_MS);
      dateEnd = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0) - VN_OFFSET_MS);
    } else {
      const error = new Error("view phải là 'week' hoặc 'month'");
      error.statusCode = 400;
      throw error;
    }

    const flights = await this.repository.findCalendar({
      dateStart,
      dateEnd,
      status: status || null,
      limit: MAX_FLIGHTS,
    });

    // Nhóm chuyến bay theo ngày (VN date string YYYY-MM-DD) để frontend dễ dùng
    const byDate = {};
    for (const flight of flights) {
      // Lấy ngày khởi hành theo giờ Việt Nam
      const vnDep = new Date(new Date(flight.departure_time).getTime() + VN_OFFSET_MS);
      const dateKey = [
        vnDep.getUTCFullYear(),
        String(vnDep.getUTCMonth() + 1).padStart(2, '0'),
        String(vnDep.getUTCDate()).padStart(2, '0'),
      ].join('-');
      if (!byDate[dateKey]) byDate[dateKey] = [];
      byDate[dateKey].push(flight);
    }

    return {
      view,
      date_from: dateStart.toISOString(),
      date_to: dateEnd.toISOString(),
      total: flights.length,
      by_date: byDate,
      data: flights,
    };
  }
}

module.exports = FlightService;
