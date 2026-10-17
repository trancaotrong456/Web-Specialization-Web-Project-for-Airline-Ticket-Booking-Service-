'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class FlightStatusHistory extends Model {
    static associate(models) {
      FlightStatusHistory.belongsTo(models.Flight, { foreignKey: 'flight_id', as: 'flight' });
      FlightStatusHistory.belongsTo(models.User, { foreignKey: 'actor_user_id', as: 'actor' });
    }
  }

  FlightStatusHistory.init({
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    flight_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    from_status: { type: DataTypes.STRING(32), allowNull: true },
    to_status: { type: DataTypes.STRING(32), allowNull: false },
    actor_user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    reason: { type: DataTypes.STRING(500), allowNull: true },
    old_departure_time: { type: DataTypes.DATE, allowNull: true },
    new_departure_time: { type: DataTypes.DATE, allowNull: true },
    old_arrival_time: { type: DataTypes.DATE, allowNull: true },
    new_arrival_time: { type: DataTypes.DATE, allowNull: true },
    actual_departure_time: { type: DataTypes.DATE, allowNull: true },
    actual_arrival_time: { type: DataTypes.DATE, allowNull: true },
  }, {
    sequelize,
    modelName: 'FlightStatusHistory',
    tableName: 'flight_status_histories',
    underscored: true,
    timestamps: true,
  });

  return FlightStatusHistory;
};
