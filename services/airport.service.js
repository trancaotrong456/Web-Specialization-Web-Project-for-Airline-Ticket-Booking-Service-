const { Op } = require('sequelize');
const { Airport, Flight } = require('../models');

const AIRPORT_ATTRIBUTES = [
  'id',
  'iata_code',
  'name',
  'city',
  'country',
  'created_at',
  'updated_at',
];

const FORBIDDEN_FIELDS = ['id', 'created_at', 'updated_at', 'createdAt', 'updatedAt'];

const assertNoForbiddenFields = (data) => {
  if (data && typeof data === 'object') {
    for (const field of FORBIDDEN_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(data, field)) {
        const error = new Error(`Field '${field}' cannot be modified or supplied`);
        error.statusCode = 400;
        throw error;
      }
    }
  }
};

class AirportService {
  /**
   * Lấy danh sách sân bay có phân trang và tìm kiếm (theo tên, city, iata_code).
   */
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
        { city: { [Op.like]: term } },
      ];
    }

    const { count, rows } = await Airport.findAndCountAll({
      where,
      limit: limitNumber,
      offset,
      order: [['city', 'ASC'], ['name', 'ASC']],
      attributes: AIRPORT_ATTRIBUTES,
    });

    return {
      total: count,
      page: pageNumber,
      limit: limitNumber,
      data: rows,
    };
  }

  /**
   * Lấy chi tiết một sân bay theo id.
   * Ném lỗi 404 nếu không tìm thấy.
   */
  async getById(id) {
    const airport = await Airport.findByPk(id, {
      attributes: AIRPORT_ATTRIBUTES,
    });
    if (!airport) {
      const error = new Error('Airport not found');
      error.statusCode = 404;
      throw error;
    }
    return airport;
  }

  /**
   * Thêm sân bay mới.
   * Kiểm tra trùng IATA code trước khi tạo. Chống mass assignment.
   */
  async create(data) {
    assertNoForbiddenFields(data);

    if (!data.iata_code || !data.name || !data.city) {
      const error = new Error('Missing required airport fields');
      error.statusCode = 400;
      throw error;
    }

    const payload = {
      iata_code: String(data.iata_code).trim().toUpperCase(),
      name: String(data.name).trim(),
      city: String(data.city).trim(),
      country: data.country ? String(data.country).trim() : null,
    };

    // Kiểm tra IATA code đã tồn tại chưa
    const existing = await Airport.findOne({
      where: { iata_code: payload.iata_code },
    });
    if (existing) {
      const error = new Error('Airport with this IATA code already exists');
      error.statusCode = 409;
      throw error;
    }

    try {
      const airport = await Airport.create(payload);
      return await this.getById(airport.id);
    } catch (err) {
      if (err.name === 'SequelizeUniqueConstraintError') {
        const error = new Error('Airport with this IATA code already exists');
        error.statusCode = 409;
        throw error;
      }
      throw err;
    }
  }

  /**
   * Cập nhật thông tin sân bay.
   * Kiểm tra trùng IATA code với các sân bay khác (không phải chính nó).
   */
  async update(id, data) {
    assertNoForbiddenFields(data);

    const airport = await this.getById(id);
    const payload = {};

    if (data.iata_code !== undefined) {
      const normalizedIata = String(data.iata_code).trim().toUpperCase();
      if (normalizedIata !== airport.iata_code) {
        const existing = await Airport.findOne({
          where: {
            iata_code: normalizedIata,
            id: { [Op.ne]: id },
          },
        });
        if (existing) {
          const error = new Error('Airport with this IATA code already exists');
          error.statusCode = 409;
          throw error;
        }
      }
      payload.iata_code = normalizedIata;
    }

    if (data.name !== undefined) {
      payload.name = String(data.name).trim();
    }

    if (data.city !== undefined) {
      payload.city = String(data.city).trim();
    }

    if (data.country !== undefined) {
      payload.country = data.country ? String(data.country).trim() : null;
    }

    try {
      await airport.update(payload);
      return await this.getById(id);
    } catch (err) {
      if (err.name === 'SequelizeUniqueConstraintError') {
        const error = new Error('Airport with this IATA code already exists');
        error.statusCode = 409;
        throw error;
      }
      throw err;
    }
  }

  /**
   * Xóa sân bay.
   * Từ chối xóa nếu còn chuyến bay liên kết (departure hoặc arrival).
   */
  async delete(id) {
    const airport = await this.getById(id);

    // Kiểm tra chuyến bay khởi hành từ sân bay này
    const departureCount = await Flight.count({
      where: { departure_airport_id: id },
    });
    // Kiểm tra chuyến bay đến sân bay này
    const arrivalCount = await Flight.count({
      where: { arrival_airport_id: id },
    });

    const totalFlights = departureCount + arrivalCount;
    if (totalFlights > 0) {
      const error = new Error('Cannot delete airport with existing flights');
      error.statusCode = 409;
      throw error;
    }

    try {
      await airport.destroy();
      return { id: Number(id), message: 'Airport deleted' };
    } catch (err) {
      if (err.name === 'SequelizeForeignKeyConstraintError') {
        const error = new Error('Invalid referenced resource ID');
        error.statusCode = 400;
        throw error;
      }
      throw err;
    }
  }
}

module.exports = new AirportService();
