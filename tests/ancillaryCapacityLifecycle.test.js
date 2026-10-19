'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { AncillariesService } = require('../modules/ancillaries/ancillaries.service');

function fixture({ processing = false } = {}) {
  const lines = [
    { id: 1, booking_id: 40, offer_id: 5, quantity: 2, status: 'held' },
    { id: 2, booking_id: 40, offer_id: 6, quantity: 1, status: 'held' },
  ];
  const capacity = new Map([[5, 2], [6, 1]]);
  const events = [];
  const repository = {
    hasProcessingPayment: async () => processing,
    findBookingAncillariesForUpdate: async () => lines,
    transitionBookingAncillary: async (id, expected, next) => {
      const line = lines.find((item) => item.id === id);
      if (line.status !== expected) return false;
      line.status = next;
      events.push(['transition', id, expected, next]);
      return true;
    },
    adjustReservedQuantity: async (id, delta) => {
      capacity.set(id, capacity.get(id) + delta);
      events.push(['capacity', id, delta]);
      return true;
    },
  };
  return { service: new AncillariesService({ repository }), lines, capacity, events };
}

test('successful payment confirms each held ancillary exactly once', async () => {
  const f = fixture();
  await f.service.confirmBooking(40, {});
  await f.service.confirmBooking(40, {});
  assert.deepEqual(f.lines.map((line) => line.status), ['confirmed', 'confirmed']);
  assert.equal(f.events.filter(([kind]) => kind === 'transition').length, 2);
  assert.deepEqual([...f.capacity.values()], [2, 1], 'confirmation retains reserved capacity');
});

test('cancel or expiry releases held capacity once and duplicate calls do not decrement twice', async () => {
  const f = fixture();
  assert.equal(await f.service.releaseBooking(40, { transaction: {}, reason: 'expired' }), true);
  assert.equal(await f.service.releaseBooking(40, { transaction: {}, reason: 'expired' }), false);
  assert.deepEqual(f.lines.map((line) => line.status), ['released', 'released']);
  assert.deepEqual([...f.capacity.values()], [0, 0]);
});

test('valid pending payment blocks ancillary release without changing state or capacity', async () => {
  const f = fixture({ processing: true });
  await assert.rejects(f.service.releaseBooking(40, { transaction: {}, reason: 'expired' }), (error) => error.statusCode === 409);
  assert.deepEqual(f.lines.map((line) => line.status), ['held', 'held']);
  assert.deepEqual([...f.capacity.values()], [2, 1]);
  assert.deepEqual(f.events, []);
});
