const { Role } = require('../models');

class RoleService {
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
