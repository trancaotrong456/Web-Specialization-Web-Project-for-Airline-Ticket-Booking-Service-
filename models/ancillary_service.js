'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AncillaryService extends Model {
    static associate(models) {
      if (models.AncillaryOffer) AncillaryService.hasMany(models.AncillaryOffer, { foreignKey: 'ancillary_service_id', as: 'offers' });
    }
  }

  AncillaryService.init({
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    service_type: { type: DataTypes.ENUM('baggage', 'meal', 'priority'), allowNull: false },
    name: { type: DataTypes.STRING(120), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  }, { sequelize, modelName: 'AncillaryService', tableName: 'ancillary_services', underscored: true, timestamps: true });

  return AncillaryService;
};
