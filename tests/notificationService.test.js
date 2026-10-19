const test = require('node:test');
const assert = require('node:assert/strict');
const NotificationService = require('../modules/notification/notification.service');

test('NotificationService scopes paginated inbox and unread count to the authenticated user', async () => {
  const calls = [];
  const repository = {
    listForUser: async (userId, options) => { calls.push(['list', userId, options]); return { count: 1, rows: [{ id: 8, user_id: userId }] }; },
    countUnreadForUser: async (userId) => { calls.push(['unread', userId]); return 3; },
  };
  const service = new NotificationService({ repository });

  assert.deepEqual(await service.listForUser(42, { page: '2', limit: '5' }), {
    total: 1, page: 2, limit: 5, data: [{ id: 8, user_id: 42 }],
  });
  assert.equal(await service.unreadCountForUser(42), 3);
  assert.deepEqual(calls, [['list', 42, { page: 2, limit: 5 }], ['unread', 42]]);
});

test('NotificationService never marks a notification belonging to another user as read', async () => {
  const repository = { markReadForUser: async () => null };
  const service = new NotificationService({ repository });

  await assert.rejects(service.markReadForUser(42, 9), (error) => error.statusCode === 404);
});

test('NotificationService rejects invalid pagination rather than issuing an unbounded query', async () => {
  let queried = false;
  const service = new NotificationService({ repository: { listForUser: async () => { queried = true; return { count: 0, rows: [] }; } } });

  await assert.rejects(service.listForUser(42, { page: '0', limit: '1000' }), (error) => error.statusCode === 400);
  assert.equal(queried, false);
});
