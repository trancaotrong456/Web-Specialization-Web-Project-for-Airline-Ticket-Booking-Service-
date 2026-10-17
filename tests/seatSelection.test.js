'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateLayout, SeatSelectionService } = require('../modules/seat-selection/seatSelection.service');

const layout = { row_count: 1, column_count: 3, aisle_after: [1], seats: [
  { seat_no: '1A', row_number: 1, column_number: 1, zone: 'front', special_properties: ['window'] },
  { seat_no: '1B', row_number: 1, column_number: 3, zone: 'economy', special_properties: [], blocked: true },
] };
function fake() {
  const templates = new Map(); const maps = new Map(); const seats = new Map(); let nextTemplate = 1; let nextMap = 1;
  const flights = new Map([[17, { id: 17 }]]); const fares = new Map([[5, { id: 5, flight_id: 17 }], [6, { id: 6, flight_id: 17 }]]);
  const repository = {
    async listCurrentTemplates() { return [...templates.values()].filter((t) => t.is_current); },
    async findTemplate(id) { return templates.get(Number(id)); },
    async findLatestTemplate(name) { return [...templates.values()].filter((t) => t.name === name).sort((a, b) => b.version - a.version)[0]; },
    async createTemplate(v) { const t = { ...v, id: nextTemplate++ }; templates.set(t.id, t); return t; },
    async updateTemplate(t, v) { Object.assign(t, v); return t; },
    async deleteTemplate(t) { templates.delete(t.id); },
    async findTemplateSnapshots(id) { return [...maps.values()].filter((m) => m.template_id === Number(id)).length; },
    async findFlight(id) { return flights.get(Number(id)); },
    async findFlightFareClasses(_flightId, ids) { return ids.map((id) => fares.get(id)).filter(Boolean); },
    async findFlightMap(id) { return maps.get(Number(id)); },
    async listFlightSeats(id) { return seats.get(Number(id)) || []; },
    async deleteFlightSeats(id) { seats.set(Number(id), []); },
    async createFlightMap(v) { const m = { ...v, id: nextMap++ }; maps.set(Number(v.flight_id), m); return m; },
    async updateFlightMap(m, v) { Object.assign(m, v); return m; },
    async bulkCreateFlightSeats(v, _tx) { seats.set(Number(v[0]?.flight_id || 17), v.map((row) => ({ ...row, status: row.status || 'available' }))); },
    async findFlightSeatForUpdate(flightId, seatNo) { return (seats.get(Number(flightId)) || []).find((seat) => seat.seat_no === seatNo); },
    async reserveFlightSeat(seat, v) { Object.assign(seat, v); return seat; },
    async findBookingSeats(id) { return [...seats.values()].flat().filter((seat) => seat.booking_id === id && ['held', 'booked'].includes(seat.status)); },
  };
  const transactionManager = { async transaction(fn) { return fn({ LOCK: { UPDATE: 'UPDATE' } }); } };
  return { service: new SeatSelectionService({ repository, transactionManager }), repository, templates, maps, seats };
}

test('layout validates positions, seat numbers, aisle positions and zone structure', () => {
  assert.equal(validateLayout(layout).seats.length, 2);
  assert.throws(() => validateLayout({ ...layout, seats: [...layout.seats, layout.seats[0]] }), /unique/);
  assert.throws(() => validateLayout({ ...layout, seats: [{ ...layout.seats[0], column_number: 9 }] }), /seat definition/);
  assert.throws(() => validateLayout({ ...layout, aisle_after: [3] }), /aisle/);
});

test('template edit creates a new version and keeps the assigned flight snapshot independent', async () => {
  const f = fake(); const first = await f.service.createTemplate({ name: 'A320', aircraft_type: 'A320', layout });
  const assigned = await f.service.assignTemplateToFlight(17, first.id, { front: 5 });
  const version2 = await f.service.updateTemplate(first.id, { layout: { ...layout, row_count: 2 } });
  assert.equal(version2.version, 2); assert.equal(first.is_current, false);
  assert.equal(assigned.template_version, 1); assert.equal(assigned.snapshot.row_count, 1);
  assert.equal((await f.service.getFlightMap(17)).row_count, 1);
});

test('assignment maps zones only to fare classes owned by the assigned flight and blocks configured seats', async () => {
  const f = fake(); const template = await f.service.createTemplate({ name: 'A320', aircraft_type: 'A320', layout });
  await assert.rejects(f.service.assignTemplateToFlight(17, template.id, { front: 99 }), /belong to this flight/);
  const map = await f.service.assignTemplateToFlight(17, template.id, { front: 5 });
  assert.equal(map.snapshot.seats[0].fare_class_id, 5); assert.equal(map.snapshot.seats[1].fare_class_id, null);
  const view = await f.service.getFlightMap(17);
  assert.equal(view.seats[0].status, 'available'); assert.equal(view.seats[1].status, 'blocked');
});

test('unconfigured flight reports seat selection unsupported and remains reservable without selections', async () => {
  const f = fake(); assert.deepEqual(await f.service.getFlightMap(17), { supported: false, flight_id: 17, seats: [] });
  assert.deepEqual(await f.service.reserveSeats({ selections: [], transaction: {} }), []);
});

test('seat hold checks flight, passenger, seat state, and FareClass and lifecycle changes are idempotent', async () => {
  const f = fake(); const template = await f.service.createTemplate({ name: 'A320', aircraft_type: 'A320', layout });
  await f.service.assignTemplateToFlight(17, template.id, { front: 5 });
  const tx = {}; const passengers = [{ id: 81 }]; const legs = [{ flight_id: 17, fareClass: { id: 5 } }];
  await assert.rejects(f.service.reserveSeats({ bookingId: 40, passengers, selections: [{ leg_order: 1, passenger_index: 0, seat_no: '1A' }], legs: [{ flight_id: 17, fareClass: { id: 6 } }], transaction: tx }), /not eligible/);
  const held = await f.service.reserveSeats({ bookingId: 40, passengers, selections: [{ leg_order: 1, passenger_index: 0, seat_no: '1A' }], legs, holdExpiresAt: new Date(), transaction: tx });
  assert.equal(held[0].seat_no, '1A'); assert.equal(f.seats.get(17)[0].status, 'held');
  await assert.rejects(f.service.reserveSeats({ bookingId: 41, passengers, selections: [{ leg_order: 1, passenger_index: 0, seat_no: '1A' }], legs, transaction: tx }), /not available/);
  await f.service.confirmBookingSeats(40, tx); await f.service.confirmBookingSeats(40, tx);
  assert.equal(f.seats.get(17)[0].status, 'booked');
  await f.service.releaseBookingSeats(40, tx); await f.service.releaseBookingSeats(40, tx);
  assert.equal(f.seats.get(17)[0].status, 'available'); assert.equal(f.seats.get(17)[0].booking_id, null);
});

test('seat map assignment uses Flight, map and seat locks in the stable lifecycle order', async () => {
  const SequelizeSeatSelectionRepository = require('../modules/seat-selection/seatSelection.repository');
  const calls = [];
  const model = (name) => ({ findByPk: async (_id, options) => { calls.push([name, options]); return {}; },
    findOne: async (options) => { calls.push([name, options]); return {}; },
    findAll: async (options) => { calls.push([name, options]); return []; }, count: async () => 0 });
  const repo = new SequelizeSeatSelectionRepository({ SeatMapTemplate: model('template'), FlightSeatMap: model('map'), FlightSeat: model('seat'), Flight: model('flight'), FareClass: model('fare') });
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  await repo.findFlight(1, transaction); await repo.findFlightMap(1, transaction); await repo.listFlightSeats(1, transaction, true);
  assert.deepEqual(calls.map(([name, options]) => [name, options.lock]), [['flight', 'UPDATE'], ['map', 'UPDATE'], ['seat', 'UPDATE']]);
});
