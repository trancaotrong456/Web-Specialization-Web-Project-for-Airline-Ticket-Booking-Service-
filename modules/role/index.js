const express = require('express');
const RoleService = require('./role.service');
const RoleController = require('./role.controller');
function createRoleModule({ expressModule = express, repository, service, controller, guards, validation, validators } = {}) {
  const resolvedService = service || (repository ? new RoleService({ repository }) : undefined);
  const resolvedController = controller || (resolvedService ? new RoleController({ service: resolvedService }) : undefined);
  if (!resolvedController || typeof guards?.authenticate !== 'function' || typeof guards?.authorize !== 'function' ||
      typeof validation?.validate !== 'function' || !validators?.roleIdValidator || !validators?.createRoleValidator || !validators?.updateRoleValidator) {
    throw new TypeError('controller, guards, validation and validators are required');
  }
  for (const method of ['createRole', 'getAllRoles', 'getRoleById', 'updateRole', 'deleteRole']) {
    if (typeof resolvedController[method] !== 'function') throw new TypeError(`controller.${method} must be a function`);
  }
  const router = expressModule.Router();
  const bind = (method) => resolvedController[method].bind(resolvedController);
  router.use(guards.authenticate, guards.authorize('admin'));
  router.post('/', validators.createRoleValidator, validation.validate, bind('createRole'));
  router.get('/', bind('getAllRoles'));
  router.get('/:id', validators.roleIdValidator, validation.validate, bind('getRoleById'));
  router.put('/:id', validators.updateRoleValidator, validation.validate, bind('updateRole'));
  router.delete('/:id', validators.roleIdValidator, validation.validate, bind('deleteRole'));
  return { router, repository, service: resolvedService, controller: resolvedController };
}
function getDefaultRoleModule() { return require('../../application/buildContainer').getDefaultRoleModule(); }
module.exports = { createRoleModule, getDefaultRoleModule };
