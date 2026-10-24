'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Payment extends Model {
    static associate(models) {
      Payment.belongsTo(models.Booking, { foreignKey: 'booking_id', as: 'booking' });
      Payment.hasMany(models.PaymentGatewayOperation, { foreignKey: 'payment_id', as: 'gatewayOperations' });
      Payment.hasOne(models.PaymentReconciliationCase, { foreignKey: 'payment_id', as: 'reconciliationCase' });
    }
  }

  Payment.init(
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
      },
      booking_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
      },
      amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
      },
      payment_method: {
        type: DataTypes.ENUM('vnpay', 'payos'),
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM('pending', 'success', 'failed', 'refunded'),
        defaultValue: 'pending',
      },
      transaction_ref: {
        type: DataTypes.STRING(100),
        allowNull: true,
        unique: true,
      },
      paid_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'Payment',
      tableName: 'payments',
      underscored: true,
      timestamps: true,
    }
  );

  return Payment;
};
