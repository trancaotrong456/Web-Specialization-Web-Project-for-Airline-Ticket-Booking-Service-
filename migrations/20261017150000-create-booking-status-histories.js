'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('booking_status_histories', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true, allowNull: false },
      booking_id: {
        type: Sequelize.BIGINT.UNSIGNED, allowNull: false,
        references: { model: 'bookings', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT',
      },
      from_status: {
        type: Sequelize.ENUM('holding', 'pending_payment', 'confirmed', 'cancelled', 'expired'), allowNull: true,
      },
      to_status: {
        type: Sequelize.ENUM('holding', 'pending_payment', 'confirmed', 'cancelled', 'expired'), allowNull: false,
      },
      source: { type: Sequelize.STRING(60), allowNull: false },
      actor_user_id: {
        type: Sequelize.BIGINT.UNSIGNED, allowNull: true,
        references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('booking_status_histories', ['booking_id', 'created_at'], { name: 'booking_status_histories_booking_created_idx' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('booking_status_histories');
  },
};
