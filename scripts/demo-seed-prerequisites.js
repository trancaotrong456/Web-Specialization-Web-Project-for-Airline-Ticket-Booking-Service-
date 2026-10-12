'use strict';

const DEMO_FIXTURES = require('../seeders/demo-fixtures');

function rowsFrom(model, attributes, transaction) {
  return model.findAll({ attributes, ...(transaction ? { transaction } : {}) });
}

function assertUniqueFixtures(rows, key, entity) {
  const seen = new Set();
  for (const row of rows) {
    const value = String(row[key] || '').trim();
    if (!value || seen.has(value)) throw new Error(`Demo ${entity} fixture has a missing or duplicate ${key}: ${value || '(empty)'}.`);
    seen.add(value);
  }
}

function inspectFixtures(existingRows, fixtureRows, { key, entity, identityFields }) {
  assertUniqueFixtures(fixtureRows, key, entity);
  const byKey = new Map();
  for (const row of existingRows) {
    const value = String(row[key]);
    const matches = byKey.get(value) || [];
    matches.push(row);
    byKey.set(value, matches);
  }

  const missing = [];
  let existing = 0;
  for (const fixture of fixtureRows) {
    const matches = byKey.get(String(fixture[key])) || [];
    if (matches.length > 1) throw new Error(`Existing demo ${entity} identity ${fixture[key]} is duplicated; refusing to seed.`);
    if (!matches.length) {
      missing.push(fixture);
      continue;
    }

    const current = matches[0];
    const mismatchedField = identityFields.find((field) => String(current[field] ?? '') !== String(fixture[field] ?? ''));
    if (mismatchedField) {
      throw new Error(`Existing demo ${entity} ${fixture[key]} conflicts on ${mismatchedField}; refusing to overwrite or duplicate it.`);
    }
    existing += 1;
  }

  return { existing, missing };
}

async function planDemoPrerequisites({ models, transaction, fixtures = DEMO_FIXTURES }) {
  if (!models?.Role || !models?.Airline || !models?.Airport) throw new Error('Role, Airline, and Airport models are required for demo setup.');
  const [roles, airlines, airports] = await Promise.all([
    rowsFrom(models.Role, ['id', 'name'], transaction),
    rowsFrom(models.Airline, ['id', 'iata_code', 'name'], transaction),
    rowsFrom(models.Airport, ['id', 'iata_code', 'name', 'city', 'country'], transaction),
  ]);

  return {
    roles: inspectFixtures(roles, fixtures.roles, { key: 'name', entity: 'role', identityFields: ['name'] }),
    airlines: inspectFixtures(airlines, fixtures.airlines, { key: 'iata_code', entity: 'airline', identityFields: ['name'] }),
    airports: inspectFixtures(airports, fixtures.airports, { key: 'iata_code', entity: 'airport', identityFields: ['name', 'city', 'country'] }),
  };
}

async function ensureDemoPrerequisites({ models, transaction, fixtures = DEMO_FIXTURES }) {
  const plan = await planDemoPrerequisites({ models, transaction, fixtures });
  for (const row of plan.roles.missing) await models.Role.create({ ...row }, { transaction });
  for (const row of plan.airlines.missing) await models.Airline.create({ ...row }, { transaction });
  for (const row of plan.airports.missing) await models.Airport.create({ ...row }, { transaction });

  return {
    existing: {
      roles: plan.roles.existing,
      airlines: plan.airlines.existing,
      airports: plan.airports.existing,
    },
    created: {
      roles: plan.roles.missing.length,
      airlines: plan.airlines.missing.length,
      airports: plan.airports.missing.length,
    },
  };
}

module.exports = { planDemoPrerequisites, ensureDemoPrerequisites };
