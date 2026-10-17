'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('payments', 'idempotency_key', {
      type: Sequelize.STRING(128),
      allowNull: true,
    });
    await queryInterface.addColumn('payments', 'request_fingerprint', {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
    await queryInterface.addColumn('payments', 'idempotency_response', {
      type: Sequelize.JSON,
      allowNull: true,
    });
    await queryInterface.addIndex('payments', ['idempotency_key'], {
      name: 'payments_idempotency_key_unique',
      unique: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('payments', 'payments_idempotency_key_unique');
    await queryInterface.removeColumn('payments', 'idempotency_response');
    await queryInterface.removeColumn('payments', 'request_fingerprint');
    await queryInterface.removeColumn('payments', 'idempotency_key');
  },
};
