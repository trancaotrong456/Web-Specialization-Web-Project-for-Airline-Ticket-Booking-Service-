const ApiResponse = require('../../utils/apiResponse');

class FareClassController {
  constructor({ service, apiResponse = ApiResponse } = {}) {
    if (!service) throw new TypeError('A FareClass service is required');
    this.service = service;
    this.apiResponse = apiResponse;
  }
  async getByFlight(req, res, next) {
    try { return this.apiResponse.success(res, await this.service.getByFlight(req.params.flightId)); }
    catch (error) { next(error); }
  }
  async getById(req, res, next) {
    try { return this.apiResponse.success(res, await this.service.getById(req.params.id)); }
    catch (error) { next(error); }
  }
  async create(req, res, next) {
    try { return this.apiResponse.created(res, await this.service.create(req.body), 'Fare class created'); }
    catch (error) { next(error); }
  }
  async update(req, res, next) {
    try { return this.apiResponse.success(res, await this.service.update(req.params.id, req.body), 'Fare class updated'); }
    catch (error) { next(error); }
  }
  async delete(req, res, next) {
    try { return this.apiResponse.success(res, await this.service.delete(req.params.id), 'Fare class deleted'); }
    catch (error) { next(error); }
  }
}

module.exports = FareClassController;
