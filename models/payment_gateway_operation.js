'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class PaymentGatewayOperation extends Model {
    static associate(models) {
      PaymentGatewayOperation.belongsTo(models.Payment, { foreignKey: 'payment_id', as: 'payment' });
    }
  }

  PaymentGatewayOperation.init({
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    request_id: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    operation_key: { type: DataTypes.STRING(128), allowNull: false, unique: true },
    payment_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    operation_type: { type: DataTypes.ENUM('querydr', 'refund'), allowNull: false },
    status: { type: DataTypes.ENUM('pending', 'success', 'failed', 'unknown'), allowNull: false, defaultValue: 'pending' },
    attempt_count: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    gateway_transaction_ref: { type: DataTypes.STRING(100), allowNull: true },
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    response_json: { type: DataTypes.JSON, allowNull: true },
    last_error: { type: DataTypes.STRING(500), allowNull: true },
    requested_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    last_attempt_at: { type: DataTypes.DATE, allowNull: true },
    completed_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    sequelize,
    modelName: 'PaymentGatewayOperation',
    tableName: 'payment_gateway_operations',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['payment_id', 'operation_type'] },
      { fields: ['status'] },
    ],
  });
  return PaymentGatewayOperation;
};
