const { Op } = require('sequelize');
const { Airline, Flight } = require('../models');

const AIRLINE_ATTRIBUTES = [
  'id',
  'name',
  'iata_code',
  'logo_url',
  'created_at',
  'updated_at',
];

class AirlineService {
  async getAll({ page = 1, limit = 20, search } = {}) {
    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const limitNumber = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const offset = (pageNumber - 1) * limitNumber;

    const where = {};
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      where[Op.or] = [
        { name: { [Op.like]: term } },
        { iata_code: { [Op.like]: term } },
      ];
    }

    const { count, rows } = await Airline.findAndCountAll({
      where,
      limit: limitNumber,
      offset,
      order: [['name', 'ASC']],
      attributes: AIRLINE_ATTRIBUTES,
    });

    return {
      total: count,
      page: pageNumber,
      limit: limitNumber,
      data: rows,
    };
  }

  async getById(id) {
    const airline = await Airline.findByPk(id, {
      attributes: AIRLINE_ATTRIBUTES,
    });
    if (!airline) {
      const error = new Error('Airline not found');
      error.statusCode = 404;
      throw error;
    }
    return airline;
  }

  async create(data) {
    const payload = {
      name: data.name.trim(),
      iata_code: data.iata_code.trim().toUpperCase(),
      logo_url: data.logo_url ? data.logo_url.trim() : null,
    };

    const existing = await Airline.findOne({
      where: { iata_code: payload.iata_code },
    });
    if (existing) {
      const error = new Error('Airline with this IATA code already exists');
      error.statusCode = 409;
      throw error;
    }

    try {
      return await Airline.create(payload);
    } catch (err) {
      if (err.name === 'SequelizeUniqueConstraintError') {
        const error = new Error('Airline with this IATA code already exists');
        error.statusCode = 409;
        throw error;
      }
      throw err;
    }
  }

  async update(id, data) {
    const airline = await this.getById(id);
    const payload = {};

    if (data.name !== undefined) {
      payload.name = data.name.trim();
    }

    if (data.iata_code !== undefined) {
      const normalizedIata = data.iata_code.trim().toUpperCase();
      if (normalizedIata !== airline.iata_code) {
        const existing = await Airline.findOne({
          where: {
            iata_code: normalizedIata,
            id: { [Op.ne]: id },
          },
        });
        if (existing) {
          const error = new Error('Airline with this IATA code already exists');
          error.statusCode = 409;
          throw error;
        }
      }
      payload.iata_code = normalizedIata;
    }

    if (data.logo_url !== undefined) {
      payload.logo_url = data.logo_url ? data.logo_url.trim() : null;
    }

    try {
      await airline.update(payload);
      return airline;
    } catch (err) {
      if (err.name === 'SequelizeUniqueConstraintError') {
        const error = new Error('Airline with this IATA code already exists');
        error.statusCode = 409;
        throw error;
      }
      throw err;
    }
  }

  async delete(id) {
    const airline = await this.getById(id);

    const flightCount = await Flight.count({
      where: { airline_id: id },
    });
    if (flightCount > 0) {
      const error = new Error('Cannot delete airline with existing flights');
      error.statusCode = 409;
      throw error;
    }

    await airline.destroy();
    return { id: Number(id), message: 'Airline deleted' };
  }
}

module.exports = new AirlineService();
