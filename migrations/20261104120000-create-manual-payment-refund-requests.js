'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('manual_payment_refund_requests', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true, allowNull: false },
      payment_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, unique: true, references: { model: 'payments', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      booking_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'bookings', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      provider: { type: Sequelize.STRING(20), allowNull: false },
      amount: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      status: { type: Sequelize.ENUM('pending', 'rejected', 'settled'), allowNull: false, defaultValue: 'pending' },
      reason: { type: Sequelize.STRING(500), allowNull: false },
      evidence_reference: { type: Sequelize.STRING(500), allowNull: true },
      settlement_reference: { type: Sequelize.STRING(150), allowNull: true },
      requested_by_admin_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      resolved_by_admin_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      rejection_reason: { type: Sequelize.STRING(500), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
      settled_at: { type: Sequelize.DATE, allowNull: true },
      rejected_at: { type: Sequelize.DATE, allowNull: true },
    });
    await queryInterface.addIndex('manual_payment_refund_requests', ['status'], { name: 'manual_refund_status_idx' });
    await queryInterface.addIndex('manual_payment_refund_requests', ['booking_id'], { name: 'manual_refund_booking_idx' });
    await queryInterface.sequelize.query("ALTER TABLE manual_payment_refund_requests ADD CONSTRAINT manual_refund_provider_chk CHECK (provider = 'payos')");

    await queryInterface.createTable('manual_payment_refund_audit_logs', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true, allowNull: false },
      refund_request_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'manual_payment_refund_requests', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      admin_user_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      action: { type: Sequelize.STRING(32), allowNull: false },
      evidence_reference: { type: Sequelize.STRING(500), allowNull: true },
      settlement_reference: { type: Sequelize.STRING(150), allowNull: true },
      reason: { type: Sequelize.STRING(500), allowNull: true },
      metadata: { type: Sequelize.JSON, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('manual_payment_refund_audit_logs', ['refund_request_id'], { name: 'manual_refund_audit_request_idx' });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('manual_payment_refund_audit_logs');
    await queryInterface.dropTable('manual_payment_refund_requests');
  },
};
