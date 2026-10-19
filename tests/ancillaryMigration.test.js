'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const schemaMigration = require('../migrations/20261017130000-create-ancillary-catalog-and-booking-snapshots');
const segmentMigration = require('../migrations/20261017140000-backfill-primary-booking-segments');

test('ancillary schema binds every snapshot to real booking, passenger, and segment rows', async () => {
  const tables = new Map();
  const constraints = [];
  const indexes = [];
  const queryInterface = {
    async createTable(name, columns) { tables.set(name, columns); },
    async addConstraint(table, constraint) { constraints.push({ table, ...constraint }); },
    async addIndex(table, fields, options) { indexes.push({ table, fields, ...options }); },
  };
  const types = { BIGINT: { UNSIGNED: 'BIGINT UNSIGNED' }, STRING: (size) => `STRING(${size})`, INTEGER: { UNSIGNED: 'INTEGER UNSIGNED' },
    ENUM: (...values) => ({ values }), TEXT: 'TEXT', DECIMAL: (...args) => ({ args }), BOOLEAN: 'BOOLEAN', JSON: 'JSON', DATE: 'DATE',
    literal: (value) => value };
  types.BIGINT.UNSIGNED = 'BIGINT UNSIGNED';
  types.INTEGER.UNSIGNED = 'INTEGER UNSIGNED';
  types.STRING = (size) => `STRING(${size})`;
  types.ENUM = (...values) => ({ values });
  await schemaMigration.up(queryInterface, types);
  const snapshot = tables.get('booking_ancillaries');
  assert.equal(snapshot.booking_segment_id.allowNull, false);
  assert.equal(snapshot.booking_segment_id.references.model, 'booking_segments');
  assert.equal(snapshot.passenger_id.references.model, 'booking_passengers');
  assert.ok(constraints.some((entry) => entry.table === 'booking_ancillaries' && entry.type === 'unique'));
  assert.ok(indexes.some((entry) => entry.table === 'ancillary_offers' && entry.fields.join(',') === 'flight_id,fare_class_id,is_active'));
});

test('primary segment backfill inserts only missing first legs using persisted fare prices', async () => {
  let sql = '';
  await segmentMigration.up({ sequelize: { async query(statement) { sql = statement; } } });
  assert.match(sql, /INSERT INTO booking_segments/);
  assert.match(sql, /b\.flight_id, b\.fare_class_id, fc\.price/);
  assert.match(sql, /LEFT JOIN booking_segments bs ON bs\.booking_id = b\.id AND bs\.leg_order = 1/);
  assert.match(sql, /WHERE bs\.id IS NULL/);
});
