'use strict';
const { faker } = require('@faker-js/faker');

const TOTAL_PAYMENTS = 100_000;
const BATCH_SIZE = 5_000;

function makePaymentsBatch(startId, size) {
  const rows = [];
  for (let i = 0; i < size; i++) {
    const id = startId + i;
    const booking_id = id;
    const status = faker.helpers.weightedArrayElement([
      { weight: 70, value: 'success' },
      { weight: 15, value: 'pending' },
      { weight: 10, value: 'failed' },
      { weight: 5,  value: 'refunded' },
    ]);
    const method = faker.helpers.arrayElement(['vnpay', 'momo']);
    const createdAt = faker.date.between({ from: '2025-01-01', to: new Date() });
    const paidAt = status === 'success' ? new Date(createdAt.getTime() + 5 * 60 * 1000) : null;

    rows.push({
      id,
      booking_id,
      amount: faker.number.int({ min: 800_000, max: 6_000_000 }),
      payment_method: method,
      status,
      transaction_ref: `TXN${String(id).padStart(9, '0')}`,
      paid_at: paidAt,
      created_at: createdAt,
      updated_at: new Date(),
    });
  }
  return rows;
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    for (let start = 0; start < TOTAL_PAYMENTS; start += BATCH_SIZE) {
      const size = Math.min(BATCH_SIZE, TOTAL_PAYMENTS - start);
      await queryInterface.bulkInsert('payments', makePaymentsBatch(start + 1, size), {});
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('payments', null, {});
  },
};
