'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Booking extends Model {
    static associate(models) {
      Booking.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
      Booking.belongsTo(models.Flight, { foreignKey: 'flight_id', as: 'flight' });
      Booking.belongsTo(models.FareClass, { foreignKey: 'fare_class_id', as: 'fareClass' });
      Booking.belongsTo(models.Promotion, { foreignKey: 'promotion_id', as: 'promotion' });
      Booking.hasMany(models.BookingPassenger, { foreignKey: 'booking_id', as: 'passengers' });
      if (models.FlightSeat) Booking.hasMany(models.FlightSeat, { foreignKey: 'booking_id', as: 'seatAssignments' });
      Booking.hasMany(models.Payment, { foreignKey: 'booking_id', as: 'payments' });
      if (models.BookingSegment) Booking.hasMany(models.BookingSegment, { foreignKey: 'booking_id', as: 'itinerarySegments' });
    }
  }

  Booking.init(
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
      },
      booking_code: {
        type: DataTypes.STRING(10),
        allowNull: false,
        unique: true,
      },
      user_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
      },
      flight_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
      },
      fare_class_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
      },
      promotion_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM('holding', 'pending_payment', 'confirmed', 'cancelled', 'expired'),
        defaultValue: 'holding',
      },
      total_amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
      },
      hold_expires_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      guest_email: {
        type: DataTypes.STRING(191),
        allowNull: true,
        validate: { isEmail: true },
      },
    },
    {
      sequelize,
      modelName: 'Booking',
      tableName: 'bookings',
      underscored: true,
      timestamps: true,
    }
  );

  return Booking;
};
