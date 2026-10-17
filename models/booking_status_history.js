'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class BookingStatusHistory extends Model {
    static associate(models) {
      BookingStatusHistory.belongsTo(models.Booking, { foreignKey: 'booking_id', as: 'booking' });
      BookingStatusHistory.belongsTo(models.User, { foreignKey: 'actor_user_id', as: 'actor' });
    }
  }

  BookingStatusHistory.init({
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    booking_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    from_status: { type: DataTypes.ENUM('holding', 'pending_payment', 'confirmed', 'cancelled', 'expired'), allowNull: true },
    to_status: { type: DataTypes.ENUM('holding', 'pending_payment', 'confirmed', 'cancelled', 'expired'), allowNull: false },
    source: { type: DataTypes.STRING(60), allowNull: false },
    actor_user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
  }, {
    sequelize,
    modelName: 'BookingStatusHistory',
    tableName: 'booking_status_histories',
    underscored: true,
    timestamps: true,
    updatedAt: false,
  });

  return BookingStatusHistory;
};
