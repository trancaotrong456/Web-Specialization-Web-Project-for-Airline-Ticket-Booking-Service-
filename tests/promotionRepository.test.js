const test = require('node:test');
const assert = require('node:assert/strict');
const { SequelizePromotionRepository } = require('../modules/promotion/promotion.repository');

test('Promotion repository preserves Sequelize list query and JavaScript coercion', async () => {
  const lte = Symbol('lte');
  const gte = Symbol('gte');
  const calls = [];
  const rows = [{ id: 2 }];
  const repository = new SequelizePromotionRepository({
    Promotion: { findAndCountAll: async (options) => { calls.push(options); return { count: 3, rows }; } },
    Op: { lte, gte },
  });
  const now = new Date('2026-10-13T00:00:00.000Z');
  assert.deepEqual(await repository.findPage({ page: '2', limit: '7', active_only: 'false', now }), { count: 3, rows });
  assert.deepEqual(calls[0], {
    where: { valid_from: { [lte]: now }, valid_to: { [gte]: now } },
    limit: 7, offset: 7, order: [['valid_from', 'DESC']],
  });
  await repository.findPage({ page: 1, limit: 20, active_only: false });
  assert.deepEqual(calls[1], { where: {}, limit: 20, offset: 0, order: [['valid_from', 'DESC']] });
});

test('Promotion repository delegates detail, code lookup and writes without normalizing data', async () => {
  const calls = [];
  const promo = {
    async update(data) { calls.push(['update', data]); return this; },
    async destroy() { calls.push(['destroy']); },
  };
  const repository = new SequelizePromotionRepository({
    Promotion: {
      findByPk: async (id) => { calls.push(['findByPk', id]); return promo; },
      findOne: async (options) => { calls.push(['findOne', options]); return promo; },
      create: async (data) => { calls.push(['create', data]); return promo; },
    },
    Op: {},
  });
  const data = { code: ' raw ' };
  assert.equal(await repository.findById('4'), promo);
  assert.equal(await repository.findByCode(' raw '), promo);
  assert.equal(await repository.create(data), promo);
  assert.equal(await repository.update(promo, data), promo);
  await repository.delete(promo);
  assert.deepEqual(calls, [
    ['findByPk', '4'], ['findOne', { where: { code: ' raw ' } }],
    ['create', data], ['update', data], ['destroy'],
  ]);
});
