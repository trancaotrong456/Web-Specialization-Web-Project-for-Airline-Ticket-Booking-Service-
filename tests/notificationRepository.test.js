const test = require('node:test');
const assert = require('node:assert/strict');
const { SequelizeNotificationRepository } = require('../modules/notification/notification.repository');

test('Notification repository scopes list and unread count by user and uses stable newest-first pagination', async () => {
  const calls = [];
  const Notification = {
    findAndCountAll: async (options) => { calls.push(['list', options]); return { count: 1, rows: [{ id: 1 }] }; },
    count: async (options) => { calls.push(['count', options]); return 2; },
  };
  const repository = new SequelizeNotificationRepository({ Notification });

  await repository.listForUser(41, { page: 2, limit: 10 });
  await repository.countUnreadForUser(41);
  assert.deepEqual(calls, [
    ['list', {
      where: { user_id: 41 }, limit: 10, offset: 10,
      order: [['created_at', 'DESC']],
      attributes: ['id', 'event_type', 'title', 'message', 'related_type', 'related_id', 'read_at', 'created_at'],
    }],
    ['count', { where: { user_id: 41, read_at: null } }],
  ]);
});

test('Notification repository cannot read or mark a notification without matching recipient ID', async () => {
  const calls = [];
  const Notification = {
    findOne: async (options) => {
      calls.push(['find', options]);
      const item = { id: 7, user_id: 41, read_at: null, update: async (value) => { calls.push(['update', value]); Object.assign(item, value); return item; } };
      return item;
    },
  };
  const repository = new SequelizeNotificationRepository({ Notification, now: () => new Date('2026-10-17T10:00:00.000Z') });

  const result = await repository.markReadForUser(41, 7);
  assert.equal(result.read_at.toISOString(), '2026-10-17T10:00:00.000Z');
  assert.deepEqual(calls, [
    ['find', { where: { id: 7, user_id: 41 } }],
    ['update', { read_at: new Date('2026-10-17T10:00:00.000Z') }],
  ]);
});
