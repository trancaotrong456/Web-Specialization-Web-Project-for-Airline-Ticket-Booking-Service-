const test = require('node:test');
const assert = require('node:assert/strict');
const { recordBookingStatusTransition } = require('../modules/booking/bookingStatusHistory.util');

test('records only real booking status transitions in the active transaction', async () => {
  const transaction = { id: 'tx-1' };
  const booking = {
    id: 12,
    status: 'holding',
    async save(options) { assert.equal(options.transaction, transaction); },
  };
  const events = [];
  const repository = { save: async (row, options) => row.save(options), createStatusHistory: async (values, options) => {
    assert.equal(options.transaction, transaction);
    events.push(values);
  } };

  await recordBookingStatusTransition({
    booking, toStatus: 'cancelled', source: 'customer_cancel', actorUserId: 7,
    repository, transaction,
  });
  await recordBookingStatusTransition({
    booking, toStatus: 'cancelled', source: 'customer_cancel', actorUserId: 7,
    repository, transaction,
  });

  assert.equal(booking.status, 'cancelled');
  assert.deepEqual(events, [{
    booking_id: 12,
    from_status: 'holding',
    to_status: 'cancelled',
    source: 'customer_cancel',
    actor_user_id: 7,
  }]);
});

test('does not change booking state when status history persistence fails', async () => {
  const transaction = {};
  const booking = { id: 13, status: 'holding', async save() {} };
  const repository = { createStatusHistory: async () => { throw new Error('history write failed'); } };

  await assert.rejects(recordBookingStatusTransition({
    booking, toStatus: 'confirmed', source: 'payment_callback', repository, transaction,
  }), /history write failed/);
  assert.equal(booking.status, 'holding');
});
