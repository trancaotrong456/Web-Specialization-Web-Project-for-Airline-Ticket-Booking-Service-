const express = require('express');
const AuthService = require('./auth.service');
const AuthController = require('./auth.controller');

function createAuthModule({ expressModule = express, repository, service, controller, guards, validation, validators,
  bcryptProvider, cryptoProvider, emailProvider, tokenProvider, environment, logger } = {}) {
  const resolvedService = service || (repository ? new AuthService({
    repository, bcryptProvider, cryptoProvider, emailProvider, tokenProvider, environment, logger,
  }) : undefined);
  const resolvedController = controller || (resolvedService ? new AuthController({ service: resolvedService }) : undefined);
  if (!resolvedController || typeof guards?.authenticate !== 'function' || typeof validation?.validate !== 'function' ||
      !validators?.registerValidator || !validators?.loginValidator || !validators?.updateProfileValidator ||
      !validators?.changePasswordValidator || !validators?.refreshTokenValidator ||
      !validators?.forgotPasswordValidator || !validators?.resetPasswordValidator) {
    throw new TypeError('controller, guards, validation and validators are required');
  }
  for (const method of ['register', 'login', 'refreshToken', 'forgotPassword', 'resetPassword', 'logout',
    'getMe', 'updateProfile', 'changePassword']) {
    if (typeof resolvedController[method] !== 'function') throw new TypeError(`controller.${method} must be a function`);
  }
  const router = expressModule.Router();
  const bind = (method) => resolvedController[method].bind(resolvedController);
  router.post('/register', validators.registerValidator, validation.validate, bind('register'));
  router.post('/login', validators.loginValidator, validation.validate, bind('login'));
  router.post('/refresh-token', validators.refreshTokenValidator, validation.validate, bind('refreshToken'));
  router.post('/forgot-password', validators.forgotPasswordValidator, validation.validate, bind('forgotPassword'));
  router.post('/reset-password', validators.resetPasswordValidator, validation.validate, bind('resetPassword'));
  router.post('/logout', guards.authenticate, bind('logout'));
  router.get('/me', guards.authenticate, bind('getMe'));
  router.put('/me', guards.authenticate, validators.updateProfileValidator, validation.validate, bind('updateProfile'));
  router.put('/change-password', guards.authenticate, validators.changePasswordValidator, validation.validate, bind('changePassword'));
  return { router, repository, service: resolvedService, controller: resolvedController };
}

function getDefaultAuthModule() { return require('../../application/buildContainer').getDefaultAuthModule(); }

module.exports = { createAuthModule, getDefaultAuthModule };
