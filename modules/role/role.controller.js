const ApiResponse = require('../../utils/apiResponse');
class RoleController {
  constructor({ service, apiResponse = ApiResponse } = {}) {
    if (!service) throw new TypeError('A Role service is required');
    this.service = service; this.apiResponse = apiResponse;
  }
  async createRole(req, res, next) {
    try { return this.apiResponse.created(res, await this.service.createRole(req.body), 'Role created successfully'); }
    catch (error) { next(error); }
  }
  async getAllRoles(_req, res, next) {
    try { return this.apiResponse.success(res, await this.service.getAllRoles(), 'Roles retrieved successfully'); }
    catch (error) { next(error); }
  }
  async getRoleById(req, res, next) {
    try { return this.apiResponse.success(res, await this.service.getRoleById(req.params.id), 'Role retrieved successfully'); }
    catch (error) { next(error); }
  }
  async updateRole(req, res, next) {
    try { return this.apiResponse.success(res, await this.service.updateRole(req.params.id, req.body), 'Role updated successfully'); }
    catch (error) { next(error); }
  }
  async deleteRole(req, res, next) {
    try { return this.apiResponse.success(res, await this.service.deleteRole(req.params.id), 'Role deleted successfully'); }
    catch (error) { next(error); }
  }
}
module.exports = RoleController;
