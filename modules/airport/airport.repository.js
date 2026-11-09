class SequelizeAirportRepository {
  constructor({ Airport, Op } = {}) {
    if (!Airport || !Op) throw new TypeError('Airport and Sequelize Op are required');
    this.Airport = Airport;
    this.Op = Op;
  }

  async findPage({ page, limit, search, matchingIds, fromElasticsearch }) {
    const where = {};
    if (fromElasticsearch) {
      where.id = { [this.Op.in]: matchingIds || [] };
    } else if (search) {
      where[this.Op.or] = [
        { name: { [this.Op.like]: `%${search}%` } },
        { iata_code: { [this.Op.like]: `%${search}%` } },
        { city: { [this.Op.like]: `%${search}%` } },
      ];
    }
    const result = await this.Airport.findAndCountAll({
      where,
      limit: Number(limit),
      offset: (page - 1) * limit,
      order: [['city', 'ASC']],
    });

    // Khi tìm kiếm bằng Elasticsearch, bảo toàn thứ tự xếp hạng theo _score của Elasticsearch
    if (fromElasticsearch && Array.isArray(matchingIds) && matchingIds.length > 0 && Array.isArray(result?.rows)) {
      const idOrderMap = new Map(matchingIds.map((id, index) => [Number(id), index]));
      result.rows.sort((a, b) => {
        const orderA = idOrderMap.has(Number(a.id)) ? idOrderMap.get(Number(a.id)) : 999999;
        const orderB = idOrderMap.has(Number(b.id)) ? idOrderMap.get(Number(b.id)) : 999999;
        return orderA - orderB;
      });
    }

    return result;
  }

  findById(id) { return this.Airport.findByPk(id); }
  create(data) { return this.Airport.create(data); }
  update(airport, data) { return airport.update(data); }
  delete(airport) { return airport.destroy(); }
}

module.exports = { SequelizeAirportRepository };
