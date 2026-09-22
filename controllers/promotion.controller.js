const promotionService = require('../services/promotion.service');
const ApiResponse = require('../utils/apiResponse');

class PromotionController {
  async getAll(req, res, next) {
    try { return ApiResponse.paginated(res, await promotionService.getAll(req.query)); }
    catch (e) { next(e); }
  }
  async getById(req, res, next) {
    try { return ApiResponse.success(res, await promotionService.getById(req.params.id)); }
    catch (e) { next(e); }
  }
  async validateCode(req, res, next) {
    try { return ApiResponse.success(res, await promotionService.validateCode(req.params.code), 'Promotion code is valid'); }
    catch (e) { next(e); }
  }
  async create(req, res, next) {
    try { return ApiResponse.created(res, await promotionService.create(req.body), 'Promotion created'); }
    catch (e) { next(e); }
  }
  async update(req, res, next) {
    try { return ApiResponse.success(res, await promotionService.update(req.params.id, req.body), 'Promotion updated'); }
    catch (e) { next(e); }
  }
  async delete(req, res, next) {
    try { return ApiResponse.success(res, await promotionService.delete(req.params.id), 'Promotion deleted'); }
    catch (e) { next(e); }
  }
}

module.exports = new PromotionController();
