'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PaymentReconciliationCase extends Model {
    static associate(models) {
      PaymentReconciliationCase.belongsTo(models.Payment, { foreignKey: 'payment_id', as: 'payment' });
      PaymentReconciliationCase.belongsTo(models.Booking, { foreignKey: 'booking_id', as: 'booking' });
    }
  }

  PaymentReconciliationCase.init({
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    payment_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    booking_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    provider: { type: DataTypes.ENUM('payos', 'vnpay'), allowNull: false },
    state: { type: DataTypes.ENUM('active', 'manual_review', 'resolved', 'closed'), allowNull: false, defaultValue: 'active' },
    attempt_count: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    max_attempts: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 6 },
    next_attempt_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    last_attempt_at: { type: DataTypes.DATE, allowNull: true },
    last_checked_at: { type: DataTypes.DATE, allowNull: true },
    last_gateway_status: { type: DataTypes.STRING(32), allowNull: true },
    last_error: { type: DataTypes.STRING(500), allowNull: true },
    manual_review_reason: { type: DataTypes.STRING(500), allowNull: true },
    lease_owner: { type: DataTypes.STRING(128), allowNull: true },
    lease_expires_at: { type: DataTypes.DATE, allowNull: true },
    resolved_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    sequelize,
    modelName: 'PaymentReconciliationCase',
    tableName: 'payment_reconciliation_cases',
    underscored: true,
    timestamps: true,
  });

  return PaymentReconciliationCase;
};
