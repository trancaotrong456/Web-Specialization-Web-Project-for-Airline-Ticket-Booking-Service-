const { FareClass } = require('../models');

class FareClassService {
  async getByFlight(flight_id) {
    return FareClass.findAll({ where: { flight_id }, order: [['price', 'ASC']] });
  }

  async getById(id) {
    const fc = await FareClass.findByPk(id);
    if (!fc) { const error = new Error('Fare class not found'); error.statusCode = 404; throw error; }
    return fc;
  }

  async create(data) {
    return FareClass.create(data);
  }

  async update(id, data) {
    const fc = await this.getById(id);
    return fc.update(data);
  }

  async delete(id) {
    const fc = await this.getById(id);
    await fc.destroy();
    return { message: 'Fare class deleted' };
  }
}

module.exports = new FareClassService();
