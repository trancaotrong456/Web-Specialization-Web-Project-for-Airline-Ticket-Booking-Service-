'use strict';

const fixtures = require('../demo-fixtures');
const { planFixtureRows, createMissingRows } = require('./seederUtils');

const options = { attributes: ['id', 'name'], key: 'name', entity: 'role', identityFields: ['name'] };

function plan({ models, transaction, fixtureRows = fixtures.roles }) {
  return planFixtureRows({ ...options, fixtures: fixtureRows, model: models.Role, transaction });
}

function seed({ models, transaction, rows }) {
  return createMissingRows({ model: models.Role, rows, transaction });
}

module.exports = { plan, seed };
