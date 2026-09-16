'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('payments', {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      booking_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: 'bookings', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
        comment: 'FK → bookings.id — Thanh toán cho đơn đặt vé nào',
      },
      amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        comment: 'Số tiền giao dịch (VNĐ)',
      },
      payment_method: {
        type: Sequelize.ENUM('vnpay', 'momo'),
        allowNull: false,
        comment: 'Cổng thanh toán sử dụng',
      },
      status: {
        type: Sequelize.ENUM('pending', 'success', 'failed', 'refunded'),
        allowNull: false,
        defaultValue: 'pending',
        comment: 'Trạng thái giao dịch',
      },
      transaction_ref: {
        type: Sequelize.STRING(100),
        allowNull: true,
        unique: true,
        comment: 'Mã giao dịch phía cổng thanh toán (idempotent webhook)',
      },
      paid_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Thời điểm thanh toán thành công',
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

    // Index theo tài liệu: payments(transaction_ref) để xử lý webhook idempotent
    await queryInterface.addIndex('payments', ['transaction_ref']);
    await queryInterface.addIndex('payments', ['booking_id']);
    await queryInterface.addIndex('payments', ['status']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('payments');
  },
};
