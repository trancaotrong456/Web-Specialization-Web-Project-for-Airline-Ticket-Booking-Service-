const roleService = require('../services/role.service');
const ApiResponse = require('../utils/apiResponse');

class RoleController {
  async getAllRoles(_req, res, next) {
    try {
      const roles = await roleService.getAllRoles();
      return ApiResponse.success(res, roles, 'Roles retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async getRoleById(req, res, next) {
    try {
      const role = await roleService.getRoleById(req.params.id);
      return ApiResponse.success(res, role, 'Role retrieved successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new RoleController();
