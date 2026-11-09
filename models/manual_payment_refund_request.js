'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ManualPaymentRefundRequest extends Model {
    static associate(models) {
      ManualPaymentRefundRequest.belongsTo(models.Payment, { foreignKey: 'payment_id', as: 'payment' });
      ManualPaymentRefundRequest.belongsTo(models.Booking, { foreignKey: 'booking_id', as: 'booking' });
      ManualPaymentRefundRequest.belongsTo(models.User, { foreignKey: 'requested_by_admin_id', as: 'requestedBy' });
      ManualPaymentRefundRequest.belongsTo(models.User, { foreignKey: 'resolved_by_admin_id', as: 'resolvedBy' });
      ManualPaymentRefundRequest.hasMany(models.ManualPaymentRefundAuditLog, { foreignKey: 'refund_request_id', as: 'auditLogs' });
    }
  }
  ManualPaymentRefundRequest.init({
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    payment_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, unique: true },
    booking_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    provider: { type: DataTypes.STRING(20), allowNull: false },
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    status: { type: DataTypes.ENUM('pending', 'rejected', 'settled'), allowNull: false, defaultValue: 'pending' },
    reason: { type: DataTypes.STRING(500), allowNull: false },
    evidence_reference: { type: DataTypes.STRING(500), allowNull: true },
    settlement_reference: { type: DataTypes.STRING(150), allowNull: true },
    requested_by_admin_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    resolved_by_admin_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    rejection_reason: { type: DataTypes.STRING(500), allowNull: true },
    settled_at: { type: DataTypes.DATE, allowNull: true },
    rejected_at: { type: DataTypes.DATE, allowNull: true },
  }, { sequelize, modelName: 'ManualPaymentRefundRequest', tableName: 'manual_payment_refund_requests', underscored: true, timestamps: true });
  return ManualPaymentRefundRequest;
};
