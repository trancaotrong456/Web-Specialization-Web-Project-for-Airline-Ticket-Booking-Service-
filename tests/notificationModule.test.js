const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createNotificationModule } = require('../modules/notification');

test('Notification module binds injected service and requires authentication for every recipient endpoint', () => {
  const repository = {};
  const authenticate = () => {};
  const authorize = () => () => {};
  const module = createNotificationModule({ expressModule: express, repository, guards: { authenticate, authorize } });
  const routes = module.router.stack.filter((layer) => layer.route);

  assert.equal(module.repository, repository);
  assert.equal(module.service.repository, repository);
  assert.equal(module.controller.service, module.service);
  assert.deepEqual(routes.map(({ route }) => [route.path, Object.keys(route.methods)[0]]), [
    ['/', 'get'], ['/unread-count', 'get'], ['/:id/read', 'patch'],
  ]);
  routes.forEach(({ route }) => {
    assert.equal(route.stack[0].handle, authenticate);
  });
});

test('Notification module refuses to expose inbox routes without authentication guard', () => {
  assert.throws(() => createNotificationModule({ repository: {}, guards: {} }), /guards/i);
});
