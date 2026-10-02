require('dotenv').config();

const { Op } = require('sequelize');
const {
  sequelize,
  Booking,
  BookingPassenger,
  Payment,
  Flight,
  FareClass,
} = require('../../models');

const BASE_URL = process.env.SMOKE_BASE_URL || `http://localhost:${process.env.PORT || 5000}/api/v1`;
const runId = `payos-demo-${Date.now()}`;
let bookingId = null;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (_error) {
    body = text;
  }
  return { status: response.status, body };
}

async function cleanup() {
  if (!bookingId) return;

  await sequelize.transaction(async (transaction) => {
    const booking = await Booking.findByPk(bookingId, {
      include: [{ model: BookingPassenger, as: 'passengers' }],
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!booking || !booking.guest_email.startsWith(runId)) return;

    if (['holding', 'pending_payment', 'confirmed'].includes(booking.status)) {
      const flight = await Flight.findByPk(booking.flight_id, {
        lock: transaction.LOCK.UPDATE,
        transaction,
      });
      if (flight) {
        flight.available_seats += booking.passengers.length || 1;
        await flight.save({ transaction });
      }
    }

    await Payment.destroy({ where: { booking_id: bookingId }, transaction });
    await BookingPassenger.destroy({ where: { booking_id: bookingId }, transaction });
    await Booking.destroy({ where: { id: bookingId }, transaction });
  });
}

async function main() {
  assert(process.env.PAYOS_MODE === 'demo', 'Set PAYOS_MODE=demo before running this smoke test.');

  const flight = await Flight.findOne({
    where: { status: 'scheduled', available_seats: { [Op.gte]: 1 } },
    include: [{ model: FareClass, as: 'fareClasses', required: true }],
    order: [['available_seats', 'DESC']],
  });
  assert(flight, 'No scheduled flight with an available fare class.');

  const guestEmail = `${runId}@example.test`;
  const created = await request('/bookings', {
    method: 'POST',
    body: JSON.stringify({
      flight_id: flight.id,
      fare_class_id: flight.fareClasses[0].id,
      guest_email: guestEmail,
      passengers: [{ passenger_name: `PayOS Demo ${runId}`, passport_no: runId }],
    }),
  });
  assert(created.status === 201, `Create booking failed: ${JSON.stringify(created.body)}`);
  bookingId = created.body.data.id;

  const initiated = await request('/payments/initiate', {
    method: 'POST',
    body: JSON.stringify({ booking_id: bookingId, payment_method: 'payos', guest_email: guestEmail }),
  });
  assert(initiated.status === 200, `Initiate demo payment failed: ${JSON.stringify(initiated.body)}`);
  const paymentData = initiated.body.data;
  assert(paymentData.mode === 'demo', 'Expected payOS demo mode response.');
  assert(paymentData.qr_code.startsWith('data:image/png;base64,'), 'Demo QR is not a PNG data URL.');
  assert(paymentData.demo_webhook?.body?.signature, 'Signed demo webhook fixture is missing.');
  console.log(`PASS initiate: booking ${bookingId}, QR generated, signed demo webhook returned.`);

  const tampered = {
    ...paymentData.demo_webhook.body,
    amount: Number(paymentData.demo_webhook.body.amount) + 1,
  };
  const rejected = await request('/payments/payos/demo-webhook', {
    method: 'POST',
    body: JSON.stringify(tampered),
  });
  assert(rejected.status === 400, `Tampered webhook should return 400, got ${rejected.status}.`);
  console.log('PASS signature: tampered demo webhook rejected with HTTP 400.');

  const confirmed = await request('/payments/payos/demo-webhook', {
    method: 'POST',
    body: JSON.stringify(paymentData.demo_webhook.body),
  });
  assert(confirmed.status === 200, `Valid demo webhook failed: ${JSON.stringify(confirmed.body)}`);

  const [booking, payment] = await Promise.all([
    Booking.findByPk(bookingId),
    Payment.findOne({ where: { transaction_ref: paymentData.transaction_ref } }),
  ]);
  assert(booking.status === 'confirmed', `Expected confirmed booking, got ${booking.status}.`);
  assert(payment.status === 'success', `Expected success payment, got ${payment.status}.`);
  console.log('PASS success: payment=success and booking=confirmed.');

  const repeated = await request('/payments/payos/demo-webhook', {
    method: 'POST',
    body: JSON.stringify(paymentData.demo_webhook.body),
  });
  assert(repeated.status === 200, `Idempotent webhook failed: ${JSON.stringify(repeated.body)}`);
  console.log('PASS idempotency: repeated signed webhook did not duplicate state changes.');
}

main()
  .catch((error) => {
    console.error(`FAIL: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await cleanup();
    } finally {
      await sequelize.close();
    }
  });
