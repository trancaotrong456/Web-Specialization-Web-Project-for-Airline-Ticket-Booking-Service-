const ApiResponse = require('../../utils/apiResponse');
class UserController {
  constructor({ service, apiResponse = ApiResponse } = {}) {
    if (!service) throw new TypeError('A User service is required');
    this.service = service; this.apiResponse = apiResponse;
  }
  async getAllUsers(req, res, next) {
    try { return this.apiResponse.paginated(res, await this.service.getAllUsers(req.query), 'Users retrieved'); }
    catch (error) { next(error); }
  }
  async getUserById(req, res, next) {
    try { return this.apiResponse.success(res, await this.service.getUserById(req.params.id)); }
    catch (error) { next(error); }
  }
  async updateProfile(req, res, next) {
    try { return this.apiResponse.success(res, await this.service.updateUserProfile(req.params.id, req.body), 'User profile updated'); }
    catch (error) { next(error); }
  }
  async updateStatus(req, res, next) {
    try { return this.apiResponse.success(res, await this.service.updateUserStatus(req.params.id, req.body.status, req.user.id), 'User status updated'); }
    catch (error) { next(error); }
  }
  async updateRole(req, res, next) {
    try { return this.apiResponse.success(res, await this.service.updateUserRole(req.params.id, req.body.role_id, req.user.id), 'User role updated'); }
    catch (error) { next(error); }
  }
  async deleteUser(req, res, next) {
    try { return this.apiResponse.success(res, await this.service.deleteUser(req.params.id, req.user.id), 'User deleted'); }
    catch (error) { next(error); }
  }
}
module.exports = UserController;
