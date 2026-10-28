const express = require('express');
const AirportService = require('./airport.service');
const AirportController = require('./airport.controller');

function createAirportModule({ expressModule = express, repository, service, controller, guards, searchEngine } = {}) {
  const resolvedService = service || (repository ? new AirportService({ repository, searchEngine }) : undefined);
  const resolvedController = controller || (
    resolvedService ? new AirportController({ service: resolvedService }) : undefined
  );

  if (
    !resolvedController ||
    typeof guards?.authenticate !== 'function' ||
    typeof guards?.authorize !== 'function'
  ) {
    throw new TypeError('controller and guards are required');
  }

  for (const method of ['getAll', 'getById', 'create', 'update', 'delete']) {
    if (typeof resolvedController[method] !== 'function') {
      throw new TypeError(`controller.${method} must be a function`);
    }
  }

  const router = expressModule.Router();
  const bind = (method) => resolvedController[method].bind(resolvedController);

  router.get('/', bind('getAll'));
  router.get('/:id', bind('getById'));
  router.post('/', guards.authenticate, guards.authorize('admin'), bind('create'));
  router.put('/:id', guards.authenticate, guards.authorize('admin'), bind('update'));
  router.delete('/:id', guards.authenticate, guards.authorize('admin'), bind('delete'));

  return { router, repository, service: resolvedService, controller: resolvedController };
}

function getDefaultAirportModule() {
  return require('../../application/buildContainer').getDefaultAirportModule();
}

module.exports = { createAirportModule, getDefaultAirportModule };
