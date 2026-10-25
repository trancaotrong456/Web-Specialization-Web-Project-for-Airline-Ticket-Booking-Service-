const test = require('node:test');
const assert = require('node:assert/strict');
const migration = require('../migrations/20261017190000-create-notifications-and-outbox');

test('Notification migration creates unique event keys, recipient ownership and reverse drop order', async () => {
  const calls = [];
  const queryInterface = {
    createTable: async (...args) => calls.push(['createTable', ...args]),
    addIndex: async (...args) => calls.push(['addIndex', ...args]),
    dropTable: async (...args) => calls.push(['dropTable', ...args]),
  };
  const Sequelize = {
    BIGINT: { UNSIGNED: 'BIGINT UNSIGNED' }, STRING: (length) => `STRING(${length})`, TEXT: 'TEXT', JSON: 'JSON',
    DATE: 'DATE', BOOLEAN: 'BOOLEAN', INTEGER: 'INTEGER', ENUM: (...values) => ({ enum: values }),
    literal: (value) => ({ literal: value }),
  };

  await migration.up(queryInterface, Sequelize);
  const outbox = calls.find((call) => call[0] === 'createTable' && call[1] === 'notification_outbox')[2];
  const inbox = calls.find((call) => call[0] === 'createTable' && call[1] === 'notifications')[2];
  assert.equal(outbox.event_key.unique, true);
  assert.equal(outbox.recipient_user_id.allowNull, true);
  assert.equal(outbox.recipient_email.allowNull, true);
  assert.deepEqual(outbox.realtime_status.type.enum, ['pending', 'sent', 'skipped', 'failed']);
  assert.equal(inbox.user_id.references.model, 'users');
  assert.equal(inbox.outbox_id.references.model, 'notification_outbox');
  assert.ok(calls.some((call) => call[0] === 'addIndex' && call[1] === 'notification_outbox'));

  calls.length = 0;
  await migration.down(queryInterface);
  assert.deepEqual(calls, [['dropTable', 'notifications'], ['dropTable', 'notification_outbox']]);
});
