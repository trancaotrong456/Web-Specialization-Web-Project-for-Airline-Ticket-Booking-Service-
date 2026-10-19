'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('notification_outbox', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true, allowNull: false },
      event_key: { type: Sequelize.STRING(191), allowNull: false, unique: true },
      event_type: { type: Sequelize.STRING(64), allowNull: false },
      aggregate_type: { type: Sequelize.STRING(40), allowNull: false },
      aggregate_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
      recipient_user_id: {
        type: Sequelize.BIGINT.UNSIGNED, allowNull: true,
        references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL',
      },
      recipient_email: { type: Sequelize.STRING(191), allowNull: true },
      payload: { type: Sequelize.JSON, allowNull: false },
      status: { type: Sequelize.ENUM('pending', 'processing', 'processed', 'failed'), allowNull: false, defaultValue: 'pending' },
      email_status: { type: Sequelize.ENUM('pending', 'sent', 'skipped', 'failed'), allowNull: false, defaultValue: 'pending' },
      realtime_status: { type: Sequelize.ENUM('pending', 'sent', 'skipped', 'failed'), allowNull: false, defaultValue: 'pending' },
      email_attempts: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      realtime_attempts: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      available_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      lease_token: { type: Sequelize.STRING(64), allowNull: true },
      lease_expires_at: { type: Sequelize.DATE, allowNull: true },
      last_error: { type: Sequelize.TEXT, allowNull: true },
      processed_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('notification_outbox', ['status', 'available_at'], { name: 'notification_outbox_claim_idx' });
    await queryInterface.addIndex('notification_outbox', ['lease_expires_at'], { name: 'notification_outbox_lease_idx' });

    await queryInterface.createTable('notifications', {
      id: { type: Sequelize.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true, allowNull: false },
      user_id: {
        type: Sequelize.BIGINT.UNSIGNED, allowNull: false,
        references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE',
      },
      outbox_id: {
        type: Sequelize.BIGINT.UNSIGNED, allowNull: false, unique: true,
        references: { model: 'notification_outbox', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE',
      },
      event_type: { type: Sequelize.STRING(64), allowNull: false },
      title: { type: Sequelize.STRING(180), allowNull: false },
      message: { type: Sequelize.STRING(500), allowNull: false },
      related_type: { type: Sequelize.STRING(40), allowNull: true },
      related_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
      read_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP') },
    });
    await queryInterface.addIndex('notifications', ['user_id', 'created_at'], { name: 'notifications_user_created_idx' });
    await queryInterface.addIndex('notifications', ['user_id', 'read_at'], { name: 'notifications_user_read_idx' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('notifications');
    await queryInterface.dropTable('notification_outbox');
  },
};
