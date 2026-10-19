const SYSTEM_ROLE_NAMES = new Set(['customer', 'staff', 'admin']);
const normalizeRolePayload = ({ name, description }) => ({
  ...(name !== undefined ? { name: name.trim().toLowerCase() } : {}),
  ...(description !== undefined ? { description: description || null } : {}),
});
class RoleService {
  constructor({ repository } = {}) {
    if (!repository) throw new TypeError('A Role repository is required');
    this.repository = repository;
  }
  async createRole(payload) {
    const values = normalizeRolePayload(payload);
    const existingRole = await this.repository.findByName(values.name);
    if (existingRole) { const error = new Error('Role name already exists'); error.statusCode = 409; throw error; }
    try { return await this.repository.create(values); }
    catch (error) {
      if (error.name === 'SequelizeUniqueConstraintError') {
        const conflict = new Error('Role name already exists'); conflict.statusCode = 409; throw conflict;
      }
      throw error;
    }
  }
  getAllRoles() { return this.repository.findAll(); }
  async getRoleById(id) {
    const role = await this.repository.findSafeById(id);
    if (!role) { const error = new Error('Role not found'); error.statusCode = 404; throw error; }
    return role;
  }
  async updateRole(id, payload) {
    const role = await this.repository.findById(id);
    if (!role) { const error = new Error('Role not found'); error.statusCode = 404; throw error; }
    const values = normalizeRolePayload(payload);
    if (values.name && values.name !== role.name && SYSTEM_ROLE_NAMES.has(role.name)) {
      const error = new Error(`The system role '${role.name}' cannot be renamed`); error.statusCode = 409; throw error;
    }
    if (values.name && values.name !== role.name) {
      const duplicate = await this.repository.findByName(values.name);
      if (duplicate) { const error = new Error('Role name already exists'); error.statusCode = 409; throw error; }
    }
    await this.repository.update(role, values);
    return role;
  }
  async deleteRole(id) {
    const role = await this.repository.findById(id);
    if (!role) { const error = new Error('Role not found'); error.statusCode = 404; throw error; }
    if (SYSTEM_ROLE_NAMES.has(role.name)) {
      const error = new Error(`The system role '${role.name}' cannot be deleted`); error.statusCode = 409; throw error;
    }
    const assignedUsers = await this.repository.countAssignedUsers(role.id);
    if (assignedUsers > 0) {
      const error = new Error('Cannot delete a role that is assigned to users'); error.statusCode = 409; throw error;
    }
    await this.repository.delete(role);
    return { id: role.id };
  }
}
module.exports = RoleService;
