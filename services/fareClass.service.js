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
    if (!data || typeof data !== 'object') {
      const error = new Error('Dữ liệu tạo hạng vé không hợp lệ');
      error.statusCode = 400;
      throw error;
    }

    // Chặn field ngoài contract: contract chỉ gồm ['flight_id', 'class_name', 'price', 'seat_quota']
    const ALLOWED_FIELDS = ['flight_id', 'class_name', 'price', 'seat_quota'];
    const extraFields = Object.keys(data).filter((k) => !ALLOWED_FIELDS.includes(k));
    if (extraFields.length > 0) {
      const error = new Error(`Không được phép truyền trường ngoài hợp đồng: ${extraFields.join(', ')}`);
      error.statusCode = 400;
      throw error;
    }

    // Validate flight_id
    if (!data.flight_id || !Number.isInteger(Number(data.flight_id)) || Number(data.flight_id) <= 0) {
      const error = new Error('flight_id là bắt buộc và phải là số nguyên dương');
      error.statusCode = 400;
      throw error;
    }

    // Validate class_name
    if (!data.class_name || typeof data.class_name !== 'string' || !data.class_name.trim()) {
      const error = new Error('Tên hạng vé (class_name) là bắt buộc');
      error.statusCode = 400;
      throw error;
    }

    // Validate price
    if (data.price === undefined || data.price === null || Number.isNaN(Number(data.price)) || Number(data.price) < 0) {
      const error = new Error('Giá vé (price) là bắt buộc và phải là số không âm');
      error.statusCode = 400;
      throw error;
    }

    // Validate seat_quota
    if (data.seat_quota !== undefined && data.seat_quota !== null) {
      const numQuota = Number(data.seat_quota);
      if (!Number.isInteger(numQuota) || numQuota < 0) {
        const error = new Error('Số ghế phân bổ (seat_quota) phải là số nguyên không âm');
        error.statusCode = 400;
        throw error;
      }
    }

    const flight = await Flight.findByPk(data.flight_id);
    if (!flight) {
      const error = new Error('Flight not found');
      error.statusCode = 404;
      throw error;
    }

    return FareClass.create({
      flight_id: Number(data.flight_id),
      class_name: data.class_name.trim(),
      price: Number(data.price),
      seat_quota: data.seat_quota !== undefined && data.seat_quota !== null ? Number(data.seat_quota) : null,
    });
  }

  async update(id, data) {
    const fc = await this.getById(id);
    return fc.update(data);
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
