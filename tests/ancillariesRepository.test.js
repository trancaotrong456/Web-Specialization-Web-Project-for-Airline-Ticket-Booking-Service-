'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { SequelizeAncillariesRepository } = require('../modules/ancillaries/ancillaries.repository');

test('offer capacity locking reads the service and exact offer inside the booking transaction', async () => {
  let received;
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  const repository = new SequelizeAncillariesRepository({
    AncillaryOffer: { findByPk: async (_id, options) => { received = options; return {}; } },
    AncillaryService: {}, Flight: {}, FareClass: {}, BookingAncillary: {}, BookingSegment: {}, BookingPassenger: {}, Booking: {}, Payment: {},
    sequelize: { literal: (value) => ({ val: value }) },
  });
  await repository.findOfferForUpdate(12, transaction);
  assert.equal(received.lock, 'UPDATE');
  assert.equal(received.transaction, transaction);
  assert.equal(received.include[0].as, 'service');
});

test('capacity reservation uses a conditional atomic SQL increment, not a stale read-modify-write', async () => {
  let received;
  const repository = new SequelizeAncillariesRepository({
    AncillaryOffer: { update: async (values, options) => { received = { values, options }; return [1]; } },
    AncillaryService: {}, Flight: {}, FareClass: {}, BookingAncillary: {}, BookingSegment: {}, BookingPassenger: {}, Booking: {}, Payment: {},
    sequelize: { literal: (value) => ({ val: value }) },
  });
  const transaction = {};
  assert.equal(await repository.adjustReservedQuantity(12, 3, transaction), true);
  assert.equal(received.options.transaction, transaction);
  assert.match(received.values.reserved_quantity.val, /reserved_quantity\s*\+\s*3/);
  assert.ok(received.options.where.reserved_quantity);
});
