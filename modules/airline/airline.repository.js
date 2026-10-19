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

  async getFlightStatistics() {
    const airlines = await this.Airline.findAll({
      attributes: AIRLINE_ATTRIBUTES,
      order: [['name', 'ASC']],
    });

    const flightRows = await this.Flight.findAll({
      attributes: [
        'airline_id',
        'status',
        [this.Flight.sequelize ? this.Flight.sequelize.fn('COUNT', this.Flight.sequelize.col('id')) : 'COUNT', 'flight_count'],
      ],
      group: ['airline_id', 'status'],
      raw: true,
    });

    const statsByAirline = new Map();
    let totalFlights = 0;

    for (const row of flightRows || []) {
      const airlineId = Number(row.airline_id);
      const count = Number(row.flight_count || row['COUNT'] || 0);
      const status = row.status || 'scheduled';

      if (!statsByAirline.has(airlineId)) {
        statsByAirline.set(airlineId, { total: 0, statusBreakdown: {} });
      }

      const entry = statsByAirline.get(airlineId);
      entry.total += count;
      entry.statusBreakdown[status] = (entry.statusBreakdown[status] || 0) + count;
      totalFlights += count;
    }

    const items = (airlines || []).map((airline) => {
      const id = Number(airline.id);
      const stats = statsByAirline.get(id) || { total: 0, statusBreakdown: {} };
      return {
        id: airline.id,
        name: airline.name,
        iata_code: airline.iata_code,
        logo_url: airline.logo_url,
        total_flights: stats.total,
        status_breakdown: stats.statusBreakdown,
      };
    });

    return {
      total_airlines: (airlines || []).length,
      total_flights: totalFlights,
      airlines: items,
    };
  }

  delete(instance) {
    return instance.destroy();
  }
}

module.exports = { SequelizeAirlineRepository, AIRLINE_ATTRIBUTES };
