'use strict';
const { faker } = require('@faker-js/faker');

const TOTAL_BOOKINGS = 100_000;
const BATCH_SIZE = 5_000;

function makeBookingsBatch(startId, size) {
  const rows = [];
  for (let i = 0; i < size; i++) {
    const id = startId + i;
    const isGuest = id % 10 === 0;
    const user_id = isGuest ? null : ((id % 100_000) + 1);
    const flight_id = ((id % 100_000) + 1);
    const fare_class_id = flight_id; // Khớp với fare_class_id đã tạo ở seeder trước
    const hasPromo = id % 3 === 0;
    const promotion_id = hasPromo ? ((id % 100_000) + 1) : null;

    const status = faker.helpers.weightedArrayElement([
      { weight: 60, value: 'confirmed' },
      { weight: 15, value: 'pending_payment' },
      { weight: 10, value: 'cancelled' },
      { weight: 10, value: 'expired' },
      { weight: 5,  value: 'holding' },
    ]);

    const createdAt = faker.date.between({ from: '2025-01-01', to: new Date() });
    const holdExpiresAt = new Date(createdAt.getTime() + 15 * 60 * 1000);

    // booking_code tối đa 10 ký tự: BK + 8 số = 10 ký tự
    const booking_code = `BK${String(id).padStart(8, '0')}`;

    rows.push({
      id,
      booking_code,
      user_id,
      flight_id,
      fare_class_id,
      promotion_id,
      status,
      total_amount: faker.number.int({ min: 800_000, max: 6_000_000 }),
      hold_expires_at: holdExpiresAt,
      guest_email: isGuest ? faker.internet.email() : null,
      created_at: createdAt,
      updated_at: new Date(),
    });
  }
  return rows;
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    for (let start = 0; start < TOTAL_BOOKINGS; start += BATCH_SIZE) {
      const size = Math.min(BATCH_SIZE, TOTAL_BOOKINGS - start);
      await queryInterface.bulkInsert('bookings', makeBookingsBatch(start + 1, size), {});
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('bookings', null, {});
  },
};
