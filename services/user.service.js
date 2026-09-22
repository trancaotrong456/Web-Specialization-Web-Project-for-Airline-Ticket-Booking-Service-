const { Op } = require('sequelize');
const { User, Role } = require('../models');
const bcrypt = require('bcryptjs');

class UserService {
  async getAllUsers({ page = 1, limit = 20, search, status }) {
    const offset = (page - 1) * limit;
    const where = {};
    if (status) where.status = status;
    if (search) {
      where[Op.or] = [
        { full_name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
      ];
    }

    const { count, rows } = await User.findAndCountAll({
      where,
      limit: Number(limit),
      offset: Number(offset),
      order: [['created_at', 'DESC']],
      attributes: { exclude: ['password_hash', 'refresh_token', 'reset_token'] },
      include: [{ model: Role, as: 'role', attributes: ['id', 'name'] }],
    });

    return { total: count, page, limit, data: rows };
  }

  async getUserById(id) {
    const user = await User.findByPk(id, {
      attributes: { exclude: ['password_hash', 'refresh_token', 'reset_token'] },
      include: [{ model: Role, as: 'role', attributes: ['id', 'name'] }],
    });
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }
    return user;
  }

  async updateUserStatus(id, status) {
    const user = await User.findByPk(id);
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }
    user.status = status;
    await user.save();
    return { id: user.id, status: user.status };
  }

  async updateUserRole(id, role_id) {
    const role = await Role.findByPk(role_id);
    if (!role) {
      const error = new Error('Role not found');
      error.statusCode = 404;
      throw error;
    }
    const user = await User.findByPk(id);
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }
    user.role_id = role_id;
    await user.save();
    return this.getUserById(id);
  }

  async deleteUser(id) {
    const user = await User.findByPk(id);
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }
    await user.destroy();
    return { message: 'User deleted successfully' };
  }
}

module.exports = new UserService();
