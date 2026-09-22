const { Op } = require('sequelize');
const { Airport } = require('../models');

class AirportService {
  async getAll({ page = 1, limit = 20, search }) {
    const where = {};
    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { iata_code: { [Op.like]: `%${search}%` } },
        { city: { [Op.like]: `%${search}%` } },
      ];
    }
    const { count, rows } = await Airport.findAndCountAll({
      where,
      limit: Number(limit),
      offset: (page - 1) * limit,
      order: [['city', 'ASC']],
    });
    return { total: count, page, limit, data: rows };
  }

  async getById(id) {
    const airport = await Airport.findByPk(id);
    if (!airport) {
      const error = new Error('Airport not found'); error.statusCode = 404; throw error;
    }
    return airport;
  }

  async create(data) { return Airport.create(data); }

  async update(id, data) {
    const airport = await this.getById(id);
    return airport.update(data);
  }

  async delete(id) {
    const airport = await this.getById(id);
    await airport.destroy();
    return { message: 'Airport deleted' };
  }
}

module.exports = new AirportService();
