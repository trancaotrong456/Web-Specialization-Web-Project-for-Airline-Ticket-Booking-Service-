'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Flight extends Model {
    static associate(models) {
      Flight.belongsTo(models.Airline, { foreignKey: 'airline_id', as: 'airline' });
      Flight.belongsTo(models.Airport, { foreignKey: 'departure_airport_id', as: 'departureAirport' });
      Flight.belongsTo(models.Airport, { foreignKey: 'arrival_airport_id', as: 'arrivalAirport' });
      Flight.hasMany(models.FareClass, { foreignKey: 'flight_id', as: 'fareClasses' });
      Flight.hasMany(models.Booking, { foreignKey: 'flight_id', as: 'bookings' });
    }
  }

  Flight.init(
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
      },
      airline_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
      },
      departure_airport_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
      },
      arrival_airport_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
      },
      departure_time: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      arrival_time: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      total_seats: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      available_seats: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM('scheduled', 'cancelled', 'completed'),
        defaultValue: 'scheduled',
      },
    },
    {
      sequelize,
      modelName: 'Flight',
      tableName: 'flights',
      underscored: true,
      timestamps: true,
    }
  );

  return Flight;
};
