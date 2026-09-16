'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Airline extends Model {
    static associate(models) {
      Airline.hasMany(models.Flight, { foreignKey: 'airline_id', as: 'flights' });
    }
  }

  Airline.init(
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
      },
      name: {
        type: DataTypes.STRING(150),
        allowNull: false,
      },
      iata_code: {
        type: DataTypes.STRING(3),
        allowNull: false,
        unique: true,
      },
      logo_url: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'Airline',
      tableName: 'airlines',
      underscored: true,
      timestamps: true,
    }
  );

  return Airline;
};
