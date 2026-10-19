'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fixtures = require('../seeders/demo-fixtures');
const { ensureDemoPrerequisites } = require('./demo-seed-prerequisites');

function modelStore(initial = []) {
  const rows = [...initial];
  const createInputs = [];
  return {
    rows,
    createInputs,
    async findAll() { return rows; },
    async create(values) {
      createInputs.push(structuredClone(values));
      const row = { id: rows.length + 1, ...values };
      rows.push(row);
      return row;
    },
  };
}

function makeModels(existing = {}) {
  return {
    Role: modelStore(existing.roles),
    Airline: modelStore(existing.airlines),
    Airport: modelStore(existing.airports),
  };
}

test('creates the committed role airline and airport fixtures when absent', async () => {
  const models = makeModels();

  const result = await ensureDemoPrerequisites({ models });

  assert.deepEqual(result.created, { roles: 3, airlines: 20, airports: 40 });
  assert.equal(models.Role.rows.some((row) => row.name === 'admin'), true);
  assert.equal(models.Airline.rows.some((row) => row.iata_code === 'VN'), true);
  assert.equal(models.Airport.rows.some((row) => row.iata_code === 'SGN'), true);
  assert.equal(models.Airport.rows.some((row) => row.iata_code === 'PQC'), true);
  assert.equal(models.Role.createInputs.every((row) => !Object.hasOwn(row, 'id')), true);
  assert.equal(models.Airline.createInputs.every((row) => !Object.hasOwn(row, 'id')), true);
  assert.equal(models.Airport.createInputs.every((row) => !Object.hasOwn(row, 'id')), true);
});

test('rerun creates no duplicate fixture rows', async () => {
  const models = makeModels();

  await ensureDemoPrerequisites({ models });
  const rerun = await ensureDemoPrerequisites({ models });

  assert.deepEqual(rerun.created, { roles: 0, airlines: 0, airports: 0 });
  assert.equal(new Set(models.Airline.rows.map((row) => row.iata_code)).size, 20);
  assert.equal(new Set(models.Airport.rows.map((row) => row.iata_code)).size, 40);
});

test('preserves existing fixture rows without updating them', async () => {
  const role = { id: 91, name: 'admin', description: 'Custom administrator', custom: true };
  const airline = { id: 92, ...fixtures.airlines[0], logo_url: 'existing-logo', custom: true };
  const airport = { id: 93, ...fixtures.airports[0], custom: true };
  const original = structuredClone({ role, airline, airport });
  const models = makeModels({ roles: [role], airlines: [airline], airports: [airport] });

  const result = await ensureDemoPrerequisites({ models });

  assert.deepEqual({ role, airline, airport }, original);
  assert.deepEqual(result.existing, { roles: 1, airlines: 1, airports: 1 });
  assert.equal(models.Role.createInputs.length, 2);
  assert.equal(models.Airline.createInputs.length, 19);
  assert.equal(models.Airport.createInputs.length, 39);
});

test('rejects a conflicting IATA identity before mutating any prerequisite row', async () => {
  const conflict = { id: 94, ...fixtures.airports[0], name: 'Different airport name' };
  const original = structuredClone(conflict);
  const models = makeModels({ airports: [conflict] });

  await assert.rejects(ensureDemoPrerequisites({ models }), /airport.*SGN.*conflict/i);

  assert.deepEqual(conflict, original);
  assert.equal(models.Role.createInputs.length, 0);
  assert.equal(models.Airline.createInputs.length, 0);
});
