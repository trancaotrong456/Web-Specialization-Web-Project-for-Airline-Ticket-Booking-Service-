'use strict';

const express = require('express');
const NotificationService = require('./notification.service');
const NotificationController = require('./notification.controller');

function createNotificationModule({ expressModule = express, repository, service, controller, guards, validation, validators } = {}) {
  const resolvedService = service || (repository ? new NotificationService({ repository }) : undefined);
  const resolvedController = controller || (resolvedService ? new NotificationController({ service: resolvedService }) : undefined);
  if (!resolvedController || typeof guards?.authenticate !== 'function') {
    throw new TypeError('controller and guards.authenticate are required');
  }
  if (validation && typeof validation.validate !== 'function') throw new TypeError('validation.validate must be a function');
  for (const method of ['list', 'unreadCount', 'markRead']) {
    if (typeof resolvedController[method] !== 'function') throw new TypeError(`controller.${method} must be a function`);
  }

  const router = expressModule.Router();
  const bind = (method) => resolvedController[method].bind(resolvedController);
  const validate = (items = []) => [...items, validation?.validate].filter(Boolean);
  router.get('/', guards.authenticate, ...validate(validators?.listNotificationsValidator), bind('list'));
  router.get('/unread-count', guards.authenticate, bind('unreadCount'));
  router.patch('/:id/read', guards.authenticate, ...validate(validators?.notificationIdValidator), bind('markRead'));
  return { router, repository, service: resolvedService, controller: resolvedController };
}

function getDefaultNotificationModule() {
  return require('../../application/buildContainer').getDefaultNotificationModule();
}

module.exports = { createNotificationModule, getDefaultNotificationModule };
