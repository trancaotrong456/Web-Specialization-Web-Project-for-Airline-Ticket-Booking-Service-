const { Op } = require('sequelize');
const { Airline } = require('../models');

class AirlineService {
  async getAll({ page = 1, limit = 20, search }) {
    const where = {};
    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { iata_code: { [Op.like]: `%${search}%` } },
      ];
    }
    const { count, rows } = await Airline.findAndCountAll({
      where,
      limit: Number(limit),
      offset: (page - 1) * limit,
      order: [['name', 'ASC']],
    });
    return { total: count, page, limit, data: rows };
  }

  async getById(id) {
    const airline = await Airline.findByPk(id);
    if (!airline) {
      const error = new Error('Airline not found'); error.statusCode = 404; throw error;
    }
    return airline;
  }

  async create(data) {
    return Airline.create(data);
  }

  async update(id, data) {
    const airline = await this.getById(id);
    return airline.update(data);
  }

  async delete(id) {
    const airline = await this.getById(id);
    await airline.destroy();
    return { message: 'Airline deleted' };
  }
}

module.exports = new AirlineService();
