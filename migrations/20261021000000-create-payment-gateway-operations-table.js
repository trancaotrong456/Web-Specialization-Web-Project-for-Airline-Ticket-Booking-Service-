'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('payment_gateway_operations', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true, allowNull: false },
      request_id: { type: Sequelize.STRING(64), allowNull: false, unique: true },
      operation_key: { type: Sequelize.STRING(128), allowNull: false, unique: true },
      payment_id: {
        type: Sequelize.BIGINT.UNSIGNED, allowNull: false,
        references: { model: 'payments', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT',
      },
      operation_type: { type: Sequelize.ENUM('querydr', 'refund'), allowNull: false },
      status: { type: Sequelize.ENUM('pending', 'success', 'failed', 'unknown'), allowNull: false, defaultValue: 'pending' },
      attempt_count: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      gateway_transaction_ref: { type: Sequelize.STRING(100), allowNull: true },
      amount: { type: Sequelize.DECIMAL(12, 2), allowNull: true },
      response_json: { type: Sequelize.JSON, allowNull: true },
      last_error: { type: Sequelize.STRING(500), allowNull: true },
      requested_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      last_attempt_at: { type: Sequelize.DATE, allowNull: true },
      completed_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('payment_gateway_operations', ['payment_id', 'operation_type']);
    await queryInterface.addIndex('payment_gateway_operations', ['status']);
  },
  async down(queryInterface) { await queryInterface.dropTable('payment_gateway_operations'); },
};
