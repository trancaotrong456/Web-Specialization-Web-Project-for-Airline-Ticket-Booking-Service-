const test = require('node:test');
const assert = require('node:assert/strict');
const FlightService = require('../modules/flight/flight.service');

function fixture(initial = {}) {
  const flight = {
    id: 41,
    status: 'scheduled',
    departure_time: new Date('2026-11-01T10:00:00.000Z'),
    arrival_time: new Date('2026-11-01T12:00:00.000Z'),
    actual_departure_time: null,
    actual_arrival_time: null,
    delay_reason: null,
    ...initial,
  };
  const events = [];
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  const repository = {
    transaction: async (work) => { events.push('begin'); const before = { ...flight }; try { const value = await work(transaction); events.push('commit'); return value; } catch (error) { Object.assign(flight, before); events.push('rollback'); throw error; } },
    findFlightForStatusUpdate: async (id, tx) => { events.push(['findById', id, { transaction: tx, lock: tx.LOCK.UPDATE }]); return flight; },
    update: async (_flight, values, options) => { events.push(['update', values, options]); Object.assign(flight, values); },
    createStatusHistory: async (values, tx) => { events.push(['history', values, { transaction: tx }]); },
    findDetail: async () => flight,
  };
  return { service: new FlightService({ repository, getIO: () => null }), flight, events, transaction };
}

test('delaying a scheduled flight updates expected time and writes actor/reason history atomically', async () => {
  const { service, flight, events, transaction } = fixture();
  const result = await service.updateFlightStatus(41, {
    status: 'delayed', departure_time: '2026-11-01T11:00:00.000Z', reason: 'Thời tiết', actorUserId: 8,
  });
  assert.equal(result.status, 'delayed');
  assert.equal(new Date(flight.departure_time).toISOString(), '2026-11-01T11:00:00.000Z');
  assert.deepEqual(events.find(([kind]) => kind === 'history')[1], {
    flight_id: 41, from_status: 'scheduled', to_status: 'delayed', actor_user_id: 8, reason: 'Thời tiết',
    old_departure_time: new Date('2026-11-01T10:00:00.000Z'), new_departure_time: new Date('2026-11-01T11:00:00.000Z'),
    old_arrival_time: new Date('2026-11-01T12:00:00.000Z'), new_arrival_time: new Date('2026-11-01T12:00:00.000Z'),
    actual_departure_time: null, actual_arrival_time: null,
  });
  assert.equal(events.find(([kind]) => kind === 'history')[2].transaction, transaction);
  assert.equal(events.at(-1), 'commit');
});

test('an exact retry is idempotent and does not insert duplicate status history', async () => {
  const { service, events } = fixture({ status: 'delayed', status_reason: 'Thời tiết', departure_time: new Date('2026-11-01T11:00:00.000Z') });
  await service.updateFlightStatus(41, { status: 'delayed', departure_time: '2026-11-01T11:00:00.000Z', reason: 'Thời tiết', actorUserId: 8 });
  assert.equal(events.some(([kind]) => kind === 'history'), false);
  assert.equal(events.at(-1), 'commit');
});

test('rejects impossible transitions and missing delay/cancellation reasons without writing history', async () => {
  const cases = [
    [fixture({ status: 'arrived' }), { status: 'delayed', reason: 'Late' }],
    [fixture(), { status: 'delayed' }],
    [fixture(), { status: 'cancelled' }],
  ];
  for (const [{ service, events }, input] of cases) {
    await assert.rejects(service.updateFlightStatus(41, input), (error) => error.statusCode === 400);
    assert.equal(events.some((event) => Array.isArray(event) && event[0] === 'history'), false);
    assert.equal(events.at(-1), 'rollback');
  }
});

test('rolls back the flight update when history persistence fails', async () => {
  const { service, flight, events } = fixture();
  service.repository.createStatusHistory = async () => { throw new Error('history unavailable'); };
  await assert.rejects(service.updateFlightStatus(41, { status: 'cancelled', reason: 'Safety', actorUserId: 8 }), /history unavailable/);
  assert.equal(flight.status, 'scheduled');
  assert.equal(events.at(-1), 'rollback');
});
