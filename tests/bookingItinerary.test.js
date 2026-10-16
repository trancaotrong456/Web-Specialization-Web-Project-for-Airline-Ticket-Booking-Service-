const test = require('node:test');
const assert = require('node:assert/strict');
const { getBookingFlightIds, releaseBookingFlightSeats } = require('../utils/bookingItinerary.util');
const { SequelizeBookingRepository } = require('../modules/booking/booking.repository');

test('booking flight ids include every additional itinerary segment once', async () => {
  const transaction = { id: 'tx' };
  const calls = [];
  const ids = await getBookingFlightIds({ id: 7, flight_id: 10 }, {
    findBookingSegments: async (bookingId, passedTransaction) => {
      calls.push([bookingId, passedTransaction]);
      return [{ flight_id: 11 }, { flight_id: 10 }, { flight_id: 12 }];
    },
  }, transaction);
  assert.deepEqual(ids, [10, 11, 12]);
  assert.deepEqual(calls, [[7, transaction]]);
});

test('legacy one-way booking safely falls back to its original flight_id', async () => {
  assert.deepEqual(await getBookingFlightIds({ flight_id: 5 }, {}), [5]);
});

test('seat release restores every itinerary leg in stable lock order', async () => {
  const events = [];
  const flights = new Map([[4, { id: 4, available_seats: 1 }], [8, { id: 8, available_seats: 0 }]]);
  const repository = {
    findBookingSegments: async () => [{ flight_id: 8 }],
    save: async (flight, options) => events.push(['save', flight.id, flight.available_seats, options.transaction]),
  };
  const transaction = { id: 'release-tx' };
  const updates = await releaseBookingFlightSeats({ id: 2, flight_id: 4, passengers: [{}, {}, {}] }, {
    repository,
    transaction,
    findFlight: async (id, tx) => { events.push(['lock', id, tx]); return flights.get(id); },
  });
  assert.deepEqual(events, [
    ['lock', 4, transaction], ['save', 4, 4, transaction],
    ['lock', 8, transaction], ['save', 8, 3, transaction],
  ]);
  assert.deepEqual(updates, [{ flight_id: 4, available_seats: 4 }, { flight_id: 8, available_seats: 3 }]);
});

test('locked expiry lookup includes passenger and itinerary associations', async () => {
  let options;
  const models = Object.fromEntries(['Booking', 'BookingPassenger', 'BookingSegment', 'Flight', 'FareClass', 'Promotion', 'User', 'Payment', 'Airline', 'Airport']
    .map((name) => [name, name === 'Booking' ? { findOne: async (received) => { options = received; return {}; } } : {}]));
  const repository = new SequelizeBookingRepository(models);
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };

  await repository.findHoldingBookingForExpiry(9, transaction);

  assert.equal(options.where.status, 'holding');
  assert.equal(options.lock, 'UPDATE');
  assert.equal(options.transaction, transaction);
  assert.ok(options.include.some((entry) => entry.as === 'passengers'));
  assert.ok(options.include.some((entry) => entry.as === 'itinerarySegments'));
});

test('seat release requires passenger data and never guesses one seat', async () => {
  let lookedUpFlights = 0;
  await assert.rejects(releaseBookingFlightSeats({ id: 5, flight_id: 8 }, {
    repository: { findBookingSegments: async () => [], save: async () => {} },
    transaction: {},
    findFlight: async () => { lookedUpFlights++; return { id: 8, available_seats: 0 }; },
  }), /passenger data/i);
  assert.equal(lookedUpFlights, 0);
});

for (const passengerCount of [1, 2, 3]) {
  test(`seat release restores ${passengerCount} seats per one-way flight`, async () => {
    const flight = { id: 8, available_seats: 4 };
    await releaseBookingFlightSeats({ id: 5, flight_id: 8, passengers: Array.from({ length: passengerCount }, () => ({})) }, {
      repository: { findBookingSegments: async () => [], save: async () => {} },
      transaction: {},
      findFlight: async () => flight,
    });
    assert.equal(flight.available_seats, 4 + passengerCount);
  });
}

test('seat release restores every passenger on each multi-leg flight', async () => {
  const flights = new Map([[8, { id: 8, available_seats: 4 }], [9, { id: 9, available_seats: 1 }]]);
  await releaseBookingFlightSeats({ id: 5, flight_id: 8, passengers: [{}, {}, {}] }, {
    repository: { findBookingSegments: async () => [{ flight_id: 9 }], save: async () => {} },
    transaction: {},
    findFlight: async (id) => flights.get(id),
  });
  assert.equal(flights.get(8).available_seats, 7);
  assert.equal(flights.get(9).available_seats, 4);
});
