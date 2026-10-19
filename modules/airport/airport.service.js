class AirportService {
  constructor({ repository } = {}) {
    if (!repository) throw new TypeError('An Airport repository is required');
    this.repository = repository;
  }

  async getAll({ page = 1, limit = 20, search } = {}) {
    const { count, rows } = await this.repository.findPage({ page, limit, search });
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

  create(data) { return this.repository.create(data); }

  async update(id, data) {
    const airport = await this.getById(id);
    return this.repository.update(airport, data);
  }

  async delete(id) {
    const airport = await this.getById(id);
    await this.repository.delete(airport);
    return { message: 'Airport deleted' };
  }
}

module.exports = AirportService;
