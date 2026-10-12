const express = require('express');

function createAirlineModule({ expressModule = express, controller, guards, validation, validators } = {}) {
  if (
    !controller ||
    typeof guards?.authenticate !== 'function' ||
    typeof guards?.authorize !== 'function' ||
    typeof validation?.validate !== 'function' ||
    !validators?.listAirlineValidator ||
    !validators?.airlineIdValidator ||
    !validators?.createAirlineValidator ||
    !validators?.updateAirlineValidator
  ) {
    throw new TypeError('controller, guards, validation, and validators are required');
  }

  for (const method of ['getAll', 'getById', 'create', 'update', 'delete']) {
    if (typeof controller[method] !== 'function') {
      throw new TypeError(`controller.${method} must be a function`);
    }
  }

  const router = expressModule.Router();
  const bind = (method) => controller[method].bind(controller);

  router.get('/', validators.listAirlineValidator, validation.validate, bind('getAll'));
  router.get('/:id', validators.airlineIdValidator, validation.validate, bind('getById'));
  router.post(
    '/',
    guards.authenticate,
    guards.authorize('admin'),
    validators.createAirlineValidator,
    validation.validate,
    bind('create'),
  );
  router.put(
    '/:id',
    guards.authenticate,
    guards.authorize('admin'),
    validators.updateAirlineValidator,
    validation.validate,
    bind('update'),
  );
  router.delete(
    '/:id',
    guards.authenticate,
    guards.authorize('admin'),
    validators.airlineIdValidator,
    validation.validate,
    bind('delete'),
  );

  return { router, controller };
}

module.exports = { createAirlineModule };
