'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert('roles', [
      { id: 1, name: 'admin',    description: 'Quản trị viên hệ thống',         created_at: new Date(), updated_at: new Date() },
      { id: 2, name: 'staff',    description: 'Nhân viên vận hành',             created_at: new Date(), updated_at: new Date() },
      { id: 3, name: 'customer', description: 'Khách hàng đặt vé trực tuyến',  created_at: new Date(), updated_at: new Date() },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('roles', null, {});
  },
};
