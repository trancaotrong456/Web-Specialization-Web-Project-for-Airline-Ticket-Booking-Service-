'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('booking_segments', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true, allowNull: false },
      booking_id: {
        type: Sequelize.BIGINT.UNSIGNED, allowNull: false,
        references: { model: 'bookings', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE',
      },
      leg_order: { type: Sequelize.TINYINT.UNSIGNED, allowNull: false },
      flight_id: {
        type: Sequelize.BIGINT.UNSIGNED, allowNull: false,
        references: { model: 'flights', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT',
      },
      fare_class_id: {
        type: Sequelize.BIGINT.UNSIGNED, allowNull: false,
        references: { model: 'fare_classes', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT',
      },
      price_per_passenger: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
    });
    await queryInterface.addConstraint('booking_segments', {
      fields: ['booking_id', 'leg_order'], type: 'unique', name: 'booking_segments_booking_leg_unique',
    });
    await queryInterface.addIndex('booking_segments', ['flight_id'], { name: 'booking_segments_flight_idx' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('booking_segments');
  },
};
