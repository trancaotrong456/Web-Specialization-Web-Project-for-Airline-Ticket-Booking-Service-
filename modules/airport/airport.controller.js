const ApiResponse = require('../../utils/apiResponse');

class AirportController {
  constructor({ service, apiResponse = ApiResponse } = {}) {
    if (!service) throw new TypeError('An Airport service is required');
    this.service = service;
    this.apiResponse = apiResponse;
  }

  async getAll(req, res, next) {
    try { return this.apiResponse.paginated(res, await this.service.getAll(req.query)); }
    catch (error) { next(error); }
  }

  async getById(req, res, next) {
    try { return this.apiResponse.success(res, await this.service.getById(req.params.id)); }
    catch (error) { next(error); }
  }

  async create(req, res, next) {
    try { return this.apiResponse.created(res, await this.service.create(req.body), 'Airport created'); }
    catch (error) { next(error); }
  }

  async update(req, res, next) {
    try {
      return this.apiResponse.success(res, await this.service.update(req.params.id, req.body), 'Airport updated');
    } catch (error) { next(error); }
  }

  async delete(req, res, next) {
    try { return this.apiResponse.success(res, await this.service.delete(req.params.id), 'Airport deleted'); }
    catch (error) { next(error); }
  }
}

module.exports = AirportController;
