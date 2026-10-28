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

test('outbox completion rejects a claimed event without its primary key before Sequelize update', async () => {
  let updates = 0;
  const repository = new SequelizeNotificationOutboxRepository({
    NotificationOutbox: { update: async () => { updates += 1; } }, sequelize: {}, Op: {},
  });
  await assert.rejects(repository.saveClaimed({ status: 'processed' }, 'lease'), (error) => error.code === 'OUTBOX_ID_MISSING');
  assert.equal(updates, 0);
});

test('outbox completion uses a Sequelize-like dataValues/get id when direct id is absent', async () => {
  let update;
  const repository = new SequelizeNotificationOutboxRepository({
    NotificationOutbox: { update: async (...args) => { update = args; return [1]; } }, sequelize: {}, Op: {},
  });
  const event = {
    dataValues: { id: 77, status: 'processed' },
    get: (key) => key === 'id' ? 77 : { ...event.dataValues },
  };
  await repository.saveClaimed(event, 'lease-current');
  assert.equal(update[1].where.id, 77);
});
