'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createFlightStatusNotificationAdapter, FLIGHT_STATUS_EVENT_TYPES } = require('../modules/notification/flightStatusNotificationAdapter');

test('Flight Status event contract maps delayed, cancelled and schedule changes without importing an unmerged producer', async () => {
  const events = [];
  const adapter = createFlightStatusNotificationAdapter({ publisher: { publish: async (event, options) => events.push({ event, options }) } });
  const transaction = { id: 'flight-status-tx' };

  for (const [changeType, eventType] of Object.entries(FLIGHT_STATUS_EVENT_TYPES)) {
    await adapter.handleFlightStatusChanged({ eventId: `${changeType}-v1`, flightId: 88, changeType, recipients: [{ userId: 4, flightCode: 'SF088' }], transaction });
    assert.equal(events.at(-1).event.eventType, eventType);
    assert.equal(events.at(-1).event.relatedType, 'flight');
    assert.equal(events.at(-1).options.transaction, transaction);
  }
  assert.equal(events.length, 3);
});

test('Flight Status contract rejects unstable event identity and ignores guests without an account', async () => {
  const events = [];
  const adapter = createFlightStatusNotificationAdapter({ publisher: { publish: async (...args) => events.push(args) } });
  await assert.rejects(adapter.handleFlightStatusChanged({ flightId: 88, changeType: 'cancelled' }), /stable eventId/);
  assert.deepEqual(await adapter.handleFlightStatusChanged({ eventId: 'e1', flightId: 88, changeType: 'cancelled', recipients: [{ email: 'guest@example.test' }] }), []);
  assert.equal(events.length, 0);
});
