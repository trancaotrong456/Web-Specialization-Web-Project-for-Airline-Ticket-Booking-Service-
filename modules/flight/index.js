const express = require('express');
const FlightService = require('./flight.service');
const FlightController = require('./flight.controller');

function createFlightModule({ expressModule = express, repository, service, controller, guards, validation, validators, getIO } = {}) {
  const resolvedService = service || (repository ? new FlightService({ repository, getIO }) : undefined);
  const resolvedController = controller || (resolvedService ? new FlightController({ service: resolvedService }) : undefined);
  if (!resolvedController || typeof guards?.authenticate !== 'function' || typeof guards?.authorize !== 'function' ||
      typeof validation?.validate !== 'function' || !validators?.searchFlightValidator || !validators?.createFlightValidator || !validators?.updateFlightValidator) {
    throw new TypeError('controller, guards, validation and validators are required');
  }
  for (const method of ['searchFlights', 'getFlightById', 'getAllFlights', 'createFlight', 'updateFlight', 'cancelFlight', 'deleteFlight']) {
    if (typeof resolvedController[method] !== 'function') throw new TypeError(`controller.${method} must be a function`);
  }
  const router = expressModule.Router();
  const bind = (method) => resolvedController[method].bind(resolvedController);
  router.get('/search', validators.searchFlightValidator, validation.validate, bind('searchFlights'));
  router.get('/:id', bind('getFlightById'));
  router.get('/', guards.authenticate, guards.authorize('admin', 'staff'), bind('getAllFlights'));
  router.post('/', guards.authenticate, guards.authorize('admin'), validators.createFlightValidator, validation.validate, bind('createFlight'));
  router.put('/:id', guards.authenticate, guards.authorize('admin', 'staff'), validators.updateFlightValidator, validation.validate, bind('updateFlight'));
  router.put('/:id/cancel', guards.authenticate, guards.authorize('admin', 'staff'), bind('cancelFlight'));
  router.delete('/:id', guards.authenticate, guards.authorize('admin'), bind('deleteFlight'));
  return { router, repository, service: resolvedService, controller: resolvedController };
}

function getDefaultFlightModule() { return require('../../application/buildContainer').getDefaultFlightModule(); }

module.exports = { createFlightModule, getDefaultFlightModule };
