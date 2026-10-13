const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const { Promotion } = require('../models');
const service = require('../services/promotion.service');
const router = require('../routes/promotion.route');

test('legacy Promotion list keeps truthy active_only, coercion, ordering, and raw pagination fields', async (t) => {
  const calls = [];
  t.mock.method(Promotion, 'findAndCountAll', async (options) => {
    calls.push(options);
    return { count: 2, rows: [{ id: 1 }] };
  });
  const result = await service.getAll({ page: '2', limit: '7', active_only: 'false' });
  assert.deepEqual(result, { total: 2, page: '2', limit: '7', data: [{ id: 1 }] });
  assert.equal(calls[0].limit, 7);
  assert.equal(calls[0].offset, 7);
  assert.deepEqual(calls[0].order, [['valid_from', 'DESC']]);
  assert.ok(calls[0].where.valid_from[Op.lte] instanceof Date);
  assert.ok(calls[0].where.valid_to[Op.gte] instanceof Date);
  await service.getAll({ active_only: false });
  assert.deepEqual(calls[1], { where: {}, limit: 20, offset: 0, order: [['valid_from', 'DESC']] });
});

test('legacy Promotion route places public validation before detail and protects only writes', () => {
  const routes = router.stack.filter((layer) => layer.route).map((layer) => layer.route);
  assert.deepEqual(routes.map((route) => [route.path, Object.keys(route.methods)[0]]), [
    ['/', 'get'], ['/validate/:code', 'get'], ['/:id', 'get'],
    ['/', 'post'], ['/:id', 'put'], ['/:id', 'delete'],
  ]);
  assert.deepEqual(routes.map((route) => route.stack.length), [1, 1, 1, 3, 3, 3]);
});

test('legacy Promotion list still requires a query argument for direct callers', async () => {
  await assert.rejects(service.getAll(), TypeError);
});
