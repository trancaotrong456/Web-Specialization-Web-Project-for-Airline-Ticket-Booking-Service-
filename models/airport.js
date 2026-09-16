'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Airport extends Model {
    static associate(models) {
      Airport.hasMany(models.Flight, { foreignKey: 'departure_airport_id', as: 'departureFlights' });
      Airport.hasMany(models.Flight, { foreignKey: 'arrival_airport_id', as: 'arrivalFlights' });
    }
  }

  Airport.init(
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
      },
      iata_code: {
        type: DataTypes.STRING(3),
        allowNull: false,
        unique: true,
      },
      name: {
        type: DataTypes.STRING(200),
        allowNull: false,
      },
      city: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      country: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'Airport',
      tableName: 'airports',
      underscored: true,
      timestamps: true,
    }
  );

  return Airport;
};
