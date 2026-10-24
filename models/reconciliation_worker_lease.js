'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ReconciliationWorkerLease extends Model {}
  ReconciliationWorkerLease.init({
    lease_name: { type: DataTypes.STRING(64), primaryKey: true },
    owner_id: { type: DataTypes.STRING(128), allowNull: true },
    lease_expires_at: { type: DataTypes.DATE, allowNull: true },
  }, {
    sequelize,
    modelName: 'ReconciliationWorkerLease',
    tableName: 'reconciliation_worker_leases',
    underscored: true,
    timestamps: true,
  });
  return ReconciliationWorkerLease;
};
