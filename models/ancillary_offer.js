'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AncillaryOffer extends Model {
    static associate(models) {
      AncillaryOffer.belongsTo(models.AncillaryService, { foreignKey: 'ancillary_service_id', as: 'service' });
      AncillaryOffer.belongsTo(models.Flight, { foreignKey: 'flight_id', as: 'flight' });
      AncillaryOffer.belongsTo(models.FareClass, { foreignKey: 'fare_class_id', as: 'fareClass' });
      if (models.BookingAncillary) AncillaryOffer.hasMany(models.BookingAncillary, { foreignKey: 'offer_id', as: 'bookingSnapshots' });
    }
  }

  AncillaryOffer.init({
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    ancillary_service_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    offer_name: { type: DataTypes.STRING(120), allowNull: false },
    flight_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    fare_class_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    unit_price: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    currency: { type: DataTypes.STRING(3), allowNull: false },
    capacity: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    reserved_quantity: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    max_quantity_per_passenger: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true },
    conditions: { type: DataTypes.JSON, allowNull: true },
    refund_policy: { type: DataTypes.ENUM('refundable', 'non_refundable'), allowNull: false },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  }, { sequelize, modelName: 'AncillaryOffer', tableName: 'ancillary_offers', underscored: true, timestamps: true });

  return AncillaryOffer;
};
