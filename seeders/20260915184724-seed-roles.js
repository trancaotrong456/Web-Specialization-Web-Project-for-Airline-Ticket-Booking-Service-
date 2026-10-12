'use strict';

const { roles } = require('./demo-fixtures');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert('roles', roles.map((item, index) => ({
      id: index + 1,
      ...item,
      created_at: new Date(),
      updated_at: new Date(),
    })));
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('roles', null, {});
  },
};
