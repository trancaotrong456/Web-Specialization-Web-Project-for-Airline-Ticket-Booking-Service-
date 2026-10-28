'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('reconciliation_review_actions', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true, allowNull: false },
      case_id: {
        type: Sequelize.BIGINT.UNSIGNED, allowNull: false,
        references: { model: 'payment_reconciliation_cases', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT',
      },
      operator_user_id: {
        type: Sequelize.BIGINT.UNSIGNED, allowNull: false,
        references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT',
      },
      action: { type: Sequelize.ENUM('acknowledge', 'financial_reconciled', 'escalate'), allowNull: false },
      reason: { type: Sequelize.STRING(500), allowNull: false },
      outcome_reference: { type: Sequelize.STRING(191), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
    });
    await queryInterface.addConstraint('reconciliation_review_actions', {
      fields: ['case_id'], type: 'unique', name: 'reconciliation_review_actions_case_uq',
    });
    await queryInterface.addIndex('reconciliation_review_actions', ['operator_user_id'], { name: 'reconciliation_review_actions_operator_idx' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('reconciliation_review_actions');
  },
};
