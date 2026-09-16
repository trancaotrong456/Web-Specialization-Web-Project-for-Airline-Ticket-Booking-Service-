'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('bookings', {
      id: {
        type: Sequelize.BIGINT.UNSIGNED,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      booking_code: {
        type: Sequelize.STRING(10),
        allowNull: false,
        unique: true,
        comment: 'Mã đặt chỗ (PNR) hiển thị cho khách',
      },
      user_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'FK → users.id — NULL nếu là khách vãng lai (guest)',
      },
      flight_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: 'flights', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
        comment: 'FK → flights.id — Chuyến bay đã đặt',
      },
      fare_class_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: false,
        references: { model: 'fare_classes', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
        comment: 'FK → fare_classes.id — Hạng vé đã chọn',
      },
      promotion_id: {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true,
        references: { model: 'promotions', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'FK → promotions.id — Mã khuyến mại áp dụng (nếu có)',
      },
      status: {
        type: Sequelize.ENUM('holding', 'pending_payment', 'confirmed', 'cancelled', 'expired'),
        allowNull: false,
        defaultValue: 'holding',
        comment: 'Trạng thái đơn đặt vé',
      },
      total_amount: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        comment: 'Tổng tiền sau khuyến mại (VNĐ)',
      },
      hold_expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Hạn giữ chỗ (created_at + 15 phút) — job nền tự huỷ nếu quá hạn',
      },
      guest_email: {
        type: Sequelize.STRING(191),
        allowNull: true,
        comment: 'Email khách vãng lai để gửi xác nhận vé',
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

    // Index theo tài liệu: bookings(status, user_id)
    await queryInterface.addIndex('bookings', ['status', 'user_id'], { name: 'bookings_status_user_idx' });
    await queryInterface.addIndex('bookings', ['booking_code']);
    await queryInterface.addIndex('bookings', ['flight_id']);
    await queryInterface.addIndex('bookings', ['hold_expires_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('bookings');
  },
};
