'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class SeatMapTemplate extends Model {
    static associate(models) { SeatMapTemplate.hasMany(models.FlightSeatMap, { foreignKey: 'template_id', as: 'flightSnapshots' }); }
  }
  SeatMapTemplate.init({
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(120), allowNull: false },
    aircraft_type: { type: DataTypes.STRING(80), allowNull: false },
    version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    layout: { type: DataTypes.JSON, allowNull: false },
    is_current: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  }, { sequelize, modelName: 'SeatMapTemplate', tableName: 'seat_map_templates', underscored: true, timestamps: true });
  return SeatMapTemplate;
};
