class AirlineService {
  constructor({ repository } = {}) {
    if (!repository) throw new TypeError('An Airline repository is required');
    this.repository = repository;
  }

  async getAll({ page = 1, limit = 20, search } = {}) {
    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const limitNumber = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const searchTerm = search && search.trim() ? search.trim() : undefined;
    const { count, rows } = await this.repository.findPage({
      page: pageNumber,
      limit: limitNumber,
      search: searchTerm,
    });

    return { total: count, page: pageNumber, limit: limitNumber, data: rows };
  }

  async getById(id) {
    const airline = await this.repository.findById(id);
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

    const existing = await this.repository.findByIataCode(payload.iata_code);
    if (existing) throw this.createDuplicateIataError();

    try {
      return await this.repository.create(payload);
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') throw this.createDuplicateIataError();
      throw error;
    }
  }

  async update(id, data) {
    const airline = await this.getById(id);
    const payload = {};

    if (data.name !== undefined) payload.name = data.name.trim();

    if (data.iata_code !== undefined) {
      const normalizedIata = data.iata_code.trim().toUpperCase();
      if (normalizedIata !== airline.iata_code) {
        const existing = await this.repository.findByIataCode(normalizedIata, { excludeId: id });
        if (existing) throw this.createDuplicateIataError();
      }
      payload.iata_code = normalizedIata;
    }

    if (data.logo_url !== undefined) payload.logo_url = data.logo_url ? data.logo_url.trim() : null;

    try {
      await this.repository.update(airline, payload);
      return airline;
    } catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') throw this.createDuplicateIataError();
      throw error;
    }
  }

  async delete(id) {
    const airline = await this.getById(id);
    const flightCount = await this.repository.countFlightsByAirlineId(id);
    if (flightCount > 0) {
      const error = new Error('Cannot delete airline with existing flights');
      error.statusCode = 409;
      throw error;
    }

    await this.repository.delete(airline);
    return { id: Number(id), message: 'Airline deleted' };
  }

  createDuplicateIataError() {
    const error = new Error('Airline with this IATA code already exists');
    error.statusCode = 409;
    return error;
  }
}

module.exports = AirlineService;
