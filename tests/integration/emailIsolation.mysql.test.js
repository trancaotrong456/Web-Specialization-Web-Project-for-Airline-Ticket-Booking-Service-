'use strict';

const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const emailService = require('../../services/email.service');
const paymentService = require('../../services/payment.service');
const { NotificationEventPublisher } = require('../../modules/notification/notificationEventPublisher');
const { models, verifyConnectedDatabase } = require('./helpers/mysqlTestDatabase');
const { cleanupTrackedFixtures, createFlightFixture, trackBooking, trackPayment } = require('./helpers/testFixtures');

before(async () => { await verifyConnectedDatabase(); });
after(async () => { await cleanupTrackedFixtures(); await models.sequelize.close(); });

test('IT-50 test email provider prevents external Resend calls', async () => {
  const oldFetch = global.fetch;
  const oldMode = process.env.EMAIL_DELIVERY_MODE;
  let calls = 0;
  process.env.NODE_ENV = 'test';
  process.env.EMAIL_DELIVERY_MODE = 'live';
  global.fetch = async () => { calls += 1; throw new Error('external email call'); };
  try {
    const result = await emailService.sendMail({ to: 'integration@example.test', subject: 'test', html: '<p>test</p>' });
    assert.equal(result.skipped, true);
    assert.equal(calls, 0);
  } finally {
    global.fetch = oldFetch;
    if (oldMode === undefined) delete process.env.EMAIL_DELIVERY_MODE; else process.env.EMAIL_DELIVERY_MODE = oldMode;
    emailService.resetAdapter();
  }
});

test('IT-51 email failure after commit is contained by the post-commit notifier', async () => {
  const original = emailService.sendBookingConfirmation;
  const originalError = console.error;
  let logged = 0;
  emailService.sendBookingConfirmation = async () => { throw new Error('delivery unavailable'); };
  console.error = () => { logged += 1; };
  try {
    await paymentService._triggerBookingConfirmationEmail(987654);
    assert.equal(logged, 1);
  } finally {
    emailService.sendBookingConfirmation = original;
    console.error = originalError;
  }
});

test('IT-52 committed success/outbox survives email failure and retry', async () => {
  const fixture = await createFlightFixture({ availableSeats: 1, totalSeats: 1 });
  const booking = await models.Booking.create({
    booking_code: `EM${Date.now().toString(36).slice(-8).toUpperCase()}`,
    flight_id: fixture.flight.id,
    fare_class_id: fixture.fareClass.id,
    status: 'confirmed',
    total_amount: 1000000,
    guest_email: 'email-isolation@example.test',
  });
  trackBooking(booking);
  const payment = await models.Payment.create({
    booking_id: booking.id,
    amount: 1000000,
    payment_method: 'payos',
    status: 'success',
    transaction_ref: `email-isolation-${Date.now()}`,
    paid_at: new Date(),
  });
  trackPayment(payment);
  const publisher = new NotificationEventPublisher({
    NotificationOutbox: models.NotificationOutbox,
    Notification: models.Notification,
    User: models.User,
  });
  await models.sequelize.transaction(async (transaction) => {
    await publisher.publish({
      eventKey: `payment:${payment.id}:succeeded`,
      eventType: 'PAYMENT_SUCCEEDED',
      aggregateType: 'booking',
      aggregateId: booking.id,
      recipientEmail: booking.guest_email,
      relatedType: 'booking',
      relatedId: booking.id,
      variables: { code: booking.booking_code },
    }, { transaction });
  });
  const original = emailService.sendBookingConfirmation;
  let attempts = 0;
  emailService.sendBookingConfirmation = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('delivery unavailable');
    return { id: 'retry-success' };
  };
  try {
    await paymentService._triggerBookingConfirmationEmail(booking.id);
    assert.equal((await models.Payment.findByPk(payment.id)).status, 'success');
    assert.equal((await models.Booking.findByPk(booking.id)).status, 'confirmed');
    assert.equal(await models.NotificationOutbox.count({ where: { event_key: `payment:${payment.id}:succeeded` } }), 1);
    await paymentService._triggerBookingConfirmationEmail(booking.id);
    assert.equal(attempts, 2);
    assert.equal((await models.Payment.findByPk(payment.id)).status, 'success');
    assert.equal((await models.Booking.findByPk(booking.id)).status, 'confirmed');
  } finally {
    emailService.sendBookingConfirmation = original;
  }
});
