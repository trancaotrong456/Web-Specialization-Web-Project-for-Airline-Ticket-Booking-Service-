'use strict';
const express = require('express');
const SeatSelectionController = require('./seatSelection.controller');
const { SeatSelectionService } = require('./seatSelection.service');
function createSeatSelectionModule({ expressModule = express, repository, transactionManager, service, controller, guards } = {}) {
  const resolvedService = service || (repository && transactionManager ? new SeatSelectionService({ repository, transactionManager }) : undefined);
  const resolvedController = controller || (resolvedService ? new SeatSelectionController({ service: resolvedService }) : undefined);
  if (!resolvedController || typeof guards?.authenticate !== 'function' || typeof guards?.authorize !== 'function') throw new TypeError('Seat selection controller and guards are required');
  const router = expressModule.Router(); const bind = (method) => resolvedController[method].bind(resolvedController);
  router.get('/templates', guards.authenticate, guards.authorize('admin'), bind('listTemplates'));
  router.post('/templates', guards.authenticate, guards.authorize('admin'), bind('createTemplate'));
  router.put('/templates/:id', guards.authenticate, guards.authorize('admin'), bind('updateTemplate'));
  router.delete('/templates/:id', guards.authenticate, guards.authorize('admin'), bind('deleteTemplate'));
  router.put('/flights/:flightId/map', guards.authenticate, guards.authorize('admin'), bind('assignFlight'));
  router.get('/flights/:flightId/map', bind('getFlightMap'));
  return { repository, service: resolvedService, controller: resolvedController, router };
}
module.exports = { createSeatSelectionModule };
