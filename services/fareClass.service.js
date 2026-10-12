const { FareClass, Flight, Booking } = require('../models');

class FareClassService {
  async getByFlight(flight_id) {
    return FareClass.findAll({ where: { flight_id }, order: [['price', 'ASC']] });
  }

  async getById(id) {
    const fc = await FareClass.findByPk(id, {
      include: [{ model: Flight, as: 'flight' }],
    });
    if (!fc) { const error = new Error('Fare class not found'); error.statusCode = 404; throw error; }
    return fc;
  }

  async create(data) {
    const flight = await Flight.findByPk(data.flight_id);
    if (!flight) {
      const error = new Error('Flight not found');
      error.statusCode = 404;
      throw error;
    }
    return FareClass.create(data);
  }

  async update(id, data) {
    if (!data || typeof data !== 'object') {
      const error = new Error('Dữ liệu cập nhật hạng vé không hợp lệ');
      error.statusCode = 400;
      throw error;
    }

    const payloadKeys = Object.keys(data);
    if (payloadKeys.length === 0) {
      const error = new Error('Vui lòng cung cấp ít nhất một trường cần cập nhật');
      error.statusCode = 400;
      throw error;
    }

    // Cấm thay đổi flight_id sau khi tạo
    if (Object.prototype.hasOwnProperty.call(data, 'flight_id')) {
      const error = new Error('Không thể thay đổi chuyến bay (flight_id) của hạng vé đã tạo');
      error.statusCode = 400;
      throw error;
    }

    // Allowlist: class_name, price, seat_quota
    const ALLOWED_FIELDS = ['class_name', 'price', 'seat_quota'];
    const disallowed = payloadKeys.filter((k) => !ALLOWED_FIELDS.includes(k));
    if (disallowed.length > 0) {
      const error = new Error(`Không được phép chỉnh sửa các trường: ${disallowed.join(', ')}`);
      error.statusCode = 400;
      throw error;
    }

    // Validate cả ở service, không chỉ route:
    if (data.class_name !== undefined) {
      if (typeof data.class_name !== 'string' || !data.class_name.trim()) {
        const error = new Error('Tên hạng vé (class_name) không được để trống');
        error.statusCode = 400;
        throw error;
      }
    }

    if (data.price !== undefined) {
      const numPrice = Number(data.price);
      if (Number.isNaN(numPrice) || numPrice < 0) {
        const error = new Error('Giá vé (price) phải là số không âm');
        error.statusCode = 400;
        throw error;
      }
    }

    if (data.seat_quota !== undefined && data.seat_quota !== null) {
      const numQuota = Number(data.seat_quota);
      if (!Number.isInteger(numQuota) || numQuota < 0) {
        const error = new Error('Số ghế phân bổ (seat_quota) phải là số nguyên không âm');
        error.statusCode = 400;
        throw error;
      }
    }

    const fc = await this.getById(id);

    const safeUpdate = {};
    if (data.class_name !== undefined) safeUpdate.class_name = data.class_name.trim();
    if (data.price !== undefined) safeUpdate.price = Number(data.price);
    if (data.seat_quota !== undefined) safeUpdate.seat_quota = data.seat_quota === null ? null : Number(data.seat_quota);

    return fc.update(safeUpdate);
  }

  async delete(id) {
    const fc = await this.getById(id);
    const bookingCount = await Booking.count({ where: { fare_class_id: id } });
    if (bookingCount > 0) {
      const error = new Error('Không thể xóa hạng vé đã có đơn đặt chỗ.');
      error.statusCode = 409;
      throw error;
    }
    await fc.destroy();
    return { message: 'Fare class deleted' };
  }
}

module.exports = new FareClassService();
