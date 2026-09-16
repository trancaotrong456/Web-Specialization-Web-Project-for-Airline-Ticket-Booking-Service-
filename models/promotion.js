'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Promotion extends Model {
    static associate(models) {
      Promotion.hasMany(models.Booking, { foreignKey: 'promotion_id', as: 'bookings' });
    }
  }

  Promotion.init(
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
      },
      code: {
        type: DataTypes.STRING(30),
        allowNull: false,
        unique: true,
      },
      discount_type: {
        type: DataTypes.ENUM('percent', 'amount'),
        allowNull: false,
      },
      discount_value: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
      },
      valid_from: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      valid_to: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      max_uses: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      used_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
    },
    {
      sequelize,
      modelName: 'Promotion',
      tableName: 'promotions',
      underscored: true,
      timestamps: true,
    }
  );

  return Promotion;
};
