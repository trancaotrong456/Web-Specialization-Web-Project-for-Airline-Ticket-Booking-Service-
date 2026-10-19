'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('flights', 'status', {
      type: Sequelize.ENUM('scheduled', 'delayed', 'boarding', 'departed', 'arrived', 'cancelled', 'completed'),
      allowNull: false,
      defaultValue: 'scheduled',
    });
    await queryInterface.addColumn('flights', 'actual_departure_time', { type: Sequelize.DATE, allowNull: true });
    await queryInterface.addColumn('flights', 'actual_arrival_time', { type: Sequelize.DATE, allowNull: true });
    await queryInterface.addColumn('flights', 'status_reason', { type: Sequelize.STRING(500), allowNull: true });
    await queryInterface.createTable('flight_status_histories', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true, allowNull: false },
      flight_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'flights', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      from_status: { type: Sequelize.STRING(32), allowNull: true },
      to_status: { type: Sequelize.STRING(32), allowNull: false },
      actor_user_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      reason: { type: Sequelize.STRING(500), allowNull: true },
      old_departure_time: { type: Sequelize.DATE, allowNull: true },
      new_departure_time: { type: Sequelize.DATE, allowNull: true },
      old_arrival_time: { type: Sequelize.DATE, allowNull: true },
      new_arrival_time: { type: Sequelize.DATE, allowNull: true },
      actual_departure_time: { type: Sequelize.DATE, allowNull: true },
      actual_arrival_time: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('flight_status_histories', ['flight_id', 'created_at'], { name: 'flight_status_history_flight_created_idx' });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('flight_status_histories');
    await queryInterface.removeColumn('flights', 'status_reason');
    await queryInterface.removeColumn('flights', 'actual_arrival_time');
    await queryInterface.removeColumn('flights', 'actual_departure_time');
    await queryInterface.changeColumn('flights', 'status', {
      type: Sequelize.ENUM('scheduled', 'cancelled', 'completed'),
      allowNull: false,
      defaultValue: 'scheduled',
    });
  },
};
