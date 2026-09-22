const flightService = require('../services/flight.service');
const ApiResponse = require('../utils/apiResponse');

class FlightController {
  async searchFlights(req, res, next) {
    try {
      const result = await flightService.searchFlights(req.query);
      return ApiResponse.paginated(res, result, 'Flights retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getFlightById(req, res, next) {
    try {
      const flight = await flightService.getFlightById(req.params.id);
      return ApiResponse.success(res, flight, 'Flight details retrieved');
    } catch (error) {
      next(error);
    }
  }

  async getAllFlights(req, res, next) {
    try {
      const result = await flightService.getAllFlights(req.query);
      return ApiResponse.paginated(res, result, 'All flights retrieved');
    } catch (error) {
      next(error);
    }
  }

  async createFlight(req, res, next) {
    try {
      const flight = await flightService.createFlight(req.body);
      return ApiResponse.created(res, flight, 'Flight created successfully');
    } catch (error) {
      next(error);
    }
  }

  async updateFlight(req, res, next) {
    try {
      const flight = await flightService.updateFlight(req.params.id, req.body);
      return ApiResponse.success(res, flight, 'Flight updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async cancelFlight(req, res, next) {
    try {
      const flight = await flightService.cancelFlight(req.params.id);
      return ApiResponse.success(res, flight, 'Flight cancelled');
    } catch (error) {
      next(error);
    }
  }

  async deleteFlight(req, res, next) {
    try {
      const result = await flightService.deleteFlight(req.params.id);
      return ApiResponse.success(res, result, 'Flight deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new FlightController();
