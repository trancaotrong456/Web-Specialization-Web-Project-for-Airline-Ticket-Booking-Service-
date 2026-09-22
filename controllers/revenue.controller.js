const revenueService = require('../services/revenue.service');
const ApiResponse = require('../utils/apiResponse');

class RevenueController {
  async getRevenueStatistics(req, res, next) {
    try {
      const { from, to } = req.query;

      const result = await revenueService.getRevenueStatistics({
        from,
        to,
      });

      return ApiResponse.success(
        res,
        result,
        'Revenue statistics retrieved successfully'
      );
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new RevenueController();