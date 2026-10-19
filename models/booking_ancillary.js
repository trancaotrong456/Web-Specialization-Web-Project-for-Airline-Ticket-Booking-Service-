'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class BookingAncillary extends Model {
    static associate(models) {
      BookingAncillary.belongsTo(models.Booking, { foreignKey: 'booking_id', as: 'booking' });
      BookingAncillary.belongsTo(models.BookingPassenger, { foreignKey: 'passenger_id', as: 'passenger' });
      BookingAncillary.belongsTo(models.BookingSegment, { foreignKey: 'booking_segment_id', as: 'segment' });
      if (models.AncillaryOffer) BookingAncillary.belongsTo(models.AncillaryOffer, { foreignKey: 'offer_id', as: 'offer' });
    }
  }

  BookingAncillary.init({
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    booking_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    passenger_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    booking_segment_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    offer_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    service_type_snapshot: { type: DataTypes.ENUM('baggage', 'meal', 'priority'), allowNull: false },
    service_name_snapshot: { type: DataTypes.STRING(120), allowNull: false },
    offer_name_snapshot: { type: DataTypes.STRING(120), allowNull: false },
    unit_price_snapshot: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    line_total_snapshot: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    currency_snapshot: { type: DataTypes.STRING(3), allowNull: false },
    quantity: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    refund_policy_snapshot: { type: DataTypes.ENUM('refundable', 'non_refundable'), allowNull: false },
    status: { type: DataTypes.ENUM('held', 'confirmed', 'released'), allowNull: false, defaultValue: 'held' },
  }, { sequelize, modelName: 'BookingAncillary', tableName: 'booking_ancillaries', underscored: true, timestamps: true });

  return BookingAncillary;
};
