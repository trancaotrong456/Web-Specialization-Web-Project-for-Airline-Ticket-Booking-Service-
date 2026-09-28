'use strict';

/**
 * Replaces the legacy MoMo option with payOS/VietQR.
 * Existing demo records are relabelled in the same migration so the ENUM can
 * be narrowed without a database constraint error.
 */
module.exports = {
  async up(queryInterface) {
    // MySQL/TiDB DDL commits implicitly, so these statements must be ordered
    // rather than wrapped in a transaction. First allow the new value, then
    // convert old demo data, and only then remove the legacy enum value.
    await queryInterface.sequelize.query(
      "ALTER TABLE payments MODIFY COLUMN payment_method ENUM('vnpay', 'momo', 'payos') NOT NULL"
    );
    await queryInterface.sequelize.query(
      "UPDATE payments SET payment_method = 'payos' WHERE payment_method = 'momo'"
    );
    await queryInterface.sequelize.query(
      "ALTER TABLE payments MODIFY COLUMN payment_method ENUM('vnpay', 'payos') NOT NULL"
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      "ALTER TABLE payments MODIFY COLUMN payment_method ENUM('vnpay', 'payos', 'momo') NOT NULL"
    );
    await queryInterface.sequelize.query(
      "UPDATE payments SET payment_method = 'momo' WHERE payment_method = 'payos'"
    );
    await queryInterface.sequelize.query(
      "ALTER TABLE payments MODIFY COLUMN payment_method ENUM('vnpay', 'momo') NOT NULL"
    );
  },
};
