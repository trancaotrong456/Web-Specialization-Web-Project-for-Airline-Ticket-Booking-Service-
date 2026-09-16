'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('fare_classes', {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      flight_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: 'flights', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'FK → flights.id — Thuộc chuyến bay nào',
      },
      class_name: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'Phổ thông / Thương gia / Hạng nhất',
      },
      price: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        comment: 'Giá vé hạng này (VNĐ)',
      },
      seat_quota: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: true,
        comment: 'Số ghế phân bổ cho hạng vé (nếu quản lý riêng theo hạng)',
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

    await queryInterface.addIndex('fare_classes', ['flight_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('fare_classes');
  },
};
