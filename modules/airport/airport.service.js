class AirportService {
  constructor({ repository, searchEngine } = {}) {
    if (!repository) throw new TypeError('An Airport repository is required');
    this.repository = repository;
    this.searchEngine = searchEngine;
  }

  async getAll({ page = 1, limit = 20, search } = {}) {
    const query = { page, limit, search };
    if (this.searchEngine && search && typeof search === 'string' && search.trim()) {
      const results = this.searchEngine.searchAirports(search.trim());
      if (results && results.length > 0) {
        query.matchingIds = results.map((r) => r.id);
      }
    }
    const { count, rows } = await this.repository.findPage(query);
    return { total: count, page, limit, data: rows };
  }

  async getById(id) {
    const airport = await this.repository.findById(id);
    if (!airport) {
      const error = new Error('Airport not found');
      error.statusCode = 404;
      throw error;
    }
    return airport;
  }

  async create(data) {
    const created = await this.repository.create(data);
    if (this.searchEngine && created) {
      this.searchEngine.addAirport(created);
    }
    return created;
  }

  async update(id, data) {
    const airport = await this.getById(id);
    const updated = await this.repository.update(airport, data);
    if (this.searchEngine && updated) {
      this.searchEngine.addAirport(updated);
    }
    return updated;
  }

  async delete(id) {
    const airport = await this.getById(id);
    await this.repository.delete(airport);
    if (this.searchEngine) {
      this.searchEngine.removeAirport(id);
    }
    return { message: 'Airport deleted' };
  }
}

module.exports = AirportService;
