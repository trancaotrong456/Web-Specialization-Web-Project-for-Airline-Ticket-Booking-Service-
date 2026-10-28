const test = require('node:test');
const assert = require('node:assert/strict');
const models = require('../models');
const promotionService = require('../services/promotion.service');

const validPromotion = (overrides = {}) => ({
  code: 'SALE20',
  discount_type: 'percent',
  discount_value: 20,
  valid_from: '2026-10-01T00:00:00.000Z',
  valid_to: '2026-11-01T00:00:00.000Z',
  max_uses: 100,
  ...overrides,
});

test('promotion creation validates discount, dates, and max uses', async (t) => {
  const create = t.mock.method(models.Promotion, 'create', async (values) => values);

  await assert.rejects(promotionService.create(validPromotion({ discount_value: -1 })), /greater than 0/);
  await assert.rejects(promotionService.create(validPromotion({ discount_value: 101 })), /must not exceed 100/);
  await assert.rejects(
    promotionService.create(validPromotion({ valid_to: '2026-09-01T00:00:00.000Z' })),
    /valid_to must be after valid_from/,
  );
  await assert.rejects(promotionService.create(validPromotion({ max_uses: -1 })), /positive integer/);
  assert.equal(create.mock.callCount(), 0);

  const result = await promotionService.create(validPromotion({ used_count: 999 }));
  assert.equal(result.used_count, undefined);
  assert.equal(result.discount_value, 20);
  assert.equal(create.mock.callCount(), 1);
});

test('promotion update validates the merged record and does not update used_count', async (t) => {
  let updatedValues;
  const promo = {
    ...validPromotion(),
    used_count: 4,
    get: () => ({ ...validPromotion(), used_count: 4 }),
    async update(values) { updatedValues = values; return this; },
  };
  t.mock.method(models.Promotion, 'findByPk', async () => promo);

  await assert.rejects(promotionService.update(1, { discount_value: 150 }), /must not exceed 100/);
  await assert.rejects(promotionService.update(1, { max_uses: 0 }), /positive integer/);
  await promotionService.update(1, { discount_value: 25, used_count: 0 });
  assert.deepEqual(updatedValues, { discount_value: 25 });
});
