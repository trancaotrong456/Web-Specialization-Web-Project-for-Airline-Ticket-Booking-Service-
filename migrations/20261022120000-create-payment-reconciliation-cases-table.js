'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('payment_reconciliation_cases', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true, allowNull: false },
      payment_id: {
        type: Sequelize.BIGINT.UNSIGNED, allowNull: false,
        references: { model: 'payments', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT',
      },
      booking_id: {
        type: Sequelize.BIGINT.UNSIGNED, allowNull: false,
        references: { model: 'bookings', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT',
      },
      provider: { type: Sequelize.ENUM('payos', 'vnpay'), allowNull: false },
      state: { type: Sequelize.ENUM('active', 'manual_review', 'resolved', 'closed'), allowNull: false, defaultValue: 'active' },
      attempt_count: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      max_attempts: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 6 },
      next_attempt_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      last_attempt_at: { type: Sequelize.DATE, allowNull: true },
      last_checked_at: { type: Sequelize.DATE, allowNull: true },
      last_gateway_status: { type: Sequelize.STRING(32), allowNull: true },
      last_error: { type: Sequelize.STRING(500), allowNull: true },
      manual_review_reason: { type: Sequelize.STRING(500), allowNull: true },
      lease_owner: { type: Sequelize.STRING(128), allowNull: true },
      lease_expires_at: { type: Sequelize.DATE, allowNull: true },
      resolved_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
    });

    await queryInterface.addIndex('payment_reconciliation_cases', ['payment_id'], { unique: true, name: 'payment_reconciliation_cases_payment_uq' });
    await queryInterface.addIndex('payment_reconciliation_cases', ['state', 'next_attempt_at'], { name: 'payment_reconciliation_cases_due_idx' });
    await queryInterface.addIndex('payment_reconciliation_cases', ['lease_expires_at'], { name: 'payment_reconciliation_cases_lease_idx' });
    await queryInterface.addIndex('payment_reconciliation_cases', ['booking_id'], { name: 'payment_reconciliation_cases_booking_idx' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('payment_reconciliation_cases');
  },
};
