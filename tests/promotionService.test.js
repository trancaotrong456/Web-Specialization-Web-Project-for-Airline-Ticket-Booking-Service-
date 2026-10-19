const test = require('node:test');
const assert = require('node:assert/strict');
const PromotionService = require('../modules/promotion/promotion.service');

const fixedNow = () => new Date('2026-10-13T12:00:00.000Z');

test('Promotion service retains raw pagination inputs and truthy active_only', async () => {
  const calls = [];
  const rows = [{ id: 1 }];
  const service = new PromotionService({
    repository: { findPage: async (query) => { calls.push(query); return { count: 1, rows }; } },
    now: fixedNow,
  });
  assert.deepEqual(await service.getAll({ page: '2', limit: '7', active_only: 'false' }), {
    total: 1, page: '2', limit: '7', data: rows,
  });
  assert.deepEqual(calls[0], { page: '2', limit: '7', active_only: 'false', now: fixedNow() });
  await service.getAll({ active_only: false });
  assert.deepEqual(calls[1], { page: 1, limit: 20, active_only: false, now: undefined });
});

test('Promotion code validation preserves inclusive time boundaries and usage limits', async () => {
  let promo;
  const service = new PromotionService({
    repository: { findByCode: async () => promo }, now: fixedNow,
  });
  await assert.rejects(service.validateCode('MISSING'), (error) => error.statusCode === 404 && error.message === 'Promotion code not found');
  promo = { valid_from: '2026-10-13T12:00:00.000Z', valid_to: '2026-10-13T12:00:00.000Z', max_uses: null, used_count: 99 };
  assert.equal(await service.validateCode('BOUNDARY'), promo);
  promo = { ...promo, valid_from: '2026-10-13T12:00:01.000Z' };
  await assert.rejects(service.validateCode('EARLY'), (error) => error.statusCode === 400 && error.message === 'Promotion code expired or not yet active');
  promo = { ...promo, valid_from: '2026-10-13T11:00:00.000Z', valid_to: '2026-10-13T11:59:59.000Z' };
  await assert.rejects(service.validateCode('LATE'), (error) => error.statusCode === 400);
  promo = { ...promo, valid_to: '2026-10-13T13:00:00.000Z', max_uses: 2, used_count: 2 };
  await assert.rejects(service.validateCode('USED'), (error) => error.statusCode === 400 && error.message === 'Promotion code usage limit reached');
});

test('Promotion service keeps 404, raw payload and instance update/delete behavior', async () => {
  const calls = [];
  const promo = { id: 4 };
  const data = { code: ' raw ' };
  const service = new PromotionService({ repository: {
    findById: async (id) => { calls.push(['findById', id]); return id === 'missing' ? null : promo; },
    create: async (value) => { calls.push(['create', value]); return value; },
    update: async (instance, value) => { calls.push(['update', instance, value]); return instance; },
    delete: async (instance) => { calls.push(['delete', instance]); },
  } });
  assert.equal(await service.create(data), data);
  assert.equal(await service.update('4', data), promo);
  assert.deepEqual(await service.delete('4'), { message: 'Promotion deleted' });
  await assert.rejects(service.getById('missing'), (error) => error.statusCode === 404 && error.message === 'Promotion not found');
  assert.deepEqual(calls, [['create', data], ['findById', '4'], ['update', promo, data], ['findById', '4'], ['delete', promo], ['findById', 'missing']]);
});
