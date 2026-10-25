'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class FlightSeatMap extends Model {
    static associate(models) {
      FlightSeatMap.belongsTo(models.Flight, { foreignKey: 'flight_id', as: 'flight' });
      FlightSeatMap.belongsTo(models.SeatMapTemplate, { foreignKey: 'template_id', as: 'template' });
      FlightSeatMap.hasMany(models.FlightSeat, { foreignKey: 'flight_seat_map_id', as: 'seats' });
    }
  }
  FlightSeatMap.init({
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    flight_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, unique: true },
    template_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    template_version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    snapshot: { type: DataTypes.JSON, allowNull: false },
  }, { sequelize, modelName: 'FlightSeatMap', tableName: 'flight_seat_maps', underscored: true, timestamps: true });
  return FlightSeatMap;
};
