'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class BookingPassenger extends Model {
    static associate(models) {
      BookingPassenger.belongsTo(models.Booking, { foreignKey: 'booking_id', as: 'booking' });
    }
  }

  BookingPassenger.init(
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
      passenger_name: {
        type: DataTypes.STRING(150),
        allowNull: false,
      },
      passport_no: {
        type: DataTypes.STRING(30),
        allowNull: true,
      },
      seat_no: {
        type: DataTypes.STRING(10),
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'BookingPassenger',
      tableName: 'booking_passengers',
      underscored: true,
      timestamps: true,
    }
  );

  return BookingPassenger;
};
