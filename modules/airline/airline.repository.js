const AIRLINE_ATTRIBUTES = [
  'id',
  'name',
  'iata_code',
  'logo_url',
  'created_at',
  'updated_at',
];

class SequelizeAirlineRepository {
  constructor({ Airline, Flight, Op }) {
    if (!Airline || !Flight || !Op) {
      throw new TypeError('Airline, Flight, and Sequelize Op are required');
    }
    this.Airline = Airline;
    this.Flight = Flight;
    this.Op = Op;
  }

  findPage({ page, limit, search }) {
    const where = {};
    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      where[this.Op.or] = [
        { name: { [this.Op.like]: term } },
        { iata_code: { [this.Op.like]: term } },
      ];
    }

    return this.Airline.findAndCountAll({
      where,
      limit,
      offset: (page - 1) * limit,
      order: [['name', 'ASC']],
      attributes: AIRLINE_ATTRIBUTES,
    });
  }

  findById(id) {
    return this.Airline.findByPk(id, { attributes: AIRLINE_ATTRIBUTES });
  }

  findByIataCode(code, { excludeId } = {}) {
    const where = { iata_code: code };
    if (excludeId !== undefined) where.id = { [this.Op.ne]: excludeId };
    return this.Airline.findOne({ where });
  }

  create(values) {
    return this.Airline.create(values);
  }

  update(instance, values) {
    return instance.update(values);
  }

  countFlightsByAirlineId(id) {
    return this.Flight.count({ where: { airline_id: id } });
  }

  delete(instance) {
    return instance.destroy();
  }
}

module.exports = { SequelizeAirlineRepository, AIRLINE_ATTRIBUTES };
