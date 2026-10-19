class SequelizeUserRepository {
  constructor({ User, Role, Op } = {}) {
    if (!User || !Role || !Op) throw new TypeError('User, Role and Sequelize Op are required');
    this.User = User; this.Role = Role; this.Op = Op;
  }
  findPage({ page, limit, search, status }) {
    const where = {};
    if (status) where.status = status;
    if (search) where[this.Op.or] = [
      { full_name: { [this.Op.like]: `%${search}%` } },
      { email: { [this.Op.like]: `%${search}%` } },
    ];
    return this.User.findAndCountAll({
      where, limit: Number(limit), offset: Number((page - 1) * limit),
      order: [['created_at', 'DESC']],
      attributes: { exclude: ['password_hash', 'refresh_token', 'reset_token', 'reset_token_expires_at'] },
      include: [{ model: this.Role, as: 'role', attributes: ['id', 'name'] }],
    });
  }
  findSafeById(id) {
    return this.User.findByPk(id, {
      attributes: { exclude: ['password_hash', 'refresh_token', 'reset_token', 'reset_token_expires_at'] },
      include: [{ model: this.Role, as: 'role', attributes: ['id', 'name'] }],
    });
  }
  findById(id) { return this.User.findByPk(id); }
  findRoleById(id) { return this.Role.findByPk(id); }
  save(user) { return user.save(); }
  delete(user) { return user.destroy(); }
}
module.exports = { SequelizeUserRepository };
