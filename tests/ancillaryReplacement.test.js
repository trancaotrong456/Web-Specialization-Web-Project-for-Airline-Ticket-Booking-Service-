'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { AncillariesService } = require('../modules/ancillaries/ancillaries.service');

test('replacement rejects any prior payment intent before releasing snapshots or capacity', async () => {
  const calls = [];
  const booking = { id: 9, status: 'holding', total_amount: '100.00', user_id: 5, passengers: [], itinerarySegments: [], save: async () => calls.push('save') };
  const repository = { findBookingForAncillaryUpdate: async () => booking, hasAnyPaymentIntent: async () => true, findBookingAncillariesForUpdate: async () => [{ status: 'held', line_total_snapshot: '20.00', offer_id: 1, quantity: 1 }], adjustReservedQuantity: async () => calls.push('capacity'), deleteBookingAncillaries: async () => calls.push('delete') };
  const service = new AncillariesService({ repository, transactionManager: { transaction: async (callback) => callback({}) } });
  await assert.rejects(service.replaceForBooking({ bookingId: 9, selections: [], currentUser: { id: 5 } }), /payment intent/);
  assert.deepEqual(calls, []);
});

test('whole-booking refund rejects non-refundable snapshots before lifecycle mutations', async () => {
  const lines = [{ status: 'confirmed', refund_policy_snapshot: 'refundable' }, { status: 'confirmed', refund_policy_snapshot: 'non_refundable' }];
  const service = new AncillariesService({ repository: { findBookingAncillariesForUpdate: async () => lines } });
  await assert.rejects(service.assertWholeBookingRefundAllowed(3, {}), (error) => error.statusCode === 409);
});

test('replacement locks old and new offer rows in a stable order before releasing old capacity', async () => {
  const events = [];
  const booking = { id: 9, status: 'holding', total_amount: '120.00', user_id: 5, passengers: [{ id: 51 }], itinerarySegments: [{ id: 61, leg_order: 1, flight_id: 11, fare_class_id: 21 }], save: async () => events.push('save') };
  const repository = {
    findBookingForAncillaryUpdate: async () => booking,
    hasAnyPaymentIntent: async () => false,
    findBookingAncillariesForUpdate: async () => [{ status: 'held', line_total_snapshot: '20.00', offer_id: 8, quantity: 1 }],
    findOfferForUpdateByIds: async (ids) => events.push(['lock', ids]),
    adjustReservedQuantity: async (id, delta) => events.push(['capacity', id, delta]),
    deleteBookingAncillaries: async () => events.push('delete'),
    findOfferForUpdate: async () => ({ id: 3, is_active: true, currency: 'VND', unit_price: '10.00', capacity: 5, reserved_quantity: 0, max_quantity_per_passenger: 2, refund_policy: 'refundable', flight_id: 11, fare_class_id: 21, service: { is_active: true, service_type: 'meal', name: 'Meal' } }),
    createBookingAncillaries: async (rows) => rows,
    save: async () => events.push('save'),
  };
  const service = new AncillariesService({ repository, transactionManager: { transaction: async (callback) => callback({}) } });
  await service.replaceForBooking({ bookingId: 9, selections: [{ offer_id: 3, passenger_index: 0, leg_order: 1, quantity: 1 }], currentUser: { id: 5 } });
  assert.deepEqual(events[0], ['lock', [3, 8]]);
  assert.deepEqual(events[1], ['capacity', 8, -1]);
});

test('failed replacement rolls back old capacity, snapshots, and booking total together', async () => {
  const state = { capacity: new Map([[8, 1], [3, 0]]), snapshots: [{ id: 80, status: 'held', offer_id: 8, quantity: 1, line_total_snapshot: '20.00' }] };
  const booking = { id: 9, status: 'holding', total_amount: '120.00', user_id: 5, passengers: [{ id: 51 }], itinerarySegments: [{ id: 61, leg_order: 1, flight_id: 11, fare_class_id: 21 }], async save() {} };
  const repository = {
    findBookingForAncillaryUpdate: async () => booking,
    hasAnyPaymentIntent: async () => false,
    findBookingAncillariesForUpdate: async () => state.snapshots,
    findOfferForUpdateByIds: async () => [],
    adjustReservedQuantity: async (id, delta) => { state.capacity.set(id, state.capacity.get(id) + delta); return true; },
    deleteBookingAncillaries: async () => { state.snapshots = []; },
    findOfferForUpdate: async () => ({ id: 3, is_active: false, currency: 'VND', unit_price: '10.00', capacity: 5, reserved_quantity: 0, refund_policy: 'refundable', flight_id: 11, fare_class_id: 21, service: { is_active: true, service_type: 'meal', name: 'Meal' } }),
  };
  const transactionManager = { async transaction(callback) {
    const before = { capacity: new Map(state.capacity), snapshots: [...state.snapshots], amount: booking.total_amount };
    try { return await callback({}); }
    catch (error) { state.capacity = before.capacity; state.snapshots = before.snapshots; booking.total_amount = before.amount; throw error; }
  } };
  const service = new AncillariesService({ repository, transactionManager });
  await assert.rejects(service.replaceForBooking({ bookingId: 9, selections: [{ offer_id: 3, passenger_index: 0, leg_order: 1, quantity: 1 }], currentUser: { id: 5 } }), /no longer available/i);
  assert.deepEqual([...state.capacity], [[8, 1], [3, 0]]);
  assert.equal(state.snapshots[0].id, 80);
  assert.equal(booking.total_amount, '120.00');
});
