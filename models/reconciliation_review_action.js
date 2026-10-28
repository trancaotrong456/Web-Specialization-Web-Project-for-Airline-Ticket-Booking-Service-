'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ReconciliationReviewAction extends Model {
    static associate(models) {
      ReconciliationReviewAction.belongsTo(models.PaymentReconciliationCase, { foreignKey: 'case_id', as: 'case' });
      ReconciliationReviewAction.belongsTo(models.User, { foreignKey: 'operator_user_id', as: 'operator' });
    }
  }

  ReconciliationReviewAction.init({
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    case_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    operator_user_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    action: { type: DataTypes.ENUM('acknowledge', 'financial_reconciled', 'escalate'), allowNull: false },
    reason: { type: DataTypes.STRING(500), allowNull: false },
    outcome_reference: { type: DataTypes.STRING(191), allowNull: true },
  }, { sequelize, modelName: 'ReconciliationReviewAction', tableName: 'reconciliation_review_actions', underscored: true, timestamps: true });
  return ReconciliationReviewAction;
};
