'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAncillariesModule } = require('../modules/ancillaries');

test('Ancillaries module exposes customer offers and Admin-only CRUD routes once', () => {
  const marks = [];
  const guards = { authenticate: (_req, _res, next) => { marks.push('auth'); next(); }, authorize: (role) => (_req, _res, next) => { marks.push(role); next(); } };
  const service = { listOffers: async () => [], listServices: async () => [], saveService: async () => ({}), deactivateService: async () => ({}), saveOffer: async () => ({}), deactivateOffer: async () => ({}) };
  const module = createAncillariesModule({ service, guards });
  const routePaths = module.router.stack.filter((layer) => layer.route).map((layer) => `${Object.keys(layer.route.methods)[0]} ${layer.route.path}`);
  assert.deepEqual(routePaths, ['get /', 'get /admin/services', 'post /admin/services', 'put /admin/services/:id', 'delete /admin/services/:id', 'get /admin/offers', 'post /admin/offers', 'put /admin/offers/:id', 'delete /admin/offers/:id']);
  for (const path of routePaths.slice(1)) assert.equal(path.includes('admin'), true);
  assert.equal(module.controller.service, service);
});
