const fareClassService = require('../services/fareClass.service');
const ApiResponse = require('../utils/apiResponse');

class FareClassController {
  async getByFlight(req, res, next) {
    try { return ApiResponse.success(res, await fareClassService.getByFlight(req.params.flightId)); }
    catch (e) { next(e); }
  }
  async getById(req, res, next) {
    try { return ApiResponse.success(res, await fareClassService.getById(req.params.id)); }
    catch (e) { next(e); }
  }
  async create(req, res, next) {
    try { return ApiResponse.created(res, await fareClassService.create(req.body), 'Fare class created'); }
    catch (e) { next(e); }
  }
  async update(req, res, next) {
    try { return ApiResponse.success(res, await fareClassService.update(req.params.id, req.body), 'Fare class updated'); }
    catch (e) { next(e); }
  }
  async delete(req, res, next) {
    try { return ApiResponse.success(res, await fareClassService.delete(req.params.id), 'Fare class deleted'); }
    catch (e) { next(e); }
  }
}

module.exports = new FareClassController();
