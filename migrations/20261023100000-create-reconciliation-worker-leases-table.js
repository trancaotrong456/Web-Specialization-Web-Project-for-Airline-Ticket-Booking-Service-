'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('reconciliation_worker_leases', {
      lease_name: { type: Sequelize.STRING(64), primaryKey: true, allowNull: false },
      owner_id: { type: Sequelize.STRING(128), allowNull: true },
      lease_expires_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
    });
    await queryInterface.bulkInsert('reconciliation_worker_leases', [{ lease_name: 'payos-reconciliation', owner_id: null, lease_expires_at: null, created_at: new Date(), updated_at: new Date() }]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('reconciliation_worker_leases');
  },
};
