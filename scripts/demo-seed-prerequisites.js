'use strict';

const DEMO_FIXTURES = require('../seeders/demo-fixtures');
const RoleSeeder = require('../seeders/demo/RoleSeeder');
const AirlineSeeder = require('../seeders/demo/AirlineSeeder');
const AirportSeeder = require('../seeders/demo/AirportSeeder');

async function planDemoPrerequisites({ models, transaction, fixtures = DEMO_FIXTURES }) {
  if (!models?.Role || !models?.Airline || !models?.Airport) throw new Error('Role, Airline, and Airport models are required for demo setup.');
  const [roles, airlines, airports] = await Promise.all([
    RoleSeeder.plan({ models, transaction, fixtureRows: fixtures.roles }),
    AirlineSeeder.plan({ models, transaction, fixtureRows: fixtures.airlines }),
    AirportSeeder.plan({ models, transaction, fixtureRows: fixtures.airports }),
  ]);

  return { roles, airlines, airports };
}

async function ensureDemoPrerequisites({ models, transaction, fixtures = DEMO_FIXTURES }) {
  const plan = await planDemoPrerequisites({ models, transaction, fixtures });
  await RoleSeeder.seed({ models, transaction, rows: plan.roles.missing });
  await AirlineSeeder.seed({ models, transaction, rows: plan.airlines.missing });
  await AirportSeeder.seed({ models, transaction, rows: plan.airports.missing });

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
