'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ManualPaymentRefundAuditLog extends Model {
    static associate(models) {
      ManualPaymentRefundAuditLog.belongsTo(models.ManualPaymentRefundRequest, { foreignKey: 'refund_request_id', as: 'refundRequest' });
      ManualPaymentRefundAuditLog.belongsTo(models.User, { foreignKey: 'admin_user_id', as: 'admin' });
    }
  }
  ManualPaymentRefundAuditLog.init({
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    refund_request_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    admin_user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    action: { type: DataTypes.STRING(32), allowNull: false },
    evidence_reference: { type: DataTypes.STRING(500), allowNull: true },
    settlement_reference: { type: DataTypes.STRING(150), allowNull: true },
    reason: { type: DataTypes.STRING(500), allowNull: true },
    metadata: { type: DataTypes.JSON, allowNull: true },
  }, { sequelize, modelName: 'ManualPaymentRefundAuditLog', tableName: 'manual_payment_refund_audit_logs', underscored: true, timestamps: true, updatedAt: false });
  return ManualPaymentRefundAuditLog;
};
