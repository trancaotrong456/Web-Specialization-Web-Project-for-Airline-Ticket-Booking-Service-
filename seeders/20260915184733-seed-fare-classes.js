'use strict';
const { faker } = require('@faker-js/faker');

const TOTAL_FLIGHTS = 100_000;
const BATCH_SIZE = 5_000;

function makeFareClassesBatch(flightStartId, count) {
  const rows = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const flight_id = flightStartId + i;
    // Hạng phổ thông cho chuyến bay này (id tương ứng flight_id)
    const basePrice = faker.number.int({ min: 800_000, max: 5_000_000 });
    rows.push({
      id: flight_id,
      flight_id,
      class_name: 'Phổ thông',
      price: basePrice,
      seat_quota: 150,
      created_at: now,
      updated_at: now,
    });
  }
  return rows;
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    for (let start = 0; start < TOTAL_FLIGHTS; start += BATCH_SIZE) {
      const size = Math.min(BATCH_SIZE, TOTAL_FLIGHTS - start);
      await queryInterface.bulkInsert('fare_classes', makeFareClassesBatch(start + 1, size), {});
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('fare_classes', null, {});
  },
};
