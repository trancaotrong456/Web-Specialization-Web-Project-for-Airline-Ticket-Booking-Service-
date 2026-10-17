'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const FlightService = require('../modules/flight/flight.service');
const { SequelizeFlightRepository } = require('../modules/flight/flight.repository');
const { Op } = require('sequelize');

test('Flight Status publishes delayed/cancelled events through the same transaction for active booking users', async () => {
  const flight = {
    id: 41,
    status: 'scheduled',
    departure_time: new Date('2026-11-01T10:00:00.000Z'),
    arrival_time: new Date('2026-11-01T12:00:00.000Z'),
    actual_departure_time: null,
    actual_arrival_time: null,
    status_reason: null,
  };
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  const events = [];
  const recipients = [{ userId: 7, flightCode: '41' }];
  const repository = {
    transaction: async (work) => work(transaction),
    findFlightForStatusUpdate: async (_id, tx) => { assert.equal(tx, transaction); return flight; },
    update: async (_model, values, options) => { assert.equal(options.transaction, transaction); Object.assign(flight, values); },
    createStatusHistory: async (_values, tx) => { assert.equal(tx, transaction); events.push('history'); return { id: 9001 }; },
    findStatusNotificationRecipients: async (flightId, tx) => {
      assert.equal(flightId, flight.id);
      assert.equal(tx, transaction);
      events.push('recipients');
      return recipients;
    },
    findDetail: async () => flight,
  };
  const flightStatusNotifier = {
    handleFlightStatusChanged: async (event) => {
      assert.equal(event.transaction, transaction);
      events.push(event);
    },
  };
  const service = new FlightService({ repository, getIO: () => null, flightStatusNotifier });

  await service.updateFlightStatus(41, {
    status: 'delayed',
    departure_time: '2026-11-01T11:00:00.000Z',
    reason: 'Thời tiết',
    actorUserId: 13,
  });

  assert.equal(events[0], 'history');
  assert.equal(events[1], 'recipients');
  assert.deepEqual(events[2], {
    eventId: 9001,
    flightId: 41,
    changeType: 'delayed',
    recipients,
    transaction,
  });
});

test('exact Flight Status retry creates neither history nor duplicate notification', async () => {
  const flight = {
    id: 41,
    status: 'delayed',
    departure_time: new Date('2026-11-01T11:00:00.000Z'),
    arrival_time: new Date('2026-11-01T12:00:00.000Z'),
    actual_departure_time: null,
    actual_arrival_time: null,
    status_reason: 'Thời tiết',
  };
  let sideEffects = 0;
  const repository = {
    transaction: async (work) => work({ LOCK: { UPDATE: 'UPDATE' } }),
    findFlightForStatusUpdate: async () => flight,
    createStatusHistory: async () => { sideEffects += 1; return { id: 1 }; },
    findStatusNotificationRecipients: async () => { sideEffects += 1; return []; },
    findDetail: async () => flight,
  };
  const flightStatusNotifier = { handleFlightStatusChanged: async () => { sideEffects += 1; } };
  const service = new FlightService({ repository, getIO: () => null, flightStatusNotifier });

  await service.updateFlightStatus(41, {
    status: 'delayed', departure_time: '2026-11-01T11:00:00.000Z', reason: 'Thời tiết', actorUserId: 13,
  });

  assert.equal(sideEffects, 0);
});

test('recipient lookup includes registered and guest bookings once across primary and itinerary legs', async () => {
  const registered = { id: 1, user_id: 7, guest_email: null };
  const guest = { id: 2, user_id: null, guest_email: 'guest@example.test' };
  const repository = new SequelizeFlightRepository({
    sequelize: {}, Flight: {}, Airline: {}, Airport: {}, FareClass: {}, Op,
    Booking: { findAll: async () => [registered, guest] },
    BookingSegment: { findAll: async () => [{ booking: guest }] },
  });
  const recipients = await repository.findStatusNotificationRecipients(41, {});
  assert.deepEqual(recipients, [
    { bookingId: 1, userId: 7, email: null, flightCode: '41' },
    { bookingId: 2, userId: null, email: 'guest@example.test', flightCode: '41' },
  ]);
});
