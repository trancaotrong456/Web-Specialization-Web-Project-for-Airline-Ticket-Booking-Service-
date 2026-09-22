const userService = require('../services/user.service');
const ApiResponse = require('../utils/apiResponse');

class UserController {
  async getAllUsers(req, res, next) {
    try {
      const result = await userService.getAllUsers(req.query);
      return ApiResponse.paginated(res, result, 'Users retrieved');
    } catch (error) { next(error); }
  }

  async getUserById(req, res, next) {
    try {
      const user = await userService.getUserById(req.params.id);
      return ApiResponse.success(res, user);
    } catch (error) { next(error); }
  }

  async updateStatus(req, res, next) {
    try {
      const result = await userService.updateUserStatus(req.params.id, req.body.status);
      return ApiResponse.success(res, result, 'User status updated');
    } catch (error) { next(error); }
  }

  async updateRole(req, res, next) {
    try {
      const result = await userService.updateUserRole(req.params.id, req.body.role_id);
      return ApiResponse.success(res, result, 'User role updated');
    } catch (error) { next(error); }
  }

  async deleteUser(req, res, next) {
    try {
      const result = await userService.deleteUser(req.params.id);
      return ApiResponse.success(res, result, 'User deleted');
    } catch (error) { next(error); }
  }
}

module.exports = new UserController();
