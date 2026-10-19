'use strict';
const { Model } = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class FlightSeat extends Model {
    static associate(models) {
      FlightSeat.belongsTo(models.FlightSeatMap, { foreignKey: 'flight_seat_map_id', as: 'seatMap' });
      FlightSeat.belongsTo(models.Flight, { foreignKey: 'flight_id', as: 'flight' });
      FlightSeat.belongsTo(models.FareClass, { foreignKey: 'fare_class_id', as: 'fareClass' });
      FlightSeat.belongsTo(models.Booking, { foreignKey: 'booking_id', as: 'booking' });
      FlightSeat.belongsTo(models.BookingPassenger, { foreignKey: 'booking_passenger_id', as: 'passenger' });
    }
  }
  FlightSeat.init({
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    flight_seat_map_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    flight_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    seat_no: { type: DataTypes.STRING(10), allowNull: false },
    row_number: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    column_number: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    zone: { type: DataTypes.STRING(40), allowNull: false },
    special_properties: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    fare_class_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    status: { type: DataTypes.ENUM('available', 'held', 'booked', 'blocked'), allowNull: false, defaultValue: 'available' },
    booking_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    booking_passenger_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    leg_order: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    hold_expires_at: { type: DataTypes.DATE, allowNull: true },
  }, { sequelize, modelName: 'FlightSeat', tableName: 'flight_seats', underscored: true, timestamps: true });
  return FlightSeat;
};
