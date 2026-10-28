class SequelizeAirportRepository {
  constructor({ Airport, Op } = {}) {
    if (!Airport || !Op) throw new TypeError('Airport and Sequelize Op are required');
    this.Airport = Airport;
    this.Op = Op;
  }

  findPage({ page, limit, search, matchingIds }) {
    const where = {};
    if (matchingIds && matchingIds.length > 0) {
      where[this.Op.or] = [
        { id: { [this.Op.in]: matchingIds } },
        { name: { [this.Op.like]: `%${search}%` } },
        { iata_code: { [this.Op.like]: `%${search}%` } },
        { city: { [this.Op.like]: `%${search}%` } },
      ];
    } else if (search) {
      where[this.Op.or] = [
        { name: { [this.Op.like]: `%${search}%` } },
        { iata_code: { [this.Op.like]: `%${search}%` } },
        { city: { [this.Op.like]: `%${search}%` } },
      ];
    }
    return this.Airport.findAndCountAll({
      where,
      limit: Number(limit),
      offset: (page - 1) * limit,
      order: [['city', 'ASC']],
    });
  }

  findById(id) { return this.Airport.findByPk(id); }
  create(data) { return this.Airport.create(data); }
  update(airport, data) { return airport.update(data); }
  delete(airport) { return airport.destroy(); }
}

module.exports = { SequelizeAirportRepository };
