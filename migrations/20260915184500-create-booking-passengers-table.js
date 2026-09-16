'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('booking_passengers', {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      booking_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: 'bookings', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'FK → bookings.id — Thuộc đơn đặt vé nào',
      },
      passenger_name: {
        type: Sequelize.STRING(150),
        allowNull: false,
        comment: 'Họ tên hành khách',
      },
      passport_no: {
        type: Sequelize.STRING(30),
        allowNull: true,
        comment: 'Số CMND/CCCD/hộ chiếu',
      },
      seat_no: {
        type: Sequelize.STRING(10),
        allowNull: true,
        comment: 'Số ghế đã gán (nếu có)',
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

    await queryInterface.addIndex('booking_passengers', ['booking_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('booking_passengers');
  },
};
