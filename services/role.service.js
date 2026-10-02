const { Role } = require('../models');

class RoleService {
  /**
   * RBAC metadata is read-only in the current project scope.  Role creation,
   * update, and deletion remain a future extension documented in the report.
   */
  async getAllRoles() {
    return Role.findAll({
      attributes: ['id', 'name', 'description', 'created_at', 'updated_at'],
      order: [['id', 'ASC']],
    });
  }

  async getRoleById(id) {
    const role = await Role.findByPk(id, {
      attributes: ['id', 'name', 'description', 'created_at', 'updated_at'],
    });

    if (!role) {
      const error = new Error('Role not found');
      error.statusCode = 404;
      throw error;
    }

    return role;
  }
}

module.exports = new RoleService();
