const express = require('express');
const FareClassService = require('./fareClass.service');
const FareClassController = require('./fareClass.controller');

function createFareClassModule({ expressModule = express, repository, service, controller, guards, validation, validators } = {}) {
  const resolvedService = service || (repository ? new FareClassService({ repository }) : undefined);
  const resolvedController = controller || (resolvedService ? new FareClassController({ service: resolvedService }) : undefined);
  if (!resolvedController || typeof guards?.authenticate !== 'function' || typeof guards?.authorize !== 'function' || typeof validation?.validate !== 'function' ||
      !validators?.createFareClassValidator || !validators?.updateFareClassValidator || !validators?.fareClassIdParamValidator || !validators?.flightIdParamValidator) {
    throw new TypeError('controller, guards, validation and validators are required');
  }
  for (const method of ['getByFlight', 'getById', 'create', 'update', 'delete']) {
    if (typeof resolvedController[method] !== 'function') throw new TypeError(`controller.${method} must be a function`);
  }
  const router = expressModule.Router();
  const bind = (method) => resolvedController[method].bind(resolvedController);
  router.get('/flight/:flightId', validators.flightIdParamValidator, validation.validate, bind('getByFlight'));
  router.get('/:id', validators.fareClassIdParamValidator, validation.validate, bind('getById'));
  router.post('/', guards.authenticate, guards.authorize('admin', 'staff'), validators.createFareClassValidator, validation.validate, bind('create'));
  router.put('/:id', guards.authenticate, guards.authorize('admin', 'staff'), validators.fareClassIdParamValidator, validators.updateFareClassValidator, validation.validate, bind('update'));
  router.delete('/:id', guards.authenticate, guards.authorize('admin'), validators.fareClassIdParamValidator, validation.validate, bind('delete'));
  return { router, repository, service: resolvedService, controller: resolvedController };
}

function getDefaultFareClassModule() { return require('../../application/buildContainer').getDefaultFareClassModule(); }

module.exports = { createFareClassModule, getDefaultFareClassModule };
