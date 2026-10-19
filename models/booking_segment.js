'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class BookingSegment extends Model {
    static associate(models) {
      BookingSegment.belongsTo(models.Booking, { foreignKey: 'booking_id', as: 'booking' });
      BookingSegment.belongsTo(models.Flight, { foreignKey: 'flight_id', as: 'flight' });
      BookingSegment.belongsTo(models.FareClass, { foreignKey: 'fare_class_id', as: 'fareClass' });
      if (models.BookingAncillary) BookingSegment.hasMany(models.BookingAncillary, { foreignKey: 'booking_segment_id', as: 'ancillaries' });
    }
  }

  BookingSegment.init({
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    booking_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    leg_order: { type: DataTypes.TINYINT.UNSIGNED, allowNull: false },
    flight_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    fare_class_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    price_per_passenger: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  }, {
    sequelize,
    modelName: 'BookingSegment',
    tableName: 'booking_segments',
    underscored: true,
    timestamps: true,
    indexes: [{ unique: true, fields: ['booking_id', 'leg_order'], name: 'booking_segments_booking_leg_unique' }],
  });

  return BookingSegment;
};
