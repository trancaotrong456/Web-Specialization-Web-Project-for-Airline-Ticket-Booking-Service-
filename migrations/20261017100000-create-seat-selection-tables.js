'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('seat_map_templates', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      name: { type: Sequelize.STRING(120), allowNull: false }, aircraft_type: { type: Sequelize.STRING(80), allowNull: false },
      version: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false }, layout: { type: Sequelize.JSON, allowNull: false },
      is_current: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('seat_map_templates', ['name', 'version'], { unique: true, name: 'seat_map_template_name_version_uq' });
    await queryInterface.createTable('flight_seat_maps', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      flight_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, unique: true, references: { model: 'flights', key: 'id' }, onDelete: 'CASCADE' },
      template_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'seat_map_templates', key: 'id' }, onDelete: 'RESTRICT' },
      template_version: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false }, snapshot: { type: Sequelize.JSON, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
    });
    await queryInterface.createTable('flight_seats', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
      flight_seat_map_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'flight_seat_maps', key: 'id' }, onDelete: 'CASCADE' },
      flight_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'flights', key: 'id' }, onDelete: 'CASCADE' },
      seat_no: { type: Sequelize.STRING(10), allowNull: false }, row_number: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      column_number: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false }, zone: { type: Sequelize.STRING(40), allowNull: false },
      special_properties: { type: Sequelize.JSON, allowNull: false }, fare_class_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, references: { model: 'fare_classes', key: 'id' }, onDelete: 'RESTRICT' },
      status: { type: Sequelize.ENUM('available', 'held', 'booked', 'blocked'), allowNull: false, defaultValue: 'available' },
      booking_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, references: { model: 'bookings', key: 'id' }, onDelete: 'SET NULL' },
      booking_passenger_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, references: { model: 'booking_passengers', key: 'id' }, onDelete: 'SET NULL' },
      leg_order: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true }, hold_expires_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
    });
    await queryInterface.addConstraint('flight_seats', { fields: ['flight_id', 'seat_no'], type: 'unique', name: 'flight_seats_flight_seat_uq' });
    await queryInterface.addConstraint('flight_seats', { fields: ['booking_id', 'booking_passenger_id', 'leg_order'], type: 'unique', name: 'flight_seats_booking_passenger_leg_uq' });
    await queryInterface.addIndex('flight_seats', ['flight_id', 'status'], { name: 'flight_seats_availability_idx' });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('flight_seats');
    await queryInterface.dropTable('flight_seat_maps');
    await queryInterface.dropTable('seat_map_templates');
  },
};
