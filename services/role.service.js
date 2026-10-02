const { Role, User } = require('../models');

const SYSTEM_ROLE_NAMES = new Set(['customer', 'staff', 'admin']);

const normalizeRolePayload = ({ name, description }) => ({
  ...(name !== undefined ? { name: name.trim().toLowerCase() } : {}),
  ...(description !== undefined ? { description: description || null } : {}),
});

class RoleService {
  async createRole(payload) {
    const values = normalizeRolePayload(payload);
    const existingRole = await Role.findOne({ where: { name: values.name } });
    if (existingRole) {
      const error = new Error('Role name already exists');
      error.statusCode = 409;
      throw error;
    }
    return Role.create(values);
  }

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

  async updateRole(id, payload) {
    const role = await Role.findByPk(id);
    if (!role) {
      const error = new Error('Role not found');
      error.statusCode = 404;
      throw error;
    }

    const values = normalizeRolePayload(payload);
    if (
      values.name
      && values.name !== role.name
      && SYSTEM_ROLE_NAMES.has(role.name)
    ) {
      const error = new Error(`The system role '${role.name}' cannot be renamed`);
      error.statusCode = 409;
      throw error;
    }

    if (values.name && values.name !== role.name) {
      const duplicate = await Role.findOne({ where: { name: values.name } });
      if (duplicate) {
        const error = new Error('Role name already exists');
        error.statusCode = 409;
        throw error;
      }
    }

    await role.update(values);
    return role;
  }

  async deleteRole(id) {
    const role = await Role.findByPk(id);
    if (!role) {
      const error = new Error('Role not found');
      error.statusCode = 404;
      throw error;
    }

    if (SYSTEM_ROLE_NAMES.has(role.name)) {
      const error = new Error(`The system role '${role.name}' cannot be deleted`);
      error.statusCode = 409;
      throw error;
    }

    const assignedUsers = await User.count({ where: { role_id: role.id } });
    if (assignedUsers > 0) {
      const error = new Error('Cannot delete a role that is assigned to users');
      error.statusCode = 409;
      throw error;
    }

    await role.destroy();
    return { id: role.id };
  }
}

module.exports = new RoleService();
