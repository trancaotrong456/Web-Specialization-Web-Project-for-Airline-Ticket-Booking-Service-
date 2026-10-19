const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const emailService = require('../../services/email.service');
const jwt = require('../../utils/jwt.util');

class AuthService {
  constructor({ repository, bcryptProvider = bcrypt, cryptoProvider = crypto, emailProvider = emailService,
    tokenProvider = jwt, environment = process.env, logger = console } = {}) {
    if (!repository) throw new TypeError('An Auth repository is required');
    this.repository = repository;
    this.bcrypt = bcryptProvider;
    this.crypto = cryptoProvider;
    this.emailService = emailProvider;
    this.tokens = tokenProvider;
    this.environment = environment;
    this.logger = logger;
  }

  _hashRefreshToken(rawToken) {
    return this.crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  _matchesRefreshTokenDigest(storedValue, presentedDigest) {
    if (typeof storedValue !== 'string' || !/^[a-f0-9]{64}$/i.test(storedValue)) return false;

    const storedBuffer = Buffer.from(storedValue, 'hex');
    const presentedBuffer = Buffer.from(presentedDigest, 'hex');
    return storedBuffer.length === presentedBuffer.length
      && this.crypto.timingSafeEqual(storedBuffer, presentedBuffer);
  }

  _invalidRefreshTokenError() {
    const error = new Error('Refresh token has been revoked or is invalid');
    error.statusCode = 401;
    return error;
  }

  _passwordResetUrl(rawToken) {
    const configuredUrl = this.environment.PASSWORD_RESET_URL
      || (this.environment.CLIENT_URL
        ? `${this.environment.CLIENT_URL.replace(/\/$/, '')}/reset-password`
        : 'http://localhost:3000/reset-password');

    let resetUrl;
    try {
      resetUrl = new URL(configuredUrl);
    } catch (_error) {
      const error = new Error('PASSWORD_RESET_URL is not a valid URL');
      error.statusCode = 500;
      throw error;
    }

    if (this.environment.NODE_ENV === 'production' && resetUrl.protocol !== 'https:') {
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
    const existingUser = await this.repository.findUserByEmail(normalizedEmail);
    if (existingUser) {
      const error = new Error('Email is already registered');
      error.statusCode = 409;
      throw error;
    }

    // Find default customer role
    const [customerRole] = await this.repository.findOrCreateCustomerRole();

    const salt = await this.bcrypt.genSalt(10);
    const password_hash = await this.bcrypt.hash(password, salt);

    let newUser;
    try {
      newUser = await this.repository.createUser({
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
    const accessToken = this.tokens.generateAccessToken(tokenPayload);
    const refreshToken = this.tokens.generateRefreshToken(tokenPayload);
    await this.repository.updateUser(newUser, { refresh_token: this._hashRefreshToken(refreshToken) });

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
    const user = await this.repository.findUserWithRoleByEmail(normalizedEmail);

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

    const isMatch = await this.bcrypt.compare(password, user.password_hash);
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
    const accessToken = this.tokens.generateAccessToken(tokenPayload);
    const refreshToken = this.tokens.generateRefreshToken(tokenPayload);
    await this.repository.updateUser(user, { refresh_token: this._hashRefreshToken(refreshToken) });

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
      decoded = this.tokens.verifyRefreshToken(oldRefreshToken);
    } catch (_error) {
      const error = new Error('Invalid or expired refresh token');
      error.statusCode = 401;
      throw error;
    }

    const user = await this.repository.findUserWithRoleById(decoded.id);

    if (!user) throw this._invalidRefreshTokenError();

    const presentedDigest = this._hashRefreshToken(oldRefreshToken);
    const storedValue = user.refresh_token;
    const isLegacyRawToken = storedValue === oldRefreshToken;
    const isStoredDigest = this._matchesRefreshTokenDigest(storedValue, presentedDigest);
    if (!isLegacyRawToken && !isStoredDigest) throw this._invalidRefreshTokenError();

    if (user.status === 'locked') {
      const error = new Error('Account has been locked. Please contact support.');
      error.statusCode = 403;
      throw error;
    }

    // Existing raw tokens remain valid until their normal expiry/revocation.
    // Upgrade only the presented session, and only if it is still current.
    if (isLegacyRawToken) {
      const [updatedRows] = await this.repository.upgradeLegacyRefreshToken(user.id, oldRefreshToken, presentedDigest);

      if (updatedRows !== 1) {
        // Another request may have upgraded this same token concurrently. Accept
        // only if it is now stored as the matching digest; logout/revoke remains
        // fail-closed because the latest value will be null or different.
        const latestUser = await this.repository.findUserById(user.id);
        if (!latestUser || !this._matchesRefreshTokenDigest(latestUser.refresh_token, presentedDigest)) {
          throw this._invalidRefreshTokenError();
        }
      }
    }

    const roleName = user.role ? user.role.name : 'customer';
    return {
      accessToken: this.tokens.generateAccessToken({
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
    await this.repository.revokeRefreshToken(userId);
    return { message: 'Logged out successfully' };
  }

  /**
   * Get current user profile
   */
  async getProfile(userId) {
    const user = await this.repository.findProfileById(userId);

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
    const user = await this.repository.findUserById(userId);
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    if (full_name) user.full_name = full_name;
    if (phone !== undefined) user.phone = phone;
    await this.repository.saveUser(user);

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
    const user = await this.repository.findUserById(userId);
    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    const isMatch = await this.bcrypt.compare(current_password, user.password_hash);
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

    const salt = await this.bcrypt.genSalt(10);
    user.password_hash = await this.bcrypt.hash(new_password, salt);
    // A password change is a security boundary: revoke the long-lived session
    // so any previously copied refresh token can no longer mint access tokens.
    user.refresh_token = null;
    await this.repository.saveUser(user);

    return { message: 'Password changed successfully' };
  }

  async forgotPassword(email) {
    const genericResult = {
      message: 'If the email is registered, password reset instructions will be sent.',
    };
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.repository.findUserByEmail(normalizedEmail);

    if (!user || user.status === 'locked') return genericResult;

    const rawToken = this.crypto.randomBytes(32).toString('hex');
    const tokenHash = this.crypto.createHash('sha256').update(rawToken).digest('hex');
    const configuredMinutes = Number.parseInt(
      this.environment.PASSWORD_RESET_EXPIRES_MINUTES || '30',
      10
    );
    const expiresMinutes = Number.isInteger(configuredMinutes) && configuredMinutes > 0
      ? configuredMinutes
      : 30;

    let resetUrl;
    try {
      resetUrl = this._passwordResetUrl(rawToken);
    } catch (error) {
      this.logger.error(`[AUTH] Password reset URL configuration failed: ${error.message}`);
      return genericResult;
    }

    user.reset_token = tokenHash;
    user.reset_token_expires_at = new Date(Date.now() + expiresMinutes * 60 * 1000);
    await this.repository.saveUser(user);

    void this.emailService.sendMail({
      to: user.email,
      subject: '[Airline Booking] Đặt lại mật khẩu',
      html: `
        <h2>Đặt lại mật khẩu</h2>
        <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.</p>
        <p><a href="${resetUrl}">Đặt lại mật khẩu</a></p>
        <p>Liên kết này hết hạn sau ${expiresMinutes} phút. Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>
      `,
    }).catch((error) => {
      // Never expose provider availability only for registered accounts.
      // Operational failures remain server-side while the public response is uniform.
      this.logger.error(`[AUTH] Password reset email failed: ${error.message}`);
    });

    return genericResult;
  }

  async resetPassword(rawToken, newPassword) {
    const tokenHash = this.crypto.createHash('sha256').update(rawToken).digest('hex');
    const passwordHash = await this.bcrypt.hash(newPassword, 10);
    const [updatedRows] = await this.repository.consumePasswordReset(tokenHash, passwordHash);

    if (updatedRows !== 1) {
      const error = new Error('Reset token is invalid or has expired');
      error.statusCode = 400;
      throw error;
    }

    return { message: 'Password reset successfully. Please log in again.' };
  }

}

module.exports = AuthService;
