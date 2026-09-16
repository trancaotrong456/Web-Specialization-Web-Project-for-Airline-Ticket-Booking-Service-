'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('users', {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      role_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: 'roles', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
        comment: 'FK → roles.id',
      },
      full_name: {
        type: Sequelize.STRING(150),
        allowNull: false,
        comment: 'Họ tên đầy đủ',
      },
      email: {
        type: Sequelize.STRING(191),
        allowNull: false,
        unique: true,
        comment: 'Email đăng nhập (duy nhất)',
      },
      password_hash: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'Mật khẩu đã băm (bcrypt)',
      },
      phone: {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: 'Số điện thoại',
      },
      status: {
        type: Sequelize.ENUM('active', 'locked'),
        allowNull: false,
        defaultValue: 'active',
        comment: 'Trạng thái tài khoản',
      },
      reset_token: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Token đặt lại mật khẩu',
      },
      reset_token_expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Hạn của token đặt lại mật khẩu',
      },
      refresh_token: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'JWT refresh token hiện hành',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
      },
    });

    // Index tìm kiếm theo tên/email
    await queryInterface.addIndex('users', ['email']);
    await queryInterface.addIndex('users', ['status', 'role_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('users');
  },
};
