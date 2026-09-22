const airportService = require('../services/airport.service');
const ApiResponse = require('../utils/apiResponse');

class AirportController {
  async getAll(req, res, next) {
    try { return ApiResponse.paginated(res, await airportService.getAll(req.query)); }
    catch (e) { next(e); }
  }
  async getById(req, res, next) {
    try { return ApiResponse.success(res, await airportService.getById(req.params.id)); }
    catch (e) { next(e); }
  }
  async create(req, res, next) {
    try { return ApiResponse.created(res, await airportService.create(req.body), 'Airport created'); }
    catch (e) { next(e); }
  }
  async update(req, res, next) {
    try { return ApiResponse.success(res, await airportService.update(req.params.id, req.body), 'Airport updated'); }
    catch (e) { next(e); }
  }
  async delete(req, res, next) {
    try { return ApiResponse.success(res, await airportService.delete(req.params.id), 'Airport deleted'); }
    catch (e) { next(e); }
  }
}

module.exports = new AirportController();
