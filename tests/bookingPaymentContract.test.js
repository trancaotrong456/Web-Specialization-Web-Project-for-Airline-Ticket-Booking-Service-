const test = require('node:test');
const assert = require('node:assert/strict');
const { validationResult } = require('express-validator');
const bookingValidators = require('../validators/booking.validator');
const ticketValidators = require('../validators/ticket.validator');
const paymentValidators = require('../validators/payment.validator');
const bookingController = require('../controllers/booking.controller');
const ticketController = require('../controllers/ticket.controller');
const paymentController = require('../controllers/payment.controller');
const bookingService = require('../services/booking.service');
const ticketService = require('../services/ticket.service');
const paymentService = require('../services/payment.service');

async function runValidators(chains, req) {
  for (const chain of chains) await chain.run(req);
  return validationResult(req).array();
}

const request = ({ body = {}, query = {}, params = {}, user = null } = {}) => ({ body, query, params, user });

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
    setHeader(name, value) { this.headers[name] = value; },
    end(value) { this.body = value; return this; },
  };
}

const nextOrThrow = (error) => { if (error) throw error; };

test('authenticated booking does not require guest_email and normalizes it when supplied', async () => {
  const authenticated = request({
    user: { id: 7 },
    body: { flight_id: 2, fare_class_id: 3, passengers: [{ passenger_name: 'An' }] },
  });
  assert.deepEqual(await runValidators(bookingValidators.createBookingValidator, authenticated), []);

  const withEmail = request({
    user: { id: 7 },
    body: { flight_id: 2, fare_class_id: 3, passengers: [{ passenger_name: 'An' }], guest_email: '  Guest@Example.com  ' },
  });
  assert.deepEqual(await runValidators(bookingValidators.createBookingValidator, withEmail), []);
  assert.equal(withEmail.body.guest_email, 'guest@example.com');
});

test('guest booking requires a valid guest_email and normalizes it', async () => {
  const base = { flight_id: 2, fare_class_id: 3, passengers: [{ passenger_name: 'An' }] };
  const missing = request({ body: { ...base } });
  assert.ok((await runValidators(bookingValidators.createBookingValidator, missing))
    .some((error) => error.path === 'guest_email'));

  const malformed = request({ body: { ...base, guest_email: 'not-an-email' } });
  assert.ok((await runValidators(bookingValidators.createBookingValidator, malformed))
    .some((error) => error.path === 'guest_email'));

  const valid = request({ body: { ...base, guest_email: ' Guest@Example.com ' } });
  assert.deepEqual(await runValidators(bookingValidators.createBookingValidator, valid), []);
  assert.equal(valid.body.guest_email, 'guest@example.com');
});

test('booking detail requires guest_email for guests but not authenticated owners', async () => {
  const guestMissing = request({ params: { id: '12' } });
  assert.ok((await runValidators(bookingValidators.bookingAccessEmailValidator, guestMissing))
    .some((error) => error.path === 'guest_email'));

  const guest = request({ params: { id: '12' }, query: { guest_email: ' Guest@Example.com ' } });
  assert.deepEqual(await runValidators(bookingValidators.bookingAccessEmailValidator, guest), []);
  assert.equal(guest.query.guest_email, 'guest@example.com');

  const owner = request({ params: { id: '12' }, user: { id: 7 } });
  assert.deepEqual(await runValidators(bookingValidators.bookingAccessEmailValidator, owner), []);
});

test('lookup accepts canonical guest_email and the legacy email alias, rejecting conflicts', async () => {
  const canonical = request({ params: { code: 'BK123456' }, query: { guest_email: ' Guest@Example.com ' } });
  assert.deepEqual(await runValidators(bookingValidators.lookupBookingValidator, canonical), []);
  assert.equal(canonical.query.guest_email, 'guest@example.com');

  const legacy = request({ params: { code: 'BK123456' }, query: { email: ' Guest@Example.com ' } });
  assert.deepEqual(await runValidators(bookingValidators.lookupBookingValidator, legacy), []);
  assert.equal(legacy.query.email, 'guest@example.com');

  const conflict = request({ params: { code: 'BK123456' }, query: {
    guest_email: 'guest@example.com', email: 'other@example.com',
  } });
  assert.ok((await runValidators(bookingValidators.lookupBookingValidator, conflict))
    .some((error) => /must match/i.test(error.msg)));
});

test('ticket accepts canonical guest_email and legacy email, rejecting conflicting aliases', async () => {
  const canonical = request({ params: { id: '12' }, query: { guest_email: ' Guest@Example.com ' } });
  assert.deepEqual(await runValidators(ticketValidators.downloadTicketValidator, canonical), []);
  assert.equal(canonical.query.guest_email, 'guest@example.com');

  const legacy = request({ params: { id: '12' }, query: { email: ' Guest@Example.com ' } });
  assert.deepEqual(await runValidators(ticketValidators.downloadTicketValidator, legacy), []);
  assert.equal(legacy.query.email, 'guest@example.com');

  const conflict = request({ params: { id: '12' }, query: {
    guest_email: 'guest@example.com', email: 'other@example.com',
  } });
  assert.ok((await runValidators(ticketValidators.downloadTicketValidator, conflict))
    .some((error) => /must match/i.test(error.msg)));
});

test('guest cancellation requires guest_email while authenticated owners do not', async () => {
  const guestMissing = request({ params: { id: '12' } });
  assert.ok((await runValidators(bookingValidators.cancelBookingValidator, guestMissing))
    .some((error) => error.path === 'guest_email'));

  const owner = request({ params: { id: '12' }, user: { id: 7 } });
  assert.deepEqual(await runValidators(bookingValidators.cancelBookingValidator, owner), []);

  const guest = request({ params: { id: '12' }, body: { guest_email: ' Guest@Example.com ' } });
  assert.deepEqual(await runValidators(bookingValidators.cancelBookingValidator, guest), []);
  assert.equal(guest.body.guest_email, 'guest@example.com');
});

test('payment initiate requires guest_email only for guests and normalizes supplied values', async () => {
  const guestMissing = request({ body: { booking_id: 12, payment_method: 'vnpay' } });
  assert.ok((await runValidators(paymentValidators.initiatePaymentValidator, guestMissing))
    .some((error) => error.path === 'guest_email'));

  const guest = request({ body: {
    booking_id: 12, payment_method: 'payos', guest_email: ' Guest@Example.com ',
  } });
  assert.deepEqual(await runValidators(paymentValidators.initiatePaymentValidator, guest), []);
  assert.equal(guest.body.guest_email, 'guest@example.com');

  const owner = request({ user: { id: 7 }, body: { booking_id: 12, payment_method: 'vnpay' } });
  assert.deepEqual(await runValidators(paymentValidators.initiatePaymentValidator, owner), []);
});

test('revenue validator rejects a reversed date range with 422 validation errors', async () => {
  const reversed = request({ query: {
    from_date: '2026-10-09', to_date: '2026-10-08', group_by: 'day',
  } });
  assert.ok((await runValidators(paymentValidators.revenueValidator, reversed))
    .some((error) => /from_date must be before or equal to to_date/i.test(error.msg)));

  const inclusive = request({ query: {
    from_date: '2026-10-08', to_date: '2026-10-08', group_by: 'month',
  } });
  assert.deepEqual(await runValidators(paymentValidators.revenueValidator, inclusive), []);
});

test('controllers pass normalized canonical guest email values to the services', async (t) => {
  const received = {};
  t.mock.method(bookingService, 'createHoldingBooking', async (payload) => { received.create = payload; return {}; });
  t.mock.method(bookingService, 'getBookingById', async (...args) => { received.detail = args; return {}; });
  t.mock.method(bookingService, 'getBookingByCode', async (...args) => { received.lookup = args; return {}; });
  t.mock.method(bookingService, 'cancelHoldingBooking', async (...args) => { received.cancel = args; return {}; });
  t.mock.method(ticketService, 'generateTicketPDF', async (...args) => { received.ticket = args; return Buffer.from('pdf'); });
  t.mock.method(paymentService, 'initiatePayment', async (payload) => { received.payment = payload; return {}; });

  let res = responseRecorder();
  await bookingController.createBooking({ body: { guest_email: ' Guest@Example.com ' }, user: null }, res, nextOrThrow);
  assert.equal(received.create.guest_email, 'guest@example.com');

  res = responseRecorder();
  await bookingController.getBookingById({ params: { id: '12' }, query: { guest_email: ' Guest@Example.com ' }, user: null }, res, nextOrThrow);
  assert.equal(received.detail[2], 'guest@example.com');

  res = responseRecorder();
  await bookingController.lookupBooking({ params: { code: 'BK123456' }, query: { guest_email: ' Guest@Example.com ' }, user: null }, res, nextOrThrow);
  assert.deepEqual(received.lookup, ['BK123456', 'guest@example.com']);

  res = responseRecorder();
  await bookingController.cancelBooking({ params: { id: '12' }, body: { guest_email: ' Guest@Example.com ' }, user: null }, res, nextOrThrow);
  assert.equal(received.cancel[2], 'guest@example.com');

  res = responseRecorder();
  await ticketController.downloadTicket({ params: { id: '12' }, query: { email: ' Guest@Example.com ' }, user: null }, res, nextOrThrow);
  assert.equal(received.ticket[2], 'guest@example.com');

  res = responseRecorder();
  await paymentController.initiatePayment({
    body: { booking_id: 12, payment_method: 'vnpay', guest_email: ' Guest@Example.com ' },
    headers: {}, socket: { remoteAddress: '127.0.0.1' }, user: null,
  }, res, nextOrThrow);
  assert.equal(received.payment.guest_email, 'guest@example.com');
});

test('controllers reject conflicting legacy and canonical guest email values', async (t) => {
  t.mock.method(bookingService, 'getBookingByCode', async () => assert.fail('service must not be called'));
  const res = responseRecorder();
  let caught;
  await bookingController.lookupBooking({
    params: { code: 'BK123456' },
    query: { guest_email: 'guest@example.com', email: 'other@example.com' },
  }, res, (error) => { caught = error; });
  assert.equal(caught.statusCode, 422);
  assert.match(caught.message, /must match/i);
});
