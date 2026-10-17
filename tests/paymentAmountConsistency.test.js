'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const PaymentService = require('../modules/payment/payment.service');
const { AncillariesService } = require('../modules/ancillaries/ancillaries.service');
const FareClassService = require('../modules/fare-class/fareClass.service');

test('a fractional-VND booking cannot create a payment intent or change booking status', async () => {
  const booking = { id: 7, booking_code: 'VND7', total_amount: '250000.49', status: 'holding', user_id: null, guest_email: 'guest@example.test' };
  let created = 0;
  const service = new PaymentService({
    repository: {
      findLockedBooking: async () => booking,
      createStatusHistory: async () => ({}),
      save: async () => booking,
      createPayment: async (values) => { created += 1; return values; },
    },
    transactionManager: { transaction: async (run) => run({ LOCK: { UPDATE: 'UPDATE' } }) },
  });
  await assert.rejects(service.initiatePayment({ booking_id: 7, payment_method: 'vnpay', guest_email: 'guest@example.test' }),
    (error) => error.statusCode === 400 && /VND/.test(error.message));
  assert.equal(booking.status, 'holding');
  assert.equal(created, 0);
});

test('payOS callback cannot confirm a different amount merely because rounding matches', async () => {
  const service = new PaymentService({
    repository: { findPaymentWithBookingByRef: async () => ({ amount: '250000.49', booking: { status: 'pending_payment' } }) },
    transactionManager: { transaction: async () => { throw new Error('amount mismatch must stop before transaction'); } },
  });
  await assert.rejects(service._processVerifiedPayosWebhook({ orderCode: 7, amount: 250000, isSuccess: true }),
    (error) => error.statusCode === 400 && /amount/i.test(error.message));
});

test('Admin cannot configure a fractional-VND offer', async () => {
  const service = new AncillariesService({
    repository: {
      findService: async () => ({ id: 1 }),
      findFlight: async () => ({ id: 1 }),
      findFareClassForFlight: async () => ({ id: 1 }),
      createOffer: async () => { throw new Error('fractional offer must not persist'); },
    },
    transactionManager: { transaction: async (run) => run({}) },
  });
  await assert.rejects(service.saveOffer(null, {
    ancillary_service_id: 1, flight_id: 1, fare_class_id: 1, offer_name: 'Bag',
    unit_price: '250000.50', currency: 'VND', capacity: 1, refund_policy: 'refundable',
  }), (error) => error.statusCode === 400 && /VND/.test(error.message));
});

test('Admin cannot configure a fractional-VND FareClass price', async () => {
  const service = new FareClassService({ repository: { findFlightById: async () => ({ id: 1 }), create: async () => { throw new Error('fractional fare must not persist'); } } });
  await assert.rejects(service.create({ flight_id: 1, class_name: 'Economy', price: '500000.50' }),
    (error) => error.statusCode === 400 && /VND/.test(error.message));
});

test('refund rejects a Booking/Payment amount mismatch before releasing seats or services', async () => {
  const booking = { id: 7, status: 'confirmed', total_amount: '262500.00' };
  const payment = { amount: '250000.00', status: 'success' };
  let mutations = 0;
  const service = new PaymentService({
    repository: {
      findRefundBooking: async () => booking,
      findSuccessfulPaymentForRefund: async () => payment,
      save: async () => { mutations += 1; },
    },
    transactionManager: { transaction: async (run) => run({ LOCK: { UPDATE: 'UPDATE' } }) },
    ancillaryService: { assertWholeBookingRefundAllowed: async () => { mutations += 1; }, releaseBooking: async () => { mutations += 1; } },
    seatSelectionService: { releaseBookingSeats: async () => { mutations += 1; } },
  });
  await assert.rejects(service.processRefund(7, 'CI mismatch', { id: 1, email: 'admin@example.test' }),
    (error) => error.statusCode === 409 && /amounts do not match/.test(error.message));
  assert.equal(mutations, 0);
  assert.equal(booking.status, 'confirmed');
  assert.equal(payment.status, 'success');
});
