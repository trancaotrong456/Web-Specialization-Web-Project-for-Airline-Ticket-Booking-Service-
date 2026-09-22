'use strict';
const { faker } = require('@faker-js/faker');

const BATCH_SIZE = 5_000;

function paymentStatusForBooking(booking) {
  switch (booking.status) {
    case 'holding':
      return null;
    case 'pending_payment':
      return 'pending';
    case 'confirmed':
      return 'success';
    case 'cancelled':
      // A cancelled booking may represent a completed refund or a failed attempt.
      return Number(booking.id) % 2 === 0 ? 'refunded' : 'failed';
    case 'expired':
      // Some holds expire without a payment attempt; failed attempts are retained.
      return Number(booking.id) % 2 === 0 ? 'failed' : null;
    default:
      throw new Error(`Unsupported booking status while seeding payments: ${booking.status}`);
  }
}

function makePayment(booking, paymentId) {
  const status = paymentStatusForBooking(booking);
  if (!status) return null;

  const createdAt = faker.date.between({ from: '2025-01-01', to: new Date() });
  const paidAt = ['success', 'refunded'].includes(status)
    ? new Date(createdAt.getTime() + 5 * 60 * 1000)
    : null;

  return {
    id: paymentId,
    booking_id: booking.id,
    amount: faker.number.int({ min: 800_000, max: 6_000_000 }),
    payment_method: faker.helpers.arrayElement(['vnpay', 'momo']),
    status,
    transaction_ref: `TXN${String(booking.id).padStart(9, '0')}`,
    paid_at: paidAt,
    created_at: createdAt,
    updated_at: new Date(),
  };
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const [bookings] = await queryInterface.sequelize.query(
      'SELECT id, status FROM bookings ORDER BY id ASC'
    );

    let paymentId = 1;
    let batch = [];
    for (const booking of bookings) {
      const payment = makePayment(booking, paymentId);
      if (!payment) continue;

      paymentId += 1;
      batch.push(payment);
      if (batch.length === BATCH_SIZE) {
        await queryInterface.bulkInsert('payments', batch, {});
        batch = [];
      }
    }

    if (batch.length > 0) {
      await queryInterface.bulkInsert('payments', batch, {});
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('payments', null, {});
  },
};
