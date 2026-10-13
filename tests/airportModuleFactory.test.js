const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createAirportModule } = require('../modules/airport');

test('Airport module factory builds an injected controller/service/repository graph and exact route order', () => {
  const repository = {};
  const authenticate = () => {};
  const adminGuards = [];
  const authorize = (role) => {
    assert.equal(role, 'admin');
    const guard = () => {};
    adminGuards.push(guard);
    return guard;
  };
  const module = createAirportModule({
    expressModule: express,
    repository,
    guards: { authenticate, authorize },
  });
  const routes = module.router.stack.filter((layer) => layer.route);

  assert.equal(module.repository, repository);
  assert.equal(module.service.repository, repository);
  assert.equal(module.controller.service, module.service);
  assert.deepEqual(routes.map((layer) => [layer.route.path, Object.keys(layer.route.methods)[0]]), [
    ['/', 'get'], ['/:id', 'get'], ['/', 'post'], ['/:id', 'put'], ['/:id', 'delete'],
  ]);
  assert.equal(routes[0].route.stack.length, 1);
  assert.equal(routes[1].route.stack.length, 1);
  assert.equal(adminGuards.length, 3);
  routes.slice(2).forEach((route, index) => {
    assert.equal(route.route.stack[0].handle, authenticate);
    assert.equal(route.route.stack[1].handle, adminGuards[index]);
    assert.equal(route.route.stack.length, 3);
  });
});

test('Airport module factory rejects incomplete dependencies', () => {
  assert.throws(() => createAirportModule({}), /controller.*guards/i);
});
