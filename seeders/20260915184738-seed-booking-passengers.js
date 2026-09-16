'use strict';
const { faker } = require('@faker-js/faker');

const TOTAL_PASSENGERS = 100_000;
const BATCH_SIZE = 5_000;

function makePassengersBatch(startId, size) {
  const rows = [];
  const seatLetters = ['A', 'B', 'C', 'D', 'E', 'F'];
  const now = new Date();

  for (let i = 0; i < size; i++) {
    const id = startId + i;
    const booking_id = id; // Mỗi booking có ít nhất 1 hành khách
    const seatRow = faker.number.int({ min: 1, max: 40 });
    const seatLetter = faker.helpers.arrayElement(seatLetters);

    rows.push({
      id,
      booking_id,
      passenger_name: faker.person.fullName(),
      passport_no: faker.helpers.arrayElement(['0', 'C', 'B']) + faker.string.numeric(8),
      seat_no: `${seatRow}${seatLetter}`,
      created_at: now,
      updated_at: now,
    });
  }
  return rows;
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    for (let start = 0; start < TOTAL_PASSENGERS; start += BATCH_SIZE) {
      const size = Math.min(BATCH_SIZE, TOTAL_PASSENGERS - start);
      await queryInterface.bulkInsert('booking_passengers', makePassengersBatch(start + 1, size), {});
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('booking_passengers', null, {});
  },
};
