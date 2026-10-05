const roleService = require('../services/role.service');
const ApiResponse = require('../utils/apiResponse');

class RoleController {
  async createRole(req, res, next) {
    try {
      const role = await roleService.createRole(req.body);
      return ApiResponse.created(res, role, 'Role created successfully');
    } catch (error) {
      next(error);
    }
  }

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

  async updateRole(req, res, next) {
    try {
      const role = await roleService.updateRole(req.params.id, req.body);
      return ApiResponse.success(res, role, 'Role updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async deleteRole(req, res, next) {
    try {
      const result = await roleService.deleteRole(req.params.id);
      return ApiResponse.success(res, result, 'Role deleted successfully');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new RoleController();
