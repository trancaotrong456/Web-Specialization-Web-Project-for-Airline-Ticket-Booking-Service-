const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createAirlineModule } = require('../modules/airline');

test('Airline module factory uses injected controller, guards, validators, and validation middleware', () => {
  const calls = [];
  const controller = Object.fromEntries(['getAll', 'getById', 'create', 'update', 'delete', 'getStatistics'].map((name) => [
    name,
    function handler() { calls.push(name); },
  ]));
  const authenticate = function authenticate() {};
  const adminGuard = function adminGuard() {};
  const validate = function validate() {};
  const authorize = (role) => {
    assert.equal(role, 'admin');
    return adminGuard;
  };
  const validators = {
    listAirlineValidator: [function listValidator() {}],
    airlineIdValidator: [function idValidator() {}],
    createAirlineValidator: [function createValidator() {}],
    updateAirlineValidator: [function updateValidator() {}],
  };

  const module = createAirlineModule({
    expressModule: express,
    controller,
    guards: { authenticate, authorize },
    validation: { validate },
    validators,
  });
  const routes = module.router.stack.filter((layer) => layer.route);

  assert.deepEqual(routes.map((layer) => [layer.route.path, Object.keys(layer.route.methods)[0]]), [
    ['/statistics', 'get'], ['/', 'get'], ['/:id', 'get'], ['/', 'post'], ['/:id', 'put'], ['/:id', 'delete'],
  ]);
  assert.equal(routes[0].route.stack[0].handle, authenticate);
  assert.equal(routes[0].route.stack[1].handle, adminGuard);
  assert.equal(routes[1].route.stack[0].handle, validators.listAirlineValidator[0]);
  assert.equal(routes[1].route.stack[1].handle, validate);
  assert.equal(routes[3].route.stack[0].handle, authenticate);
  assert.equal(routes[3].route.stack[1].handle, adminGuard);
  assert.equal(routes[3].route.stack[2].handle, validators.createAirlineValidator[0]);
  assert.equal(module.controller, controller);
  assert.deepEqual(calls, []);
});

test('Airline module factory rejects incomplete dependencies rather than loading hidden defaults', () => {
  assert.throws(() => createAirlineModule({}), /controller.*guards.*validation.*validators/i);
});
