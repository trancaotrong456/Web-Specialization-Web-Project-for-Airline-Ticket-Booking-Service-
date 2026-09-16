'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('promotions', {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      code: {
        type: Sequelize.STRING(30),
        allowNull: false,
        unique: true,
        comment: 'Mã nhập khi đặt vé (duy nhất)',
      },
      discount_type: {
        type: Sequelize.ENUM('percent', 'amount'),
        allowNull: false,
        comment: 'Giảm theo % hay số tiền cố định',
      },
      discount_value: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        comment: 'Giá trị giảm tương ứng',
      },
      valid_from: {
        type: Sequelize.DATE,
        allowNull: false,
        comment: 'Thời gian bắt đầu hiệu lực',
      },
      valid_to: {
        type: Sequelize.DATE,
        allowNull: false,
        comment: 'Thời gian kết thúc hiệu lực',
      },
      max_uses: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: null,
        comment: 'Giới hạn lượt dùng (NULL = không giới hạn)',
      },
      used_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Số lượt đã dùng',
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

    await queryInterface.addIndex('promotions', ['code']);
    await queryInterface.addIndex('promotions', ['valid_from', 'valid_to']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('promotions');
  },
};
