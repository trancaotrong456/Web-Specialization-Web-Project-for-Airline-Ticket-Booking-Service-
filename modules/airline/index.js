const express = require('express');
const AirlineService = require('./airline.service');
const AirlineController = require('./airline.controller');

function createAirlineModule({
  expressModule = express,
  repository,
  service,
  controller,
  guards,
  validation,
  validators,
  apiResponse,
} = {}) {
  const resolvedService = service || (repository ? new AirlineService({ repository }) : undefined);
  const resolvedController = controller || (
    resolvedService ? new AirlineController({ service: resolvedService, apiResponse }) : undefined
  );

  if (
    !resolvedController ||
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
    if (typeof resolvedController[method] !== 'function') {
      throw new TypeError(`controller.${method} must be a function`);
    }
  }

  const router = expressModule.Router();
  const bind = (method) => resolvedController[method].bind(resolvedController);

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

  return { router, repository, service: resolvedService, controller: resolvedController };
}

function getDefaultAirlineModule() {
  return require('../../application/buildContainer').getDefaultAirlineModule();
}

module.exports = { createAirlineModule, getDefaultAirlineModule };
