'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { AncillariesService } = require('../modules/ancillaries/ancillaries.service');

const offer = (id, serviceType, name, flightId, fareClassId, price, capacity = 20, reserved = 0) => ({
  id, ancillary_service_id: id, offer_name: name, flight_id: flightId, fare_class_id: fareClassId,
  unit_price: price, currency: 'VND', capacity, reserved_quantity: reserved, max_quantity_per_passenger: 2,
  refund_policy: 'refundable', is_active: true, service: { id, service_type: serviceType, name: `${name} service`, is_active: true },
});

function makeService(offers) {
  const changes = [];
  const snapshots = [];
  const repository = {
    async findOfferForUpdate(id, transaction) { assert.ok(transaction); return offers.get(id); },
    async adjustReservedQuantity(id, delta, transaction) {
      const item = offers.get(id);
      item.reserved_quantity += delta;
      changes.push([id, delta, transaction]);
    },
    async createBookingAncillaries(rows, transaction) { snapshots.push(...rows); return rows; },
  };
  return { service: new AncillariesService({ repository }), offers, changes, snapshots };
}

test('reserves configured baggage, meal, and priority for concrete passengers and itinerary segments using server prices', async () => {
  const offers = new Map([
    [1, offer(1, 'baggage', '20 kg bag', 10, 101, '1250.00')],
    [2, offer(2, 'meal', 'Vegetarian meal', 11, 202, '250.00')],
    [3, offer(3, 'priority', 'Priority boarding', 10, 101, '100.00')],
  ]);
  const f = makeService(offers);
  const result = await f.service.reserveForBooking({
    booking: { id: 50, total_amount: '5000.00' },
    passengers: [{ id: 700 }, { id: 701 }],
    segments: [{ id: 800, leg_order: 1, flight_id: 10, fare_class_id: 101 }, { id: 801, leg_order: 2, flight_id: 11, fare_class_id: 202 }],
    selections: [
      { offer_id: 1, passenger_index: 0, leg_order: 1, quantity: 1, unit_price: '0.01' },
      { offer_id: 2, passenger_index: 1, leg_order: 2, quantity: 2 },
      { offer_id: 3, passenger_index: 0, leg_order: 1, quantity: 1 },
    ],
    transaction: {},
  });
  assert.deepEqual(result.snapshots.map(({ booking_id, passenger_id, booking_segment_id, line_total_snapshot }) => [booking_id, passenger_id, booking_segment_id, line_total_snapshot]), [
    [50, 700, 800, '1250.00'], [50, 701, 801, '500.00'], [50, 700, 800, '100.00'],
  ]);
  assert.equal(result.subtotal, '1850.00');
  assert.deepEqual([...offers.values()].map((item) => item.reserved_quantity), [1, 2, 1]);
});

test('rejects mismatched flight/fare, invalid quantity, currency, and capacity before recording snapshots', async () => {
  const f = makeService(new Map([[1, offer(1, 'baggage', '20 kg bag', 10, 101, '1200.00', 1)]]));
  const request = { booking: { id: 9 }, passengers: [{ id: 4 }], segments: [{ id: 5, leg_order: 1, flight_id: 10, fare_class_id: 101 }], transaction: {} };
  await assert.rejects(f.service.reserveForBooking({ ...request, selections: [{ offer_id: 1, passenger_index: 0, leg_order: 1, quantity: 2 }] }), /quantity|capacity/i);
  assert.equal(f.snapshots.length, 0);
  await assert.rejects(f.service.reserveForBooking({ ...request, selections: [{ offer_id: 1, passenger_index: 0, leg_order: 2, quantity: 1 }] }), /segment/i);
  assert.equal(f.snapshots.length, 0);
});

test('serializes competing offer reservations so configured capacity cannot be oversold', async () => {
  const shared = offer(1, 'meal', 'Meal', 10, 101, '5.00', 1);
  let mutex = Promise.resolve();
  const repository = {
    async findOfferForUpdate() { return { ...shared, service: { ...shared.service } }; },
    async adjustReservedQuantity(id, delta) {
      const previous = mutex;
      let release;
      mutex = new Promise((resolve) => { release = resolve; });
      await previous;
      try {
        if (shared.reserved_quantity + delta > shared.capacity) return false;
        shared.reserved_quantity += delta;
        return true;
      } finally { release(); }
    },
    async createBookingAncillaries(rows) { return rows; },
  };
  const service = new AncillariesService({ repository });
  const input = (bookingId) => service.reserveForBooking({ booking: { id: bookingId }, passengers: [{ id: bookingId + 100 }],
    segments: [{ id: 200, leg_order: 1, flight_id: 10, fare_class_id: 101 }], selections: [{ offer_id: 1, passenger_index: 0, leg_order: 1, quantity: 1 }], transaction: {} });
  const results = await Promise.allSettled([input(1), input(2)]);
  for (const result of results) if (result.status === 'fulfilled') result.value;
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(shared.reserved_quantity, 1);
});

test('customer offer lookup rejects non-positive flight and fare identifiers', async () => {
  const service = new AncillariesService({ repository: { async listOffers() { throw new Error('must not query invalid identifiers'); } } });
  await assert.rejects(service.listOffers({ flight_id: 0, fare_class_id: 101 }), /flight_id and fare_class_id/i);
  await assert.rejects(service.listOffers({ flight_id: 10, fare_class_id: -1 }), /flight_id and fare_class_id/i);
});
