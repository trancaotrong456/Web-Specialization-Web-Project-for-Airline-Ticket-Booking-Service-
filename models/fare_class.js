'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class FareClass extends Model {
    static associate(models) {
      FareClass.belongsTo(models.Flight, { foreignKey: 'flight_id', as: 'flight' });
      FareClass.hasMany(models.Booking, { foreignKey: 'fare_class_id', as: 'bookings' });
    }
  }

  FareClass.init(
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
      },
      flight_id: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: false,
      },
      class_name: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      price: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
      },
      seat_quota: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'FareClass',
      tableName: 'fare_classes',
      underscored: true,
      timestamps: true,
    }
  );

  return FareClass;
};
