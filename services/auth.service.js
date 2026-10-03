const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Op } = require('sequelize');
const { User, Role } = require('../models');
const emailService = require('./email.service');
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} = require('../utils/jwt.util');

class AuthService {
  _passwordResetUrl(rawToken) {
    const configuredUrl = process.env.PASSWORD_RESET_URL
      || (process.env.CLIENT_URL
        ? `${process.env.CLIENT_URL.replace(/\/$/, '')}/reset-password`
        : 'http://localhost:3000/reset-password');

    let resetUrl;
    try {
      resetUrl = new URL(configuredUrl);
    } catch (_error) {
      const error = new Error('PASSWORD_RESET_URL is not a valid URL');
      error.statusCode = 500;
      throw error;
    }

    if (process.env.NODE_ENV === 'production' && resetUrl.protocol !== 'https:') {
      const error = new Error('PASSWORD_RESET_URL must use HTTPS in production');
      error.statusCode = 500;
      throw error;
    }

    resetUrl.searchParams.set('token', rawToken);
    return resetUrl.toString();
  }

  /**
   * Register a new user
   */
  async register({ email, password, full_name, phone }) {
    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = await User.findOne({ where: { email: normalizedEmail } });
    if (existingUser) {
      const error = new Error('Email is already registered');
      error.statusCode = 409;
      throw error;
    }

    // Find default customer role
    const [customerRole] = await Role.findOrCreate({
      where: { name: 'customer' },
      defaults: {
        name: 'customer',
        description: 'Default passenger customer role',
      },
    });

    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    let newUser;
    try {
      newUser = await User.create({
        email: normalizedEmail,
        password_hash,
        full_name,
        phone: phone || null,
        role_id: customerRole.id,
        status: 'active',
      });
    } catch (error) {
      // The pre-check above improves the common response, while the database
      // unique constraint remains authoritative for concurrent registrations.
      if (error.name === 'SequelizeUniqueConstraintError') {
        const conflict = new Error('Email is already registered');
        conflict.statusCode = 409;
        throw conflict;
      }
      throw error;
    }

    const tokenPayload = {
      id: newUser.id,
      email: newUser.email,
      role: customerRole.name,
    };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);
    await newUser.update({ refresh_token: refreshToken });

    return {
      user: {
        id: newUser.id,
        email: newUser.email,
        full_name: newUser.full_name,
        phone: newUser.phone,
        role: customerRole.name,
      },
      accessToken,
      refreshToken,
    };
  }

  /**
   * Login user
   */
  async login({ email, password }) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({
      where: { email: normalizedEmail },
      include: [{ model: Role, as: 'role', attributes: ['id', 'name'] }],
    });

    if (!user) {
      const error = new Error('Invalid email or password');
      error.statusCode = 401;
      throw error;
    }

    if (user.status === 'locked') {
      const error = new Error('Account has been locked. Please contact support.');
      error.statusCode = 403;
      throw error;
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      const error = new Error('Invalid email or password');
      error.statusCode = 401;
      throw error;
    }

    const roleName = user.role ? user.role.name : 'customer';
    const tokenPayload = {
      id: user.id,
      email: user.email,
      role: roleName,
    };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);
    await user.update({ refresh_token: refreshToken });

    return {
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone,
        role: roleName,
      },
      accessToken,
      refreshToken,
    };
  }

  /**
   * Exchange a currently stored, valid refresh token for a new access token.
   */
  async refreshToken(oldRefreshToken) {
    let decoded;
    try {
      decoded = verifyRefreshToken(oldRefreshToken);
    } catch (_error) {
      const error = new Error('Invalid or expired refresh token');
      error.statusCode = 401;
      throw error;
    }

    const user = await User.findByPk(decoded.id, {
      include: [{ model: Role, as: 'role', attributes: ['id', 'name'] }],
    });

    if (!user || user.refresh_token !== oldRefreshToken) {
      const error = new Error('Refresh token has been revoked or is invalid');
      error.statusCode = 401;
      throw error;
    }

    if (user.status === 'locked') {
      const error = new Error('Account has been locked. Please contact support.');
      error.statusCode = 403;
      throw error;
    }

    const roleName = user.role ? user.role.name : 'customer';
    return {
      accessToken: generateAccessToken({
        id: user.id,
        email: user.email,
        role: roleName,
      }),
    };
  }

  /**
   * Revoke the user's currently stored refresh token.
   */
  async logout(userId) {
    await User.update({ refresh_token: null }, { where: { id: userId } });
    return { message: 'Logged out successfully' };
  }

  /**
   * Get current user profile
   */
  async getProfile(userId) {
    const user = await User.findByPk(userId, {
      include: [{ model: Role, as: 'role', attributes: ['id', 'name'] }],
      attributes: { exclude: ['password_hash', 'refresh_token', 'reset_token', 'reset_token_expires_at'] },
    });

    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    return user;
  }

  /**
   * Update profile
   */
  async updateProfile(userId, { full_name, phone }) {
    const user = await User.findByPk(userId);
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    if (full_name) user.full_name = full_name;
    if (phone !== undefined) user.phone = phone;
    await user.save();

    return {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      phone: user.phone,
    };
  }

  /**
   * Change password
   */
  async changePassword(userId, { current_password, new_password }) {
    const user = await User.findByPk(userId);
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    const isMatch = await bcrypt.compare(current_password, user.password_hash);
    if (!isMatch) {
      const error = new Error('Current password is incorrect');
      error.statusCode = 400;
      throw error;
    }

    if (current_password === new_password) {
      const error = new Error('New password must be different from the current password');
      error.statusCode = 400;
      throw error;
    }

    const salt = await bcrypt.genSalt(10);
    user.password_hash = await bcrypt.hash(new_password, salt);
    // A password change is a security boundary: revoke the long-lived session
    // so any previously copied refresh token can no longer mint access tokens.
    user.refresh_token = null;
    await user.save();

    return { message: 'Password changed successfully' };
  }

  async forgotPassword(email) {
    const genericResult = {
      message: 'If the email is registered, password reset instructions will be sent.',
    };
    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ where: { email: normalizedEmail } });

    if (!user || user.status === 'locked') return genericResult;

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const configuredMinutes = Number.parseInt(
      process.env.PASSWORD_RESET_EXPIRES_MINUTES || '30',
      10
    );
    const expiresMinutes = Number.isInteger(configuredMinutes) && configuredMinutes > 0
      ? configuredMinutes
      : 30;

    user.reset_token = tokenHash;
    user.reset_token_expires_at = new Date(Date.now() + expiresMinutes * 60 * 1000);
    await user.save();

    try {
      const resetUrl = this._passwordResetUrl(rawToken);
      await emailService.sendMail({
        to: user.email,
        subject: '[Airline Booking] Đặt lại mật khẩu',
        html: `
          <h2>Đặt lại mật khẩu</h2>
          <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.</p>
          <p><a href="${resetUrl}">Đặt lại mật khẩu</a></p>
          <p>Liên kết này hết hạn sau ${expiresMinutes} phút. Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>
        `,
      });
    } catch (error) {
      user.reset_token = null;
      user.reset_token_expires_at = null;
      await user.save();
      throw error;
    }

    return genericResult;
  }

  async resetPassword(rawToken, newPassword) {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const user = await User.findOne({
      where: {
        reset_token: tokenHash,
        reset_token_expires_at: { [Op.gt]: new Date() },
      },
    });

    if (!user) {
      const error = new Error('Reset token is invalid or has expired');
      error.statusCode = 400;
      throw error;
    }

    user.password_hash = await bcrypt.hash(newPassword, 10);
    user.reset_token = null;
    user.reset_token_expires_at = null;
    user.refresh_token = null;
    await user.save();

    return { message: 'Password reset successfully. Please log in again.' };
  }

}

module.exports = new AuthService();
