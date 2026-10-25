'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SequelizeNotificationOutboxRepository } = require('../modules/notification/notificationOutbox.repository');

test('outbox claims use a transactional row lock with skip-locked for concurrent workers', async () => {
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  const calls = [];
  const row = { id: 5, save: async (options) => calls.push(['save', options]) };
  const repository = new SequelizeNotificationOutboxRepository({
    NotificationOutbox: { findOne: async (options) => { calls.push(['find', options]); return row; } },
    sequelize: { transaction: async (work) => work(transaction) },
    Op: { or: Symbol('or'), lte: Symbol('lte') }, now: () => new Date('2026-10-17T00:00:00Z'),
  });

  const claim = await repository.claimNext();
  assert.equal(claim.event, row);
  assert.equal(typeof claim.leaseToken, 'string');
  assert.equal(row.status, 'processing');
  assert.equal(calls[0][1].transaction, transaction);
  assert.equal(calls[0][1].lock, transaction.LOCK.UPDATE);
  assert.equal(calls[0][1].skipLocked, true);
  assert.equal(calls[1][1].transaction, transaction);
  assert.ok(row.lease_expires_at > new Date('2026-10-17T00:00:00Z'));
});

test('outbox completion is conditional on the current lease to prevent stale workers overwriting a retry', async () => {
  let update;
  const repository = new SequelizeNotificationOutboxRepository({
    NotificationOutbox: { update: async (...args) => { update = args; return [0]; } },
    sequelize: {}, Op: {},
  });
  const event = { id: 5, status: 'processed', payload: {}, last_error: null };
  const result = await repository.saveClaimed(event, 'lease-current');
  assert.deepEqual(result, [0]);
  assert.deepEqual(update[1].where, { id: 5, status: 'processing', lease_token: 'lease-current' });
});
