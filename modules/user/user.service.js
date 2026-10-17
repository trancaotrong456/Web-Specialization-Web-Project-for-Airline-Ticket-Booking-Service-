const ASSIGNABLE_ROLE_NAMES = new Set(['customer', 'staff', 'admin']);
class UserService {
  constructor({ repository } = {}) {
    if (!repository) throw new TypeError('A User repository is required');
    this.repository = repository;
  }
  async getAllUsers({ page = 1, limit = 20, search, status }) {
    const { count, rows } = await this.repository.findPage({ page, limit, search, status });
    return { total: count, page, limit, data: rows };
  }
  async getUserById(id) {
    const user = await this.repository.findSafeById(id);
    if (!user) { const error = new Error('User not found'); error.statusCode = 404; throw error; }
    return user;
  }
  async updateUserStatus(id, status, actorUserId) {
    if (String(id) === String(actorUserId) && status === 'locked') {
      const error = new Error('Administrators cannot lock their own account'); error.statusCode = 400; throw error;
    }
    const user = await this.repository.findById(id);
    if (!user) { const error = new Error('User not found'); error.statusCode = 404; throw error; }
    user.status = status;
    if (status === 'locked') user.refresh_token = null;
    await this.repository.save(user);
    return { id: user.id, status: user.status };
  }
  async updateUserRole(id, role_id, actorUserId) {
    if (String(id) === String(actorUserId)) {
      const error = new Error('Administrators cannot change their own role'); error.statusCode = 400; throw error;
    }
    const role = await this.repository.findRoleById(role_id);
    if (!role) { const error = new Error('Role not found'); error.statusCode = 404; throw error; }
    if (!ASSIGNABLE_ROLE_NAMES.has(role.name)) {
      const error = new Error('Only system roles (customer, staff, admin) can be assigned to users'); error.statusCode = 400; throw error;
    }
    const user = await this.repository.findById(id);
    if (!user) { const error = new Error('User not found'); error.statusCode = 404; throw error; }
    user.role_id = role_id; user.refresh_token = null;
    await this.repository.save(user);
    return this.getUserById(id);
  }
  async deleteUser(id, actorUserId) {
    if (String(id) === String(actorUserId)) {
      const error = new Error('Administrators cannot delete their own account'); error.statusCode = 400; throw error;
    }
    const user = await this.repository.findById(id);
    if (!user) { const error = new Error('User not found'); error.statusCode = 404; throw error; }
    await this.repository.delete(user);
    return { message: 'User deleted successfully' };
  }
}
module.exports = UserService;
