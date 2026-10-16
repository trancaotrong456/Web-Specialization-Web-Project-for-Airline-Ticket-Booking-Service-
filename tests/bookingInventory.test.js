const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const BookingService = require('../modules/booking/booking.service');
const { SequelizeBookingRepository } = require('../modules/booking/booking.repository');

// Model-boundary simulation: these tests are not evidence of MySQL concurrency.
function inventory({ quota = 3, seats = 10, occupied = 0, failPassengers = false } = {}) {
  const flights = new Map([1, 2].map((id) => [id, {
    id, status: 'scheduled', available_seats: seats,
    departure_airport_id: id, arrival_airport_id: id + 1,
    departure_time: new Date(Date.now() + id * 86400000),
    arrival_time: new Date(Date.now() + id * 86400000 + 3600000),
  }]));
  const fares = new Map([[11, { id: 11, flight_id: 1, price: 100, seat_quota: quota }],
    [12, { id: 12, flight_id: 1, price: 200, seat_quota: quota }],
    [21, { id: 21, flight_id: 2, price: 300, seat_quota: quota }]]);
  const bookings = occupied ? [{ id: 100, status: 'holding', flight_id: 1, fare_class_id: 11,
    passengers: Array.from({ length: occupied }, () => ({})), segments: [] }] : [];
  const queues = new Map();
  const events = [];
  let nextId = 101;
  const repository = {
    async findFlightForUpdate(id, tx) {
      const previous = queues.get(id) || Promise.resolve();
      let release;
      const waiting = new Promise((resolve) => { release = resolve; });
      queues.set(id, previous.then(() => waiting));
      await previous;
      tx.releases.push(release);
      const flight = flights.get(id);
      tx.before.set(id, flight.available_seats);
      events.push(['flight-lock', id, tx]);
      return flight;
    },
    async findFareClassForFlight(id, flightId, tx) {
      assert.ok(tx.before.has(flightId), 'flight must be locked before fare access');
      const fare = fares.get(id);
      return fare?.flight_id === flightId ? fare : null;
    },
    async countReservedFareSeats(fareId, tx) {
      assert.ok(tx.before.has(fares.get(fareId).flight_id));
      return bookings.filter((b) => ['holding', 'pending_payment', 'confirmed'].includes(b.status)
        && (b.fare_class_id === fareId || b.segments.some((s) => s.fare_class_id === fareId)))
        .reduce((sum, b) => sum + b.passengers.length, 0);
    },
    async save() {},
    async findBookingCode() { return null; },
    async createBooking(values, { transaction: tx }) {
      const booking = { ...values, id: nextId++, passengers: [], segments: [] };
      bookings.push(booking); tx.created.push(booking); return booking;
    },
    async createBookingSegments(rows) {
      for (const row of rows) bookings.find((b) => b.id === row.booking_id).segments.push(row);
    },
    async createPassengers(rows) {
      if (failPassengers) throw new Error('passenger insert failed');
      for (const row of rows) bookings.find((b) => b.id === row.booking_id).passengers.push(row);
    },
    async findBookingDetail(id) { return bookings.find((b) => b.id === id); },
  };
  const transactionManager = {
    async transaction(run) {
      const tx = { LOCK: { UPDATE: 'UPDATE' }, releases: [], before: new Map(), created: [] };
      try { return await run(tx); }
      catch (error) {
        for (const [id, available] of tx.before) flights.get(id).available_seats = available;
        for (const booking of tx.created) bookings.splice(bookings.indexOf(booking), 1);
        throw error;
      } finally { for (const release of tx.releases) release(); }
    },
  };
  const service = new BookingService({ repository, transactionManager,
    socket: () => ({ to: () => ({ emit() {} }), emit() {} }),
    flightSeatService: { async checkAndEmitSeatWarning(id) { events.push(['emit', id]); } },
  });
  const request = (count = 1, fare = 11, multi = false) => ({
    flight_id: 1, fare_class_id: fare, user_id: 7, currentUser: { id: 7 },
    passengers: Array.from({ length: count }, (_, i) => ({ passenger_name: `Passenger ${i}` })),
    ...(multi ? { trip_type: 'multi_city', itinerary_legs: [
      { flight_id: 1, fare_class_id: fare }, { flight_id: 2, fare_class_id: 21 },
    ] } : {}),
  });
  return { service, request, flights, fares, bookings, events };
}

for (const count of [1, 2, 3]) {
  test(`fare quota counts already held passengers before accepting ${count} new passengers`, async () => {
    const f = inventory({ occupied: 2 });
    if (count === 1) {
      const booking = await f.service.createHoldingBooking(f.request(count));
      assert.equal(booking.total_amount, 100);
      assert.equal(f.flights.get(1).available_seats, 9);
    } else {
      await assert.rejects(f.service.createHoldingBooking(f.request(count)), (e) => e.statusCode === 400);
      assert.equal(f.flights.get(1).available_seats, 10);
      assert.equal(f.bookings.length, 1);
      assert.equal(f.events.filter(([kind]) => kind === 'emit').length, 0);
    }
  });
}

test('zero fare quota is unavailable; null quota still respects total flight capacity', async () => {
  const zero = inventory({ quota: 0 });
  await assert.rejects(zero.service.createHoldingBooking(zero.request()), /fare|quota/i);
  const unlimited = inventory({ quota: null, seats: 2 });
  await unlimited.service.createHoldingBooking(unlimited.request(2));
  await assert.rejects(unlimited.service.createHoldingBooking(unlimited.request()), /available seats/i);
});

test('insufficient quota on a later leg leaves the entire itinerary unreserved', async () => {
  const f = inventory(); f.fares.get(21).seat_quota = 1;
  await assert.rejects(f.service.createHoldingBooking(f.request(2, 11, true)), /fare|quota/i);
  assert.deepEqual([...f.flights.values()].map((v) => v.available_seats), [10, 10]);
  assert.equal(f.bookings.length, 0);
});

test('failed passenger persistence rolls back flights, segments and booking without notifications', async () => {
  const f = inventory({ failPassengers: true });
  await assert.rejects(f.service.createHoldingBooking(f.request(2, 11, true)), /passenger insert failed/);
  assert.deepEqual([...f.flights.values()].map((v) => v.available_seats), [10, 10]);
  assert.equal(f.bookings.length, 0);
  assert.equal(f.events.filter(([kind]) => kind === 'emit').length, 0);
});

test('competing transactions cannot both consume the final fare quota (simulated row locks)', async () => {
  const f = inventory();
  const results = await Promise.allSettled([
    f.service.createHoldingBooking(f.request(2)), f.service.createHoldingBooking(f.request(2)),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(f.flights.get(1).available_seats, 8);
  assert.equal(f.bookings.length, 1);
});

test('different fares compete for the same physical flight capacity', async () => {
  const f = inventory({ seats: 3 });
  const results = await Promise.allSettled([
    f.service.createHoldingBooking(f.request(2, 11)), f.service.createHoldingBooking(f.request(2, 12)),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(f.flights.get(1).available_seats, 1);
});

test('additional itinerary legs consume fare quota for subsequent bookings', async () => {
  const f = inventory();
  await f.service.createHoldingBooking(f.request(2, 11, true));
  await assert.rejects(f.service.createHoldingBooking(f.request(2, 12, true)), /fare|quota/i);
  assert.deepEqual([...f.flights.values()].map((v) => v.available_seats), [8, 8]);
});

test('empty passengers are rejected before reserving inventory', async () => {
  const f = inventory();
  await assert.rejects(f.service.createHoldingBooking(f.request(0)), (e) => e.statusCode === 400);
  assert.equal(f.bookings.length, 0);
});

test('repository locks fare rows and counts distinct passengers across primary and additional fares', async () => {
  let fareOptions, countOptions;
  const models = Object.fromEntries(['Booking', 'BookingPassenger', 'BookingSegment', 'Flight', 'FareClass',
    'Promotion', 'User', 'Payment', 'Airline', 'Airport'].map((name) => [name, {}]));
  models.FareClass.findOne = async (options) => { fareOptions = options; };
  models.BookingPassenger.count = async (options) => { countOptions = options; return 4; };
  const repo = new SequelizeBookingRepository(models);
  const tx = { LOCK: { UPDATE: 'UPDATE' } };
  await repo.findFareClassForFlight(11, 1, tx);
  assert.equal(fareOptions.lock, 'UPDATE');
  assert.equal(await repo.countReservedFareSeats(11, tx), 4);
  assert.equal(countOptions.transaction, tx);
  assert.equal(countOptions.distinct, true);
  assert.equal(countOptions.col, 'id');
  const booking = countOptions.include[0];
  assert.equal(booking.as, 'booking');
  assert.equal(booking.required, true);
  assert.deepEqual(booking.where.status[Op.in], ['holding', 'pending_payment', 'confirmed']);
  assert.deepEqual(countOptions.where[Op.or], [{ '$booking.fare_class_id$': 11 }, { '$booking.itinerarySegments.fare_class_id$': 11 }]);
  assert.equal(booking.include[0].required, false);
  assert.equal(booking.include[0].as, 'itinerarySegments');
  assert.equal(countOptions.lock, undefined, 'aggregate must not invert Booking -> Flight lifecycle lock order');
});

test('fare inventory query generates valid joined MySQL SQL without connecting to a database', async () => {
  const { Sequelize, DataTypes } = require('sequelize');
  const sequelize = new Sequelize('query_only', 'unused', 'unused', { dialect: 'mysql', logging: false });
  const Booking = require('../models/booking')(sequelize, DataTypes);
  const BookingPassenger = require('../models/booking_passenger')(sequelize, DataTypes);
  const BookingSegment = require('../models/booking_segment')(sequelize, DataTypes);
  BookingPassenger.belongsTo(Booking, { foreignKey: 'booking_id', as: 'booking' });
  Booking.hasMany(BookingSegment, { foreignKey: 'booking_id', as: 'itinerarySegments' });
  let generated;
  sequelize.query = async (sql) => { generated = sql; return { count: 3 }; };
  const repo = new SequelizeBookingRepository({ Booking, BookingPassenger, BookingSegment,
    Flight: {}, FareClass: {}, Promotion: {}, User: {}, Payment: {}, Airline: {}, Airport: {} });
  assert.equal(await repo.countReservedFareSeats(11, {}), 3);
  assert.match(generated, /count\(DISTINCT\(`BookingPassenger`\.`id`\)\)/i);
  assert.match(generated, /LEFT OUTER JOIN `booking_segments` AS `booking->itinerarySegments`/);
  assert.match(generated, /WHERE \(`booking`\.`fare_class_id` = 11 OR `booking->itinerarySegments`\.`fare_class_id` = 11\)/);
  assert.match(generated, /'holding', 'pending_payment', 'confirmed'/);
  assert.doesNotMatch(generated, /FOR UPDATE/);
});

for (const count of [1, 2, 3]) {
  test(`round-trip reserves fare quota for ${count} passengers on both legs`, async () => {
    const f = inventory();
    f.flights.get(2).arrival_airport_id = 1;
    const request = { ...f.request(count, 11, true), trip_type: 'round_trip' };
    const booking = await f.service.createHoldingBooking(request);
    assert.equal(booking.total_amount, count * 400);
    assert.deepEqual([...f.flights.values()].map((flight) => flight.available_seats), [10 - count, 10 - count]);
    await assert.rejects(f.service.createHoldingBooking({ ...request, passengers: f.request(4 - count).passengers }), /fare|quota/i);
  });
}
