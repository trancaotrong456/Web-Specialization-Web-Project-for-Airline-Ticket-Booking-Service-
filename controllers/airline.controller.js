const airlineService = require('../services/airline.service');
const ApiResponse = require('../utils/apiResponse');

class AirlineController {
  async getAll(req, res, next) {
    try { return ApiResponse.paginated(res, await airlineService.getAll(req.query)); }
    catch (e) { next(e); }
  }
  async getById(req, res, next) {
    try { return ApiResponse.success(res, await airlineService.getById(req.params.id)); }
    catch (e) { next(e); }
  }
  async create(req, res, next) {
    try { return ApiResponse.created(res, await airlineService.create(req.body), 'Airline created'); }
    catch (e) { next(e); }
  }
  async update(req, res, next) {
    try { return ApiResponse.success(res, await airlineService.update(req.params.id, req.body), 'Airline updated'); }
    catch (e) { next(e); }
  }
  async delete(req, res, next) {
    try { return ApiResponse.success(res, await airlineService.delete(req.params.id), 'Airline deleted'); }
    catch (e) { next(e); }
  }
}

module.exports = new AirlineController();
