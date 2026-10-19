class SequelizeRoleRepository {
  constructor({ Role, User } = {}) {
    if (!Role || !User) throw new TypeError('Role and User are required');
    this.Role = Role; this.User = User;
  }
  findAll() { return this.Role.findAll({ attributes: ['id', 'name', 'description', 'created_at', 'updated_at'], order: [['id', 'ASC']] }); }
  findSafeById(id) { return this.Role.findByPk(id, { attributes: ['id', 'name', 'description', 'created_at', 'updated_at'] }); }
  findById(id) { return this.Role.findByPk(id); }
  findByName(name) { return this.Role.findOne({ where: { name } }); }
  create(values) { return this.Role.create(values); }
  update(role, values) { return role.update(values); }
  countAssignedUsers(roleId) { return this.User.count({ where: { role_id: roleId } }); }
  delete(role) { return role.destroy(); }
}
module.exports = { SequelizeRoleRepository };
