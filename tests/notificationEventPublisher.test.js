'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { NotificationEventPublisher } = require('../modules/notification/notificationEventPublisher');

test('notification inbox and outbox are persisted with the business transaction and stable event key', async () => {
  const calls = [];
  const outbox = { id: 91, payload: null, save: async (options) => calls.push(['save-outbox', options]) };
  const publisher = new NotificationEventPublisher({
    NotificationOutbox: { findOne: async () => null, create: async (data, options) => { Object.assign(outbox, data); calls.push(['outbox', data, options]); return outbox; } },
    Notification: { findOne: async () => null, create: async (data, options) => { calls.push(['inbox', data, options]); return { id: 42, ...data }; } },
    User: { findByPk: async (id, options) => { calls.push(['user', id, options]); return { email: 'user@example.test' }; } },
  });
  const transaction = { id: 'tx-1' };

  const result = await publisher.publish({
    eventKey: 'booking:5:confirmed', eventType: 'BOOKING_CONFIRMED', aggregateType: 'booking',
    aggregateId: 5, recipientUserId: 3, relatedType: 'booking', relatedId: 5, variables: { code: 'BK123' },
  }, { transaction });

  assert.equal(result.notification.id, 42);
  assert.equal(result.outbox.event_key, 'booking:5:confirmed');
  assert.equal(result.outbox.payload.title, 'Đặt chỗ đã được xác nhận');
  assert.equal(result.outbox.payload.message, 'Đặt chỗ BK123 đã được xác nhận.');
  assert.equal(result.outbox.payload.notificationId, 42);
  assert.ok(calls.filter((call) => call.at(-1)?.transaction === transaction).length >= 4);
});

test('notification publisher rejects unsupported or incomplete events instead of writing ambiguous records', async () => {
  const publisher = new NotificationEventPublisher({ NotificationOutbox: {}, Notification: {} });
  await assert.rejects(publisher.publish({ eventKey: 'x', eventType: 'UNKNOWN', aggregateType: 'booking' }), /Unsupported/);
  await assert.rejects(publisher.publish({ eventType: 'BOOKING_CREATED', aggregateType: 'booking' }), /identity/);
});

test('duplicate event key returns the existing event without adding a second inbox item', async () => {
  const rows = new Map();
  const inbox = [];
  const publisher = new NotificationEventPublisher({
    NotificationOutbox: {
      findOne: async ({ where }) => rows.get(where.event_key) || null,
      create: async (data) => { const row = { id: rows.size + 1, ...data, async save() {} }; rows.set(data.event_key, row); return row; },
    },
    Notification: {
      create: async (data) => { const row = { id: inbox.length + 1, ...data }; inbox.push(row); return row; },
      findOne: async ({ where }) => inbox.find((row) => row.outbox_id === where.outbox_id) || null,
    },
    User: { findByPk: async () => ({ email: 'user@example.test' }) },
  });
  const event = { eventKey: 'payment:7:succeeded', eventType: 'PAYMENT_SUCCEEDED', aggregateType: 'booking', aggregateId: 8, recipientUserId: 9, relatedType: 'booking', relatedId: 8, variables: { code: 'BK8' } };
  const first = await publisher.publish(event);
  const second = await publisher.publish(event);
  assert.equal(first.outbox, second.outbox);
  assert.equal(first.notification, second.notification);
  assert.equal(rows.size, 1);
  assert.equal(inbox.length, 1);
});

test('an event key cannot be reused for a different business payload', async () => {
  const stored = { id: 1, event_key: 'same-key', event_type: 'BOOKING_CREATED', aggregate_type: 'booking', aggregate_id: 1, recipient_user_id: 2, payload: { title: 'Original', message: 'Original' } };
  const publisher = new NotificationEventPublisher({
    NotificationOutbox: { findOne: async () => stored, create: async () => assert.fail('must not create') },
    Notification: { findOne: async () => null, create: async () => assert.fail('must not create') },
  });
  await assert.rejects(publisher.publish({ eventKey: 'same-key', eventType: 'BOOKING_CREATED', aggregateType: 'booking', aggregateId: 99, recipientUserId: 2, variables: { code: 'BK99' } }), (error) => error.statusCode === 409);
});
