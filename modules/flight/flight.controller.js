const ApiResponse = require('../../utils/apiResponse');

class FlightController {
  constructor({ service, apiResponse = ApiResponse } = {}) {
    if (!service) throw new TypeError('A Flight service is required');
    this.service = service;
    this.apiResponse = apiResponse;
  }
  async searchFlights(req, res, next) {
    try { return this.apiResponse.paginated(res, await this.service.searchFlights(req.query), 'Flights retrieved successfully'); }
    catch (error) { next(error); }
  }
  async getFlightById(req, res, next) {
    try { return this.apiResponse.success(res, await this.service.getFlightById(req.params.id), 'Flight details retrieved'); }
    catch (error) { next(error); }
  }
  async getAllFlights(req, res, next) {
    try { return this.apiResponse.paginated(res, await this.service.getAllFlights(req.query), 'All flights retrieved'); }
    catch (error) { next(error); }
  }
  async createFlight(req, res, next) {
    try { return this.apiResponse.created(res, await this.service.createFlight(req.body), 'Flight created successfully'); }
    catch (error) { next(error); }
  }
  async updateFlight(req, res, next) {
    try { return this.apiResponse.success(res, await this.service.updateFlight(req.params.id, req.body), 'Flight updated successfully'); }
    catch (error) { next(error); }
  }
  async cancelFlight(req, res, next) {
    try { return this.apiResponse.success(res, await this.service.cancelFlight(req.params.id), 'Flight cancelled'); }
    catch (error) { next(error); }
  }
  async deleteFlight(req, res, next) {
    try { return this.apiResponse.success(res, await this.service.deleteFlight(req.params.id), 'Flight deleted successfully'); }
    catch (error) { next(error); }
  }
}

module.exports = FlightController;
