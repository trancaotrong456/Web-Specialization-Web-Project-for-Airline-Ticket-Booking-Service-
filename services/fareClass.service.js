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
