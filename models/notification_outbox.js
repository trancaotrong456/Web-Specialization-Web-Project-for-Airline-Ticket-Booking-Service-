'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class NotificationOutbox extends Model {
    static associate(models) {
      NotificationOutbox.belongsTo(models.User, { foreignKey: 'recipient_user_id', as: 'recipient' });
      NotificationOutbox.hasOne(models.Notification, { foreignKey: 'outbox_id', as: 'notification' });
    }
  }

  NotificationOutbox.init({
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    event_key: { type: DataTypes.STRING(191), allowNull: false, unique: true },
    event_type: { type: DataTypes.STRING(64), allowNull: false },
    aggregate_type: { type: DataTypes.STRING(40), allowNull: false },
    aggregate_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    recipient_user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    recipient_email: { type: DataTypes.STRING(191), allowNull: true },
    payload: { type: DataTypes.JSON, allowNull: false },
    status: { type: DataTypes.ENUM('pending', 'processing', 'processed', 'failed'), allowNull: false, defaultValue: 'pending' },
    email_status: { type: DataTypes.ENUM('pending', 'sent', 'skipped', 'failed'), allowNull: false, defaultValue: 'pending' },
    realtime_status: { type: DataTypes.ENUM('pending', 'sent', 'skipped', 'failed'), allowNull: false, defaultValue: 'pending' },
    email_attempts: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    realtime_attempts: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    available_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    lease_token: { type: DataTypes.STRING(64), allowNull: true },
    lease_expires_at: { type: DataTypes.DATE, allowNull: true },
    last_error: { type: DataTypes.TEXT, allowNull: true },
    processed_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    sequelize,
    modelName: 'NotificationOutbox',
    tableName: 'notification_outbox',
    underscored: true,
    timestamps: true,
  });

  return NotificationOutbox;
};
