'use strict';

const fixtures = require('../demo-fixtures');
const { planFixtureRows, createMissingRows } = require('./seederUtils');

const options = { attributes: ['id', 'iata_code', 'name'], key: 'iata_code', entity: 'airline', identityFields: ['name'] };

function plan({ models, transaction, fixtureRows = fixtures.airlines }) {
  return planFixtureRows({ ...options, fixtures: fixtureRows, model: models.Airline, transaction });
}

function seed({ models, transaction, rows }) {
  return createMissingRows({ model: models.Airline, rows, transaction });
}

module.exports = { plan, seed };
