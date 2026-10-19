'use strict';

const { airlines: airlinesData } = require('./demo-fixtures');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const rows = airlinesData.map((item, index) => ({
      id: index + 1,
      name: item.name,
      iata_code: item.iata_code,
      logo_url: item.logo_url,
      created_at: now,
      updated_at: now,
    }));

    await queryInterface.bulkInsert('airlines', rows, {});
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('airlines', null, {});
  },
};
