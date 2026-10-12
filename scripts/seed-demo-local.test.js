'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { assertSafeDockerTarget, assertSeedPasswords, buildDemoPlan, runDemoSeed } = require('./demo-seed-core');
const { assertConnectedDatabase } = require('./seed-demo-local');

const now = new Date('2026-10-09T03:00:00.000Z');
const safeEnv = { NODE_ENV: 'development', DB_HOST: 'db', DB_NAME: 'airline_booking_docker', DB_SSL: 'false' };
const safeRuntime = { isDockerContainer: true, composeProject: 'airline-demo', apiContainerId: 'a'.repeat(64), dbContainerId: 'b'.repeat(64), hostname: 'aaaaaaaaaaaa' };
const passwords = { SEED_ADMIN_PASSWORD: 'Admin-demo-10!', SEED_STAFF_PASSWORD: 'Staff-demo-10!', SEED_CUSTOMER_PASSWORD: 'Customer-demo-10!', SEED_FLIGHT_START_DATE: '2026-10-10' };

function fixtures() {
  const airlines = Array.from({ length: 20 }, (_, index) => ({ id: index + 10, iata_code: `A${String(index).padStart(2, '0')}`, name: `Airline ${index}` }));
  const codes = ['HAN', 'SGN', 'DAD', 'CXR', 'PQC', 'HPH', 'VCA', 'VII', 'HUI', 'THD', 'VDO', 'PXU', 'UIH', 'TBB', 'BMV', 'DLI', 'DIN', 'VCS', 'VKG', 'CAH', 'VCL', 'VDH', 'SIN', 'BKK', 'DMK', 'KUL', 'ICN', 'NRT', 'HND', 'KIX', 'HKG', 'TPE', 'DXB', 'DOH', 'CDG', 'LHR', 'FRA', 'JFK', 'LAX', 'SYD'];
  const airports = codes.map((iata_code, index) => ({ id: index + 100, iata_code, name: `${iata_code} Airport`, city: iata_code, country: 'Việt Nam' }));
  return { airlines, airports };
}

function modelStore(initial = []) {
  const rows = [...initial];
  return {
    rows,
    async count() { return rows.length; },
    async findAll({ where = {}, order } = {}) {
      let found = rows.filter((row) => Object.entries(where).every(([key, value]) => row[key] === value));
      if (order?.length) found = [...found].sort((a, b) => String(a[order[0][0]]).localeCompare(String(b[order[0][0]])));
      return found;
    },
    async findOne({ where = {} } = {}) { return rows.find((row) => Object.entries(where).every(([key, value]) => row[key] === value)) || null; },
    async create(values) { const row = { id: rows.length + 1, ...values }; rows.push(row); return row; },
  };
}

function makeDatabase({ existingUser } = {}) {
  const base = fixtures();
  const roles = modelStore([{ id: 3, name: 'customer' }, { id: 9, name: 'staff' }, { id: 14, name: 'admin' }]);
  const users = modelStore(existingUser ? [existingUser] : []);
  const flights = modelStore();
  const fareClasses = modelStore();
  const promotions = modelStore();
  const bookings = modelStore([{ id: 1, status: 'holding', total_amount: 42 }]);
  const payments = modelStore([{ id: 1, status: 'pending', amount: 42 }]);
  let transactions = 0;
  const sequelize = { async transaction(callback) { transactions += 1; return callback({ transactionId: transactions }); } };
  return {
    sequelize,
    transactions: () => transactions,
    models: {
      Role: modelStore(roles.rows), User: users, Airline: modelStore(base.airlines), Airport: modelStore(base.airports),
      Flight: flights, FareClass: fareClasses, Promotion: promotions, Booking: bookings, Payment: payments,
    },
    users, flights, fareClasses, promotions, bookings, payments,
  };
}

test('safe Docker target requires development, exact local DB, container and same-project container identities', () => {
  assert.equal(assertSafeDockerTarget(safeEnv, safeRuntime), true);
  assert.throws(() => assertSafeDockerTarget({ ...safeEnv, NODE_ENV: 'production' }, safeRuntime), /production/i);
  assert.throws(() => assertSafeDockerTarget({ ...safeEnv, DB_NAME: 'airline_booking_db' }, safeRuntime), /airline_booking_docker/i);
  assert.throws(() => assertSafeDockerTarget({ ...safeEnv, DB_HOST: '127.0.0.1' }, safeRuntime), /DB_HOST=db/i);
  assert.throws(() => assertSafeDockerTarget(safeEnv, { ...safeRuntime, isDockerContainer: false }), /Docker container/i);
  assert.throws(() => assertSafeDockerTarget(safeEnv, { ...safeRuntime, dbContainerId: '' }), /Compose project/i);
  assert.throws(() => assertSafeDockerTarget(safeEnv, { ...safeRuntime, hostname: 'wrong-container' }), /API container/i);
});

test('connected database identity must match the verified local DB container and writable schema', async () => {
  const dbContainerId = 'b'.repeat(64);
  const sequelize = { async query() { return [[{ database_name: 'airline_booking_docker', server_hostname: 'bbbbbbbbbbbb', server_port: 3306, read_only: 0 }]]; } };
  assert.equal(await assertConnectedDatabase(sequelize, dbContainerId), true);
  await assert.rejects(assertConnectedDatabase({ query: async () => [[{ database_name: 'airline_booking_prod', server_hostname: 'bbbbbbbbbbbb', server_port: 3306, read_only: 0 }]] }, dbContainerId), /not airline_booking_docker/i);
  await assert.rejects(assertConnectedDatabase({ query: async () => [[{ database_name: 'airline_booking_docker', server_hostname: 'remote-mysql', server_port: 3306, read_only: 0 }]] }, dbContainerId), /does not match/i);
});

test('apply requires all three demo passwords and never returns their values', () => {
  assert.throws(() => assertSeedPasswords({ ...passwords, SEED_STAFF_PASSWORD: '' }), /staff/i);
});

test('demo plan uses database IDs, required real airport codes, 50 scheduled future flights and two balanced fare classes', () => {
  const { airlines, airports } = fixtures();
  const plan = buildDemoPlan({ airlines, airports, startDate: '2026-10-10', now });
  assert.equal(plan.flights.length, 50);
  assert.equal(plan.flights.some((flight) => flight.departure_airport_id === flight.arrival_airport_id), false);
  assert.equal(plan.flights.every((flight) => airlines.some((airline) => airline.id === flight.airline_id)), true);
  assert.equal(plan.flights.every((flight) => airports.some((airport) => airport.id === flight.departure_airport_id && airport.id !== flight.arrival_airport_id)), true);
  assert.equal(plan.flights.every((flight) => flight.status === 'scheduled' && flight.total_seats === 180 && flight.available_seats === 180 && flight.arrival_time > flight.departure_time), true);
  assert.equal(plan.fareClasses.length, 100);
  for (let index = 0; index < plan.flights.length; index += 1) {
    const classes = plan.fareClasses.filter((fare) => fare.slot === plan.flights[index].slot);
    assert.equal(classes.length, 2);
    assert.equal(classes.reduce((sum, fare) => sum + fare.seat_quota, 0), plan.flights[index].total_seats);
  }
  assert.equal(plan.promotions.length, 10);
  assert.deepEqual(new Set(plan.promotions.map((item) => item.discount_type)), new Set(['percent', 'amount']));
  assert.equal(plan.promotions.every((item) => item.used_count === 0 && item.max_uses > 0), true);
});

test('demo plan refuses to invent missing route airports', () => {
  const { airlines, airports } = fixtures();
  assert.throws(() => buildDemoPlan({ airlines, airports: airports.filter((airport) => airport.iata_code !== 'DAD'), startDate: '2026-10-10', now }), /DAD/i);
});

test('dry-run performs read-only analysis and does not open a transaction or write rows', async () => {
  const db = makeDatabase();
  const result = await runDemoSeed({ models: db.models, sequelize: db.sequelize, config: passwords, apply: false, now });
  assert.equal(result.mode, 'dry-run');
  assert.equal(result.wouldCreate.users, 3);
  assert.equal(result.wouldCreate.flights, 50);
  assert.equal(result.wouldCreate.fareClasses, 100);
  assert.equal(result.wouldCreate.promotions, 10);
  assert.equal(db.transactions(), 0);
  assert.equal(db.users.rows.length, 0);
  assert.equal(db.flights.rows.length, 0);
  assert.equal(db.fareClasses.rows.length, 0);
  assert.equal(db.promotions.rows.length, 0);
});

test('apply hashes passwords and preserves an existing account instead of changing its role or password', async () => {
  const existing = { id: 101, email: 'admin@airline-booking.local', role_id: 3, full_name: 'Existing account', password_hash: 'existing-hash', status: 'locked' };
  const db = makeDatabase({ existingUser: existing });
  const result = await runDemoSeed({ models: db.models, sequelize: db.sequelize, config: passwords, apply: true, now });
  assert.equal(result.created.users, 2);
  assert.deepEqual(existing, { id: 101, email: 'admin@airline-booking.local', role_id: 3, full_name: 'Existing account', password_hash: 'existing-hash', status: 'locked' });
  const createdStaff = db.users.rows.find((user) => user.email === 'staff.demo@airline-booking.local');
  assert.equal(createdStaff.role_id, 9);
  assert.equal(createdStaff.status, 'active');
  assert.equal(await bcrypt.compare(passwords.SEED_STAFF_PASSWORD, createdStaff.password_hash), true);
  assert.equal(JSON.stringify(result).includes(passwords.SEED_STAFF_PASSWORD), false);
});

test('rerunning with the fixed schedule anchor is idempotent and leaves bookings/payments untouched', async () => {
  const db = makeDatabase();
  await runDemoSeed({ models: db.models, sequelize: db.sequelize, config: passwords, apply: true, now });
  const before = { bookings: structuredClone(db.bookings.rows), payments: structuredClone(db.payments.rows) };
  const rerun = await runDemoSeed({ models: db.models, sequelize: db.sequelize, config: passwords, apply: true, now: new Date('2026-10-12T03:00:00.000Z') });
  assert.deepEqual(rerun.created, { users: 0, flights: 0, fareClasses: 0, promotions: 0 });
  assert.equal(db.flights.rows.length, 50);
  assert.equal(db.fareClasses.rows.length, 100);
  assert.deepEqual(db.bookings.rows, before.bookings);
  assert.deepEqual(db.payments.rows, before.payments);
});

test('a changed seed date cannot silently create a second demo flight set', async () => {
  const db = makeDatabase();
  await runDemoSeed({ models: db.models, sequelize: db.sequelize, config: passwords, apply: true, now });
  await assert.rejects(runDemoSeed({ models: db.models, sequelize: db.sequelize, config: { ...passwords, SEED_FLIGHT_START_DATE: '2026-10-11' }, apply: true, now }), /existing demo flight schedule/i);
  assert.equal(db.flights.rows.length, 50);
});

test('new accounts require passwords before opening the transaction', async () => {
  const db = makeDatabase();
  await assert.rejects(runDemoSeed({ models: db.models, sequelize: db.sequelize, config: { ...passwords, SEED_CUSTOMER_PASSWORD: '' }, apply: true, now }), /customer/i);
  assert.equal(db.transactions(), 0);
});

test('the seeder never mutates Booking or Payment and has no destructive model operation', async () => {
  const db = makeDatabase();
  const beforeBookings = structuredClone(db.bookings.rows);
  const beforePayments = structuredClone(db.payments.rows);
  await runDemoSeed({ models: db.models, sequelize: db.sequelize, config: passwords, apply: true, now });
  assert.deepEqual(db.bookings.rows, beforeBookings);
  assert.deepEqual(db.payments.rows, beforePayments);
  assert.equal(typeof db.models.Booking.create, 'function');
  assert.equal(typeof db.models.Payment.create, 'function');
  assert.equal(db.models.Booking.destroy, undefined);
  assert.equal(db.models.Payment.destroy, undefined);
});

test('an existing conflicting flight slot aborts safely without overwriting it', async () => {
  const db = makeDatabase();
  db.flights.rows.push({ id: 88, airline_id: 10, departure_airport_id: 100, arrival_airport_id: 101, departure_time: new Date('2026-10-09T23:00:00.000Z'), arrival_time: new Date('2026-10-10T01:10:00.000Z'), total_seats: 123, available_seats: 70, status: 'scheduled' });
  const original = structuredClone(db.flights.rows[0]);
  await assert.rejects(runDemoSeed({ models: db.models, sequelize: db.sequelize, config: passwords, apply: true, now }), /conflict|existing flight/i);
  assert.deepEqual(db.flights.rows[0], original);
  assert.equal(db.flights.rows.length, 1);
});
