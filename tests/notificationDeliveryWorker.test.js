'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { NotificationDeliveryWorker } = require('../modules/notification/notificationDeliveryWorker');

function event(overrides = {}) {
  return {
    id: 1, aggregate_id: 5, event_type: 'BOOKING_CREATED', recipient_user_id: 7, recipient_email: 'user@example.test',
    payload: { notificationId: 19, title: 'New booking', message: '<script>alert(1)</script>' },
    realtime_status: 'pending', email_status: 'pending', realtime_attempts: 0, email_attempts: 0,
    status: 'processing', available_at: new Date(0), lease_token: 'lease',
    ...overrides,
  };
}

test('worker sends minimal user-room payload and escapes email content after claim', async () => {
  const queued = event();
  const emitted = [];
  const mails = [];
  const saved = [];
  const worker = new NotificationDeliveryWorker({
    repository: { claimNext: async () => ({ event: queued, leaseToken: 'lease' }), saveClaimed: async (...args) => saved.push(args) },
    emailConfigured: () => true,
    getSocket: () => ({ to: (room) => ({ emit: (...args) => emitted.push([room, ...args]) }) }),
    emailProvider: { sendMail: async (mail) => mails.push(mail) },
    logger: { error() {} }, now: () => new Date(1000),
  });

  assert.equal(await worker.runOne(), true);
  assert.deepEqual(emitted, [['user:7', 'notification:new', { notificationId: 19, eventType: 'BOOKING_CREATED' }]]);
  assert.equal(mails[0].to, 'user@example.test');
  assert.match(mails[0].html, /&lt;script&gt;/);
  assert.equal(queued.status, 'processed');
  assert.equal(saved.length, 1);
});

test('worker retries temporary channel failure with bounded attempts and keeps the event', async () => {
  const queued = event({ realtime_status: 'sent', email_attempts: 0 });
  let savedEvent;
  const worker = new NotificationDeliveryWorker({
    repository: { claimNext: async () => ({ event: queued, leaseToken: 'lease' }), saveClaimed: async (value) => { savedEvent = value; } },
    emailConfigured: () => true,
    emailProvider: { sendMail: async () => { throw new Error('provider unavailable'); } },
    getSocket: () => ({}), logger: { error() {} }, maxAttempts: 3, now: () => new Date(5000),
  });

  await worker.runOne();
  assert.equal(savedEvent.status, 'pending');
  assert.equal(savedEvent.email_status, 'pending');
  assert.equal(savedEvent.email_attempts, 1);
  assert.equal(savedEvent.last_error, 'provider unavailable');
  assert.equal(savedEvent.available_at.getTime(), 6000);
});

test('guest flight notification retries email without emitting to any Socket.IO room', async () => {
  const queued = event({ event_type: 'FLIGHT_DELAYED', recipient_user_id: null,
    recipient_email: 'guest@example.test', realtime_status: 'skipped', email_status: 'pending' });
  const mails = [];
  let attempts = 0;
  const worker = new NotificationDeliveryWorker({
    repository: { claimNext: async () => ({ event: queued, leaseToken: 'lease' }), saveClaimed: async () => {} },
    emailConfigured: () => true,
    emailProvider: { sendMail: async (mail) => { attempts += 1; if (attempts === 1) throw new Error('temporary'); mails.push(mail); } },
    getSocket: () => { throw new Error('guest must not use Socket.IO'); }, logger: { error() {} },
  });
  await worker.runOne();
  assert.equal(queued.status, 'pending');
  assert.equal(queued.email_attempts, 1);
  await worker.runOne();
  assert.equal(queued.status, 'processed');
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to, 'guest@example.test');
  assert.equal(queued.realtime_status, 'skipped');
});

test('worker marks a channel terminal after the configured retry limit', async () => {
  const queued = event({ email_attempts: 2, realtime_status: 'sent' });
  const worker = new NotificationDeliveryWorker({
    repository: { claimNext: async () => ({ event: queued, leaseToken: 'lease' }), saveClaimed: async () => {} },
    emailConfigured: () => true,
    emailProvider: { sendMail: async () => { throw new Error('permanent'); } },
    getSocket: () => ({}), logger: { error() {} }, maxAttempts: 3,
  });
  await worker.runOne();
  assert.equal(queued.email_status, 'failed');
  assert.equal(queued.status, 'failed');
});

test('worker does not retry a provider rejection classified as permanent', async () => {
  const queued = event({ realtime_status: 'sent' });
  const worker = new NotificationDeliveryWorker({
    repository: { claimNext: async () => ({ event: queued, leaseToken: 'lease' }), saveClaimed: async () => {} },
    emailConfigured: () => true,
    emailProvider: { sendMail: async () => { const error = new Error('invalid recipient'); error.statusCode = 422; throw error; } },
    getSocket: () => ({}), logger: { error() {} }, maxAttempts: 5,
  });
  await worker.runOne();
  assert.equal(queued.email_status, 'failed');
  assert.equal(queued.status, 'failed');
  assert.equal(queued.email_attempts, 1);
});

test('worker skips email cleanly when provider configuration is absent', async () => {
  const queued = event({ realtime_status: 'sent' });
  let sendCalls = 0;
  const worker = new NotificationDeliveryWorker({
    repository: { claimNext: async () => ({ event: queued, leaseToken: 'lease' }), saveClaimed: async () => {} },
    emailProvider: { sendMail: async () => { sendCalls += 1; } },
    emailConfigured: () => false, getSocket: () => ({}), logger: { error() {} },
  });
  await worker.runOne();
  assert.equal(sendCalls, 0);
  assert.equal(queued.email_status, 'skipped');
  assert.equal(queued.status, 'processed');
});

test('worker keeps the outbox failed when another channel eventually succeeds after a permanent failure', async () => {
  const queued = event({ email_status: 'failed', realtime_status: 'pending' });
  const worker = new NotificationDeliveryWorker({
    repository: { claimNext: async () => ({ event: queued, leaseToken: 'lease' }), saveClaimed: async () => {} },
    emailProvider: { sendMail: async () => {} }, emailConfigured: () => true,
    getSocket: () => ({ to: () => ({ emit() {} }) }), logger: { error() {} },
  });
  await worker.runOne();
  assert.equal(queued.realtime_status, 'sent');
  assert.equal(queued.status, 'failed');
});
