'use strict';

const express = require('express');
const { AncillariesService } = require('./ancillaries.service');
const AncillariesController = require('./ancillaries.controller');

function createAncillariesModule({ expressModule = express, repository, service, controller, guards, transactionManager } = {}) {
  const resolvedService = service || (repository ? new AncillariesService({ repository, transactionManager }) : undefined);
  const resolvedController = controller || (resolvedService ? new AncillariesController({ service: resolvedService }) : undefined);
  if (!resolvedController || typeof guards?.authenticate !== 'function' || typeof guards?.authorize !== 'function') throw new TypeError('Ancillaries controller and guards are required');
  const router = expressModule.Router();
  const bind = (method) => resolvedController[method].bind(resolvedController);
  router.get('/', bind('listOffers'));
  router.get('/admin/services', guards.authenticate, guards.authorize('admin'), bind('listServices'));
  router.post('/admin/services', guards.authenticate, guards.authorize('admin'), bind('createService'));
  router.put('/admin/services/:id', guards.authenticate, guards.authorize('admin'), bind('updateService'));
  router.delete('/admin/services/:id', guards.authenticate, guards.authorize('admin'), bind('deactivateService'));
  router.get('/admin/offers', guards.authenticate, guards.authorize('admin'), bind('listOffersAdmin'));
  router.post('/admin/offers', guards.authenticate, guards.authorize('admin'), bind('createOffer'));
  router.put('/admin/offers/:id', guards.authenticate, guards.authorize('admin'), bind('updateOffer'));
  router.delete('/admin/offers/:id', guards.authenticate, guards.authorize('admin'), bind('deactivateOffer'));
  return { repository, service: resolvedService, controller: resolvedController, router };
}

module.exports = { createAncillariesModule };
