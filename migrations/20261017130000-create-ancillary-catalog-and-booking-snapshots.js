'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('ancillary_services', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true, allowNull: false },
      service_type: { type: Sequelize.ENUM('baggage', 'meal', 'priority'), allowNull: false },
      name: { type: Sequelize.STRING(120), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
    });

    await queryInterface.createTable('ancillary_offers', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true, allowNull: false },
      ancillary_service_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'ancillary_services', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      offer_name: { type: Sequelize.STRING(120), allowNull: false },
      flight_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'flights', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      fare_class_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'fare_classes', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      unit_price: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      currency: { type: Sequelize.STRING(3), allowNull: false },
      capacity: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      reserved_quantity: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      max_quantity_per_passenger: { type: Sequelize.INTEGER.UNSIGNED, allowNull: true },
      conditions: { type: Sequelize.JSON, allowNull: true },
      refund_policy: { type: Sequelize.ENUM('refundable', 'non_refundable'), allowNull: false },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
    });
    await queryInterface.addConstraint('ancillary_offers', {
      fields: ['ancillary_service_id', 'flight_id', 'fare_class_id', 'offer_name'], type: 'unique', name: 'ancillary_offers_applicability_name_uq',
    });
    await queryInterface.addIndex('ancillary_offers', ['flight_id', 'fare_class_id', 'is_active'], { name: 'ancillary_offers_lookup_idx' });

    await queryInterface.createTable('booking_ancillaries', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true, allowNull: false },
      booking_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'bookings', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      passenger_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'booking_passengers', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      booking_segment_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'booking_segments', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      offer_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, references: { model: 'ancillary_offers', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      service_type_snapshot: { type: Sequelize.ENUM('baggage', 'meal', 'priority'), allowNull: false },
      service_name_snapshot: { type: Sequelize.STRING(120), allowNull: false },
      offer_name_snapshot: { type: Sequelize.STRING(120), allowNull: false },
      unit_price_snapshot: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      line_total_snapshot: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      currency_snapshot: { type: Sequelize.STRING(3), allowNull: false },
      quantity: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false },
      refund_policy_snapshot: { type: Sequelize.ENUM('refundable', 'non_refundable'), allowNull: false },
      status: { type: Sequelize.ENUM('held', 'confirmed', 'released'), allowNull: false, defaultValue: 'held' },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
    });
    await queryInterface.addConstraint('booking_ancillaries', {
      fields: ['booking_id', 'passenger_id', 'booking_segment_id', 'offer_id'], type: 'unique', name: 'booking_ancillary_passenger_segment_offer_uq',
    });
    await queryInterface.addIndex('booking_ancillaries', ['offer_id', 'status'], { name: 'booking_ancillaries_capacity_idx' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('booking_ancillaries');
    await queryInterface.dropTable('ancillary_offers');
    await queryInterface.dropTable('ancillary_services');
  },
};
