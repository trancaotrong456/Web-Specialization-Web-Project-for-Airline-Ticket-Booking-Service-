'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('airlines', {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING(150),
        allowNull: false,
        comment: 'Tên hãng bay',
      },
      iata_code: {
        type: Sequelize.STRING(3),
        allowNull: false,
        unique: true,
        comment: 'Mã IATA 2-3 ký tự (VN, VJ, QH…)',
      },
      logo_url: {
        type: Sequelize.STRING(500),
        allowNull: true,
        comment: 'Đường dẫn ảnh logo hãng bay',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('airlines');
  },
};
