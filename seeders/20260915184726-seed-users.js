'use strict';
const { faker } = require('@faker-js/faker');

const TOTAL = 100_000;
const BATCH  = 5_000;

function makeBatch(startId, size) {
  const rows = [];
  for (let i = 0; i < size; i++) {
    const id = startId + i;
    // 1 admin (id=1), 10 staff, phần còn lại customer
    let role_id = 3;
    if (id === 1) role_id = 1;
    else if (id <= 11) role_id = 2;

    rows.push({
      role_id,
      full_name:   faker.person.fullName(),
      email:       faker.internet.email({ firstName: faker.string.alphanumeric(6), lastName: String(id) }),
      password_hash: '$2b$10$placeholderHashForSeeding12345678901234567890123456789',
      // Faker v10 no longer applies the old numeric pattern and may return
      // formatted international numbers longer than users.phone (VARCHAR(20)).
      phone:       `09${String(id).padStart(8, '0')}`,
      status:      faker.helpers.weightedArrayElement([
        { weight: 95, value: 'active' },
        { weight: 5,  value: 'locked' },
      ]),
      reset_token:            null,
      reset_token_expires_at: null,
      refresh_token:          null,
      created_at: faker.date.between({ from: '2024-01-01', to: new Date() }),
      updated_at: new Date(),
    });
  }
  return rows;
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    for (let start = 0; start < TOTAL; start += BATCH) {
      const size = Math.min(BATCH, TOTAL - start);
      await queryInterface.bulkInsert('users', makeBatch(start + 1, size), {});
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('users', null, {});
  },
};
