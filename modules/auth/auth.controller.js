const ApiResponse = require('../../utils/apiResponse');

class AuthController {
  constructor({ service, apiResponse = ApiResponse } = {}) {
    if (!service) throw new TypeError('An Auth service is required');
    this.service = service;
    this.apiResponse = apiResponse;
  }

  async register(req, res, next) {
    try {
      const result = await this.service.register(req.body);
      return this.apiResponse.created(res, result, 'User registered successfully');
    } catch (error) {
      next(error);
    }
  }

  async login(req, res, next) {
    try {
      const result = await this.service.login(req.body);
      return this.apiResponse.success(res, result, 'Login successful');
    } catch (error) {
      next(error);
    }
  }

  async refreshToken(req, res, next) {
    try {
      const result = await this.service.refreshToken(req.body.refreshToken);
      return this.apiResponse.success(res, result, 'Access token refreshed successfully');
    } catch (error) {
      next(error);
    }
  }

  async logout(req, res, next) {
    try {
      const result = await this.service.logout(req.user.id);
      return this.apiResponse.success(res, result, 'Logged out successfully');
    } catch (error) {
      next(error);
    }
  }

  async getMe(req, res, next) {
    try {
      const user = await this.service.getProfile(req.user.id);
      return this.apiResponse.success(res, user, 'Profile retrieved successfully');
    } catch (error) {
      next(error);
    }
  }

  async updateProfile(req, res, next) {
    try {
      const result = await this.service.updateProfile(req.user.id, req.body);
      return this.apiResponse.success(res, result, 'Profile updated successfully');
    } catch (error) {
      next(error);
    }
  }

  async changePassword(req, res, next) {
    try {
      const result = await this.service.changePassword(req.user.id, req.body);
      return this.apiResponse.success(res, result, 'Password changed successfully');
    } catch (error) {
      next(error);
    }
  }

  async forgotPassword(req, res, next) {
    try {
      const result = await this.service.forgotPassword(req.body.email);
      return this.apiResponse.success(res, result, 'Password reset request accepted');
    } catch (error) {
      next(error);
    }
  }

  async resetPassword(req, res, next) {
    try {
      const result = await this.service.resetPassword(req.body.token, req.body.new_password);
      return this.apiResponse.success(res, result, 'Password reset successfully');
    } catch (error) {
      next(error);
    }
  }

}

module.exports = AuthController;
