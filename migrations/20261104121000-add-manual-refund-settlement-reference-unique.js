'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.addIndex('manual_payment_refund_requests', ['settlement_reference'], {
      unique: true,
      name: 'manual_refund_settlement_reference_uq',
    });
  },
  async down(queryInterface) {
    await queryInterface.removeIndex('manual_payment_refund_requests', 'manual_refund_settlement_reference_uq');
  },
};
