'use strict';

const { planDemoPrerequisites } = require('../../scripts/demo-seed-prerequisites');
const { loadSnapshot, makeExecutionPlan } = require('../../scripts/demo-seed-core');
const RoleSeeder = require('./RoleSeeder');
const AirlineSeeder = require('./AirlineSeeder');
const AirportSeeder = require('./AirportSeeder');
const UserSeeder = require('./UserSeeder');
const FlightSeeder = require('./FlightSeeder');
const FareClassSeeder = require('./FareClassSeeder');
const PromotionSeeder = require('./PromotionSeeder');

const ROLE_NAMES = ['admin', 'staff', 'customer'];

async function analyze({ models, transaction, startDate, apply, now }) {
  const prerequisitePlan = await planDemoPrerequisites({ models, transaction });

  if (apply) {
    await RoleSeeder.seed({ models, transaction, rows: prerequisitePlan.roles.missing });
    await AirlineSeeder.seed({ models, transaction, rows: prerequisitePlan.airlines.missing });
    await AirportSeeder.seed({ models, transaction, rows: prerequisitePlan.airports.missing });
  }

  const snapshot = await loadSnapshot(models, transaction);
  const [accountPlan, promotionPlan] = await Promise.all([
    UserSeeder.plan({ models, transaction }),
    PromotionSeeder.plan({ models, transaction, promotions: PromotionSeeder.PROMOTION_SPECS }),
  ]);
  snapshot.existingUsers = accountPlan.existingByEmail;
  snapshot.existingPromotions = promotionPlan.existingByCode;
  if (!apply) {
    const virtualRows = (kind) => prerequisitePlan[kind].missing.map((row, index) => ({
      ...row,
      id: `planned-${kind}-${index + 1}`,
    }));
    snapshot.roles = Object.fromEntries(ROLE_NAMES.map((name) => [
      name,
      snapshot.roles[name] || virtualRows('roles').find((row) => row.name === name) || null,
    ]));
    snapshot.airlines = [...snapshot.airlines, ...virtualRows('airlines')];
    snapshot.airports = [...snapshot.airports, ...virtualRows('airports')];
  }

  const execution = makeExecutionPlan(snapshot, now, startDate);
  const planned = {
    roles: prerequisitePlan.roles.missing.length,
    airlines: prerequisitePlan.airlines.missing.length,
    airports: prerequisitePlan.airports.missing.length,
    users: execution.accountsToCreate.length,
    flights: execution.flightsToCreate.length,
    fareClasses: execution.fareClassesToCreate.length,
    promotions: execution.promotionsToCreate.length,
  };
  const existing = {
    roles: prerequisitePlan.roles.existing,
    airlines: prerequisitePlan.airlines.existing,
    airports: prerequisitePlan.airports.existing,
    users: UserSeeder.demoUsers.length - execution.accountsToCreate.length,
    flights: execution.flightScheduleExists ? execution.plan.flights.length : 0,
    fareClasses: execution.flightScheduleExists ? execution.plan.fareClasses.length : 0,
    promotions: execution.plan.promotions.length - execution.promotionsToCreate.length,
  };

  if (!apply) {
    return {
      mode: 'dry-run',
      scheduleStartDate: execution.plan.startDate,
      flightScheduleExists: execution.flightScheduleExists,
      existing,
      wouldCreate: planned,
    };
  }

  await UserSeeder.seedUsers({ models, transaction, roles: execution.roles, accounts: execution.accountsToCreate });
  if (!execution.flightScheduleExists) {
    const flightIdsBySlot = await FlightSeeder.seed({ models, transaction, flights: execution.flightsToCreate });
    await FareClassSeeder.seed({
      models,
      transaction,
      fareClasses: execution.fareClassesToCreate,
      flightIdsBySlot,
    });
  }
  await PromotionSeeder.seed({ models, transaction, promotions: execution.promotionsToCreate });

  return {
    mode: 'apply',
    scheduleStartDate: execution.plan.startDate,
    flightScheduleExists: execution.flightScheduleExists,
    existing,
    created: planned,
  };
}

async function runDemoSeed({ models, sequelize, startDate, apply = false, now = new Date() }) {
  const run = (transaction) => analyze({ models, transaction, startDate, apply, now });
  if (!apply) return run(null);
  return sequelize.transaction(run);
}

module.exports = { runDemoSeed };
