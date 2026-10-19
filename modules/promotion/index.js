const express = require('express');
const PromotionService = require('./promotion.service');
const PromotionController = require('./promotion.controller');
function createPromotionModule({ expressModule = express, repository, service, controller, guards, now } = {}) {
  const resolvedService = service || (repository ? new PromotionService({ repository, now }) : undefined);
  const resolvedController = controller || (resolvedService ? new PromotionController({ service: resolvedService }) : undefined);
  if (!resolvedController || typeof guards?.authenticate !== 'function' || typeof guards?.authorize !== 'function') throw new TypeError('controller and guards are required');
  for (const method of ['getAll', 'getById', 'validateCode', 'create', 'update', 'delete']) {
    if (typeof resolvedController[method] !== 'function') throw new TypeError(`controller.${method} must be a function`);
  }
  const router = expressModule.Router();
  const bind = (method) => resolvedController[method].bind(resolvedController);
  router.get('/', bind('getAll'));
  router.get('/validate/:code', bind('validateCode'));
  router.get('/:id', bind('getById'));
  router.post('/', guards.authenticate, guards.authorize('admin'), bind('create'));
  router.put('/:id', guards.authenticate, guards.authorize('admin'), bind('update'));
  router.delete('/:id', guards.authenticate, guards.authorize('admin'), bind('delete'));
  return { router, repository, service: resolvedService, controller: resolvedController };
}
function getDefaultPromotionModule() { return require('../../application/buildContainer').getDefaultPromotionModule(); }
module.exports = { createPromotionModule, getDefaultPromotionModule };
