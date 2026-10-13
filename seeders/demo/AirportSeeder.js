'use strict';

const fixtures = require('../demo-fixtures');
const { planFixtureRows, createMissingRows } = require('./seederUtils');

const options = {
  attributes: ['id', 'iata_code', 'name', 'city', 'country'],
  fixtures: fixtures.airports,
  key: 'iata_code',
  entity: 'airport',
  identityFields: ['name', 'city', 'country'],
};

function plan({ models, transaction, fixtureRows = fixtures.airports }) {
  return planFixtureRows({ ...options, fixtures: fixtureRows, model: models.Airport, transaction });
}

function seed({ models, transaction, rows }) {
  return createMissingRows({ model: models.Airport, rows, transaction });
}

module.exports = { plan, seed };
