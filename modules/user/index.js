const express = require('express');
const UserService = require('./user.service');
const UserController = require('./user.controller');
function createUserModule({ expressModule = express, repository, service, controller, guards, validation, validators } = {}) {
  const resolvedService = service || (repository ? new UserService({ repository }) : undefined);
  const resolvedController = controller || (resolvedService ? new UserController({ service: resolvedService }) : undefined);
  if (!resolvedController || typeof guards?.authenticate !== 'function' || typeof guards?.authorize !== 'function' ||
      typeof validation?.validate !== 'function' || !validators?.userListValidator || !validators?.userIdValidator ||
      !validators?.updateUserStatusValidator || !validators?.updateUserRoleValidator) {
    throw new TypeError('controller, guards, validation and validators are required');
  }
  for (const method of ['getAllUsers', 'getUserById', 'updateStatus', 'updateRole', 'deleteUser']) {
    if (typeof resolvedController[method] !== 'function') throw new TypeError(`controller.${method} must be a function`);
  }
  const router = expressModule.Router();
  const bind = (method) => resolvedController[method].bind(resolvedController);
  router.use(guards.authenticate, guards.authorize('admin'));
  router.get('/', validators.userListValidator, validation.validate, bind('getAllUsers'));
  router.get('/:id', validators.userIdValidator, validation.validate, bind('getUserById'));
  router.put('/:id/status', validators.updateUserStatusValidator, validation.validate, bind('updateStatus'));
  router.put('/:id/role', validators.updateUserRoleValidator, validation.validate, bind('updateRole'));
  router.delete('/:id', validators.userIdValidator, validation.validate, bind('deleteUser'));
  return { router, repository, service: resolvedService, controller: resolvedController };
}
function getDefaultUserModule() { return require('../../application/buildContainer').getDefaultUserModule(); }
module.exports = { createUserModule, getDefaultUserModule };
