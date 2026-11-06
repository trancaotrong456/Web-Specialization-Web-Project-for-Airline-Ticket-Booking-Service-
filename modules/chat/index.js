'use strict';

const express = require('express');
const ChatService = require('./chat.service');
const ChatController = require('./chat.controller');

function createChatModule({ expressModule = express, service, controller } = {}) {
  const resolvedService = service || new ChatService();
  const resolvedController = controller || new ChatController({ service: resolvedService });

  const router = expressModule.Router();
  const bind = (method) => resolvedController[method].bind(resolvedController);

  router.post('/message', bind('sendMessage'));
  router.post('/', bind('sendMessage')); // Tương thích POST /api/v1/chat
  router.get('/suggestions', bind('getSuggestions'));
  router.get('/policies', bind('getPolicies'));

  return { router, service: resolvedService, controller: resolvedController };
}

let defaultChatModule;
function getDefaultChatModule() {
  if (!defaultChatModule) {
    defaultChatModule = createChatModule();
  }
  return defaultChatModule;
}

module.exports = { createChatModule, getDefaultChatModule };
