'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('flights', {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      airline_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: 'airlines', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
        comment: 'FK → airlines.id — Hãng khai thác',
      },
      departure_airport_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: 'airports', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
        comment: 'FK → airports.id — Sân bay đi',
      },
      arrival_airport_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: 'airports', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
        comment: 'FK → airports.id — Sân bay đến (≠ departure)',
      },
      departure_time: {
        type: Sequelize.DATE,
        allowNull: false,
        comment: 'Giờ khởi hành',
      },
      arrival_time: {
        type: Sequelize.DATE,
        allowNull: false,
        comment: 'Giờ hạ cánh',
      },
      total_seats: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        comment: 'Tổng số ghế của chuyến bay',
      },
      available_seats: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        comment: 'Số ghế còn trống hiện tại (CHECK ≥ 0)',
      },
      status: {
        type: Sequelize.ENUM('scheduled', 'cancelled', 'completed'),
        allowNull: false,
        defaultValue: 'scheduled',
        comment: 'Trạng thái chuyến bay',
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

    // Index tìm kiếm chuyến bay (điểm đi - điểm đến - ngày)
    await queryInterface.addIndex('flights', ['departure_airport_id', 'arrival_airport_id', 'departure_time'], {
      name: 'flights_search_idx',
    });
    await queryInterface.addIndex('flights', ['airline_id']);
    await queryInterface.addIndex('flights', ['status']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('flights');
  },
};
