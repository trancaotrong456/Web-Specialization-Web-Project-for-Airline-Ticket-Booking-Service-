'use strict';

const { airports: airportsData } = require('./demo-fixtures');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const rows = airportsData.map((item, index) => ({
      id: index + 1,
      iata_code: item.iata_code,
      name: item.name,
      city: item.city,
      country: item.country,
      created_at: now,
      updated_at: now,
    }));

    await queryInterface.bulkInsert('airports', rows, {});
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('airports', null, {});
  },
};
