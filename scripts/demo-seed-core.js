'use strict';

const DEMO_ACCOUNTS = require('../seeders/demo/UserSeeder').demoUsers;
const { buildPromotions } = require('../seeders/demo/PromotionSeeder');
const { planFlights, TOTAL_SEATS } = require('../seeders/demo/FlightSeeder');
const { planForFlights } = require('../seeders/demo/FareClassSeeder');

const TZ_OFFSET_MS = 7 * 60 * 60 * 1000;

const valueOf = (row, key) => (typeof row?.get === 'function' ? row.get(key) : row?.[key]);
const codeDate = (value) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value) return value;
  }
  throw new Error('Demo flight start date must be a valid calendar date in YYYY-MM-DD format.');
};
const vietnamDate = (date) => new Date(new Date(date).getTime() + TZ_OFFSET_MS).toISOString().slice(0, 10);
const daysFromTodayVietnam = (date, now) => {
  const today = vietnamDate(now);
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
};
const plusDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const defaultDemoStartDate = (now = new Date()) => plusDays(vietnamDate(now), 1);
const sameInstant = (left, right) => new Date(left).getTime() === new Date(right).getTime();
const flightKey = (flight) => [
  valueOf(flight, 'airline_id'), valueOf(flight, 'departure_airport_id'), valueOf(flight, 'arrival_airport_id'),
  new Date(valueOf(flight, 'departure_time')).toISOString(), Number(valueOf(flight, 'total_seats')),
].join('|');
const flightRouteTimeKey = (flight) => [
  valueOf(flight, 'airline_id'), valueOf(flight, 'departure_airport_id'), valueOf(flight, 'arrival_airport_id'),
  new Date(valueOf(flight, 'departure_time')).toISOString(),
].join('|');

function assertSafeDockerTarget(env, runtime) {
  if (env.NODE_ENV !== 'development') throw new Error('Demo seeding is blocked outside development; production is always refused.');
  if (env.DB_HOST !== 'db') throw new Error('Demo seeding requires DB_HOST=db (the local Compose database service).');
  if (env.DB_NAME !== 'airline_booking_docker') throw new Error('Demo seeding requires DB_NAME=airline_booking_docker.');
  if (String(env.DB_SSL).toLowerCase() !== 'false') throw new Error('Demo seeding requires DB_SSL=false.');
  if (!runtime?.isDockerContainer) throw new Error('Demo seeding must run inside the verified Docker container for the local Compose API/bootstrap service.');
  if (!runtime.composeProject || !/^[a-f0-9]{12,64}$/i.test(runtime.apiContainerId || '') || !/^[a-f0-9]{12,64}$/i.test(runtime.dbContainerId || '')) {
    throw new Error('Demo seeding requires verified Compose bootstrap/API and DB container identities from one local Compose project.');
  }
  if (!String(runtime.hostname || '').startsWith(runtime.apiContainerId.slice(0, 12))) {
    throw new Error('The running container does not match the verified Compose API container or bootstrap container.');
  }
  return true;
}

function buildDemoPlan({ airlines, airports, startDate, now = new Date() }) {
  const start = codeDate(startDate);
  const flights = planFlights({ airlines, airports: airports || [], startDate: start });
  const fareClasses = planForFlights(flights);
  const promotions = buildPromotions(now);
  return { startDate: start, flights, fareClasses, promotions, totalSeats: TOTAL_SEATS };
}

function exactExistingPlan(plan, flights) {
  const byKey = new Map(flights.map((flight) => [flightKey(flight), flight]));
  const matches = plan.flights.map((flight) => byKey.get(flightKey(flight)) || null);
  return { matches, count: matches.filter(Boolean).length, complete: matches.every(Boolean) };
}

function inferExistingStart({ airlines, airports, flights, now }) {
  const candidateDates = new Set();
  for (const flight of flights) {
    const departureDate = vietnamDate(valueOf(flight, 'departure_time'));
    for (let offset = 0; offset < 5; offset += 1) candidateDates.add(plusDays(departureDate, -offset));
  }
  const matches = [];
  const partialStarts = new Set();
  for (const startDate of candidateDates) {
    let plan;
    try { plan = buildDemoPlan({ airlines, airports, startDate, now }); } catch (_error) { continue; }
    const result = exactExistingPlan(plan, flights);
    if (result.complete) matches.push({ startDate, plan, matches: result.matches });
    else if (result.count > 0) partialStarts.add(startDate);
  }
  if (matches.length > 1) throw new Error('Multiple possible demo flight schedules were found; refusing to guess the seed identity.');
  if (matches.length) return matches[0];
  if (partialStarts.size) {
    throw new Error(`A partial existing demo flight schedule may start on ${[...partialStarts].sort()[0]}; refusing to create a second schedule.`);
  }
  return null;
}

async function loadSnapshot(models, transaction) {
  const options = transaction ? { transaction } : {};
  const flightCount = await models.Flight.count(options);
  if (flightCount > 10_000) throw new Error('Too many existing flights for a safe local demo-seed audit; no data was changed.');
  const [airlines, airports, flights, fareClasses] = await Promise.all([
    models.Airline.findAll({ ...options, attributes: ['id', 'iata_code', 'name'], order: [['iata_code', 'ASC']] }),
    models.Airport.findAll({ ...options, attributes: ['id', 'iata_code', 'name', 'city', 'country'] }),
    models.Flight.findAll({ ...options, attributes: ['id', 'airline_id', 'departure_airport_id', 'arrival_airport_id', 'departure_time', 'arrival_time', 'total_seats', 'available_seats', 'status'] }),
    models.FareClass.findAll({ ...options, attributes: ['id', 'flight_id', 'class_name', 'price', 'seat_quota'] }),
  ]);
  const roles = {};
  for (const name of ['admin', 'staff', 'customer']) roles[name] = await models.Role.findOne({ where: { name }, ...options });
  return { airlines, airports, flights, fareClasses, roles };
}

function makeExecutionPlan(snapshot, now, requestedStartDate) {
  for (const name of ['admin', 'staff', 'customer']) {
    if (!snapshot.roles[name]) throw new Error(`Required role '${name}' was not found; refusing to create demo accounts.`);
  }
  if (!snapshot.airlines.length) throw new Error('Airline data is missing; no demo data was created.');
  const inferred = inferExistingStart({ airlines: snapshot.airlines, airports: snapshot.airports, flights: snapshot.flights, now });
  const startDate = inferred?.startDate || codeDate(requestedStartDate || defaultDemoStartDate(now));
  const plan = buildDemoPlan({ airlines: snapshot.airlines, airports: snapshot.airports, startDate, now });
  const current = exactExistingPlan(plan, snapshot.flights);
  const matchingRouteTimes = plan.flights.filter((planned) => snapshot.flights.some((existing) => flightRouteTimeKey(existing) === flightRouteTimeKey(planned)));
  if (matchingRouteTimes.length && !current.complete) {
    throw new Error('An existing flight conflicts with a planned demo route/time; refusing to overwrite or create a partial schedule.');
  }
  if (current.count > 0 && !current.complete) throw new Error('A partial existing demo flight schedule was found; no data was changed.');

  let existingSchedule = null;
  if (current.complete) {
    const ids = new Set(current.matches.map((row) => String(valueOf(row, 'id'))));
    const expectedClasses = plan.fareClasses;
    for (const [index, flight] of current.matches.entries()) {
      const actual = snapshot.fareClasses.filter((fare) => String(valueOf(fare, 'flight_id')) === String(valueOf(flight, 'id')));
      const expected = expectedClasses.filter((fare) => fare.slot === plan.flights[index].slot);
      const valid = actual.length === expected.length && expected.every((wanted) => actual.some((item) =>
        valueOf(item, 'class_name') === wanted.class_name
        && Number(valueOf(item, 'price')) === wanted.price
        && Number(valueOf(item, 'seat_quota')) === wanted.seat_quota));
      if (!valid) throw new Error('Existing demo flight fare classes differ from the seed schedule; refusing to modify them.');
    }
    existingSchedule = { ids, flights: current.matches };
  }

  if (!existingSchedule) {
    const daysAhead = daysFromTodayVietnam(startDate, now);
    if (daysAhead < 1 || daysAhead > 30) throw new Error('The automatically selected demo schedule date is not within the allowed future range.');
    if (daysAhead > 7) throw new Error('Choose a start date within the next 7 days so the demo includes near-term flights.');
  }
  const accountsToCreate = DEMO_ACCOUNTS.filter((account) => !snapshot.existingUsers[account.email]);
  const promoToCreate = plan.promotions.filter((promotion) => !snapshot.existingPromotions[promotion.code]);
  return {
    plan,
    accountsToCreate,
    promotionsToCreate: promoToCreate,
    flightScheduleExists: Boolean(existingSchedule),
    flightsToCreate: existingSchedule ? [] : plan.flights,
    fareClassesToCreate: existingSchedule ? [] : plan.fareClasses,
    roles: snapshot.roles,
  };
}

function runDemoSeed(options) {
  return require('../seeders/demo/DatabaseSeeder').runDemoSeed(options);
}

module.exports = {
  assertSafeDockerTarget,
  buildDemoPlan,
  defaultDemoStartDate,
  loadSnapshot,
  makeExecutionPlan,
  runDemoSeed,
};
