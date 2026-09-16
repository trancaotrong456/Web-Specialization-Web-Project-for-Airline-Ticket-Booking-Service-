'use strict';
const { faker } = require('@faker-js/faker');

const TOTAL_PROMOTIONS = 100_000;
const BATCH_SIZE = 5_000;

function makePromotionsBatch(startId, size) {
  const rows = [];
  const now = new Date();
  for (let i = 0; i < size; i++) {
    const id = startId + i;
    const isPercent = id % 2 === 0;
    const discount_type = isPercent ? 'percent' : 'amount';
    const discount_value = isPercent
      ? faker.number.int({ min: 5, max: 40 })
      : faker.number.int({ min: 50_000, max: 500_000 });

    const validFrom = faker.date.between({ from: '2025-01-01', to: '2025-12-31' });
    const validTo = faker.date.between({ from: '2026-01-01', to: '2026-12-31' });
    const max_uses = faker.helpers.arrayElement([100, 500, 1000, null]);
    const used_count = faker.number.int({ min: 0, max: 50 });

    rows.push({
      id,
      code: `PROMO${String(id).padStart(6, '0')}`,
      discount_type,
      discount_value,
      valid_from: validFrom,
      valid_to: validTo,
      max_uses,
      used_count,
      created_at: now,
      updated_at: now,
    });
  }
  return rows;
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    for (let start = 0; start < TOTAL_PROMOTIONS; start += BATCH_SIZE) {
      const size = Math.min(BATCH_SIZE, TOTAL_PROMOTIONS - start);
      await queryInterface.bulkInsert('promotions', makePromotionsBatch(start + 1, size), {});
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('promotions', null, {});
  },
};
