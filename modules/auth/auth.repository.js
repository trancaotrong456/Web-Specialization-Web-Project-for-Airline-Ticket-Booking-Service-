class SequelizeAuthRepository {
  constructor({ User, Role, Op } = {}) {
    if (!User || !Role || !Op) throw new TypeError('User, Role and Sequelize Op are required');
    this.User = User; this.Role = Role; this.Op = Op;
  }
  findUserByEmail(email) { return this.User.findOne({ where: { email } }); }
  findUserWithRoleByEmail(email) {
    return this.User.findOne({ where: { email }, include: [{ model: this.Role, as: 'role', attributes: ['id', 'name'] }] });
  }
  findOrCreateCustomerRole() {
    return this.Role.findOrCreate({ where: { name: 'customer' }, defaults: {
      name: 'customer', description: 'Default passenger customer role',
    } });
  }
  createUser(values) { return this.User.create(values); }
  updateUser(user, values) { return user.update(values); }
  saveUser(user) { return user.save(); }
  findUserWithRoleById(id) {
    return this.User.findByPk(id, { include: [{ model: this.Role, as: 'role', attributes: ['id', 'name'] }] });
  }
  findUserById(id) { return this.User.findByPk(id); }
  findProfileById(id) {
    return this.User.findByPk(id, {
      include: [{ model: this.Role, as: 'role', attributes: ['id', 'name'] }],
      attributes: { exclude: ['password_hash', 'refresh_token', 'reset_token', 'reset_token_expires_at'] },
    });
  }
  upgradeLegacyRefreshToken(id, rawToken, digest) {
    return this.User.update({ refresh_token: digest }, { where: {
      id,
      [this.Op.and]: this.User.sequelize.where(
        this.User.sequelize.fn('BINARY', this.User.sequelize.col('refresh_token')),
        rawToken,
      ),
    } });
  }
  revokeRefreshToken(userId) { return this.User.update({ refresh_token: null }, { where: { id: userId } }); }
  consumePasswordReset(tokenHash, passwordHash) {
    return this.User.update({
      password_hash: passwordHash, reset_token: null, reset_token_expires_at: null, refresh_token: null,
    }, { where: {
      reset_token: tokenHash,
      reset_token_expires_at: { [this.Op.gt]: new Date() },
      status: 'active',
    } });
  }
}
module.exports = { SequelizeAuthRepository };
