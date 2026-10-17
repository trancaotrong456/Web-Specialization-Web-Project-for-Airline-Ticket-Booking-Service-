'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Notification extends Model {
    static associate(models) {
      Notification.belongsTo(models.User, { foreignKey: 'user_id', as: 'recipient' });
      Notification.belongsTo(models.NotificationOutbox, { foreignKey: 'outbox_id', as: 'outbox' });
    }
  }

  Notification.init({
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    outbox_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, unique: true },
    event_type: { type: DataTypes.STRING(64), allowNull: false },
    title: { type: DataTypes.STRING(180), allowNull: false },
    message: { type: DataTypes.STRING(500), allowNull: false },
    related_type: { type: DataTypes.STRING(40), allowNull: true },
    related_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    read_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    sequelize,
    modelName: 'Notification',
    tableName: 'notifications',
    underscored: true,
    timestamps: true,
  });

  return Notification;
};
