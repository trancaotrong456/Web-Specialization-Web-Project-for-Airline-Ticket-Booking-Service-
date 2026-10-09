'use strict';

const bcrypt = require('bcryptjs');

const TZ_OFFSET_MS = 7 * 60 * 60 * 1000;
const TOTAL_SEATS = 180;
const DEMO_ACCOUNTS = [
  { role: 'admin', email: 'admin@airline-booking.local', passwordKey: 'SEED_ADMIN_PASSWORD', full_name: 'Demo Admin' },
  { role: 'staff', email: 'staff.demo@airline-booking.local', passwordKey: 'SEED_STAFF_PASSWORD', full_name: 'Demo Staff' },
  { role: 'customer', email: 'customer.demo@airline-booking.local', passwordKey: 'SEED_CUSTOMER_PASSWORD', full_name: 'Demo Customer' },
];
const ROUTES = [
  { from: 'HAN', to: 'SGN', minutes: 130 }, { from: 'SGN', to: 'HAN', minutes: 130 },
  { from: 'HAN', to: 'DAD', minutes: 85 }, { from: 'DAD', to: 'HAN', minutes: 85 },
  { from: 'SGN', to: 'DAD', minutes: 85 }, { from: 'DAD', to: 'SGN', minutes: 85 },
  { from: 'SGN', to: 'CXR', minutes: 65 }, { from: 'CXR', to: 'SGN', minutes: 65 },
  { from: 'HAN', to: 'PQC', minutes: 125 }, { from: 'PQC', to: 'HAN', minutes: 125 },
];
const PROMOTION_SPECS = [
  { code: 'WELCOME10', discount_type: 'percent', discount_value: 10 },
  { code: 'HANSGN15', discount_type: 'percent', discount_value: 15 },
  { code: 'TRIP20', discount_type: 'percent', discount_value: 20 },
  { code: 'SKY25', discount_type: 'percent', discount_value: 25 },
  { code: 'WEEKDAY30', discount_type: 'percent', discount_value: 30 },
  { code: 'FLY50K', discount_type: 'amount', discount_value: 50000 },
  { code: 'ROUTE100K', discount_type: 'amount', discount_value: 100000 },
  { code: 'CABIN150K', discount_type: 'amount', discount_value: 150000 },
  { code: 'TRAVEL200K', discount_type: 'amount', discount_value: 200000 },
  { code: 'SKY250K', discount_type: 'amount', discount_value: 250000 },
];

const valueOf = (row, key) => (typeof row?.get === 'function' ? row.get(key) : row?.[key]);
const codeDate = (value) => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  throw new Error('SEED_FLIGHT_START_DATE must use YYYY-MM-DD format.');
};
const vietnamDate = (date) => new Date(new Date(date).getTime() + TZ_OFFSET_MS).toISOString().slice(0, 10);
const daysFromTodayVietnam = (date, now) => {
  const today = vietnamDate(now);
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
};
const plusDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
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
  if (!runtime?.isDockerContainer) throw new Error('Demo seeding must run inside the API Docker container.');
  if (!runtime.composeProject || !/^[a-f0-9]{12,64}$/i.test(runtime.apiContainerId || '') || !/^[a-f0-9]{12,64}$/i.test(runtime.dbContainerId || '')) {
    throw new Error('Demo seeding requires verified API and DB container identities from one Docker Compose project.');
  }
  if (!String(runtime.hostname || '').startsWith(runtime.apiContainerId.slice(0, 12))) {
    throw new Error('The running container does not match the verified Compose API container.');
  }
  return true;
}

function assertSeedPasswords(config) {
  for (const account of DEMO_ACCOUNTS) {
    if (typeof config?.[account.passwordKey] !== 'string' || !config[account.passwordKey].trim()) {
      throw new Error(`Missing password configuration for ${account.role} demo account.`);
    }
  }
  return true;
}

function buildDemoPlan({ airlines, airports, startDate, now = new Date() }) {
  const start = codeDate(startDate);
  if (!Array.isArray(airlines) || airlines.length === 0) throw new Error('No airline records are available; seed prerequisites are missing.');
  const sortedAirlines = [...airlines].sort((a, b) => String(valueOf(a, 'iata_code')).localeCompare(String(valueOf(b, 'iata_code'))));
  const airportByCode = new Map((airports || []).map((airport) => [valueOf(airport, 'iata_code'), airport]));
  for (const route of ROUTES) {
    if (!airportByCode.has(route.from) || !airportByCode.has(route.to)) {
      throw new Error(`Required demo route airport data is missing: ${route.from} / ${route.to}.`);
    }
  }

  const flights = [];
  const fareClasses = [];
  ROUTES.forEach((route, routeIndex) => {
    const fromAirport = airportByCode.get(route.from);
    const toAirport = airportByCode.get(route.to);
    for (let dayIndex = 0; dayIndex < 5; dayIndex += 1) {
      const slotIndex = routeIndex * 5 + dayIndex;
      const date = plusDays(start, dayIndex);
      const hour = String(6 + routeIndex).padStart(2, '0');
      const departure = new Date(`${date}T${hour}:00:00+07:00`);
      const arrival = new Date(departure.getTime() + route.minutes * 60_000);
      const airline = sortedAirlines[slotIndex % sortedAirlines.length];
      const slot = `demo-${route.from}-${route.to}-${date}-${hour}`;
      const flight = {
        slot,
        airline_id: valueOf(airline, 'id'),
        departure_airport_id: valueOf(fromAirport, 'id'),
        arrival_airport_id: valueOf(toAirport, 'id'),
        departure_time: departure,
        arrival_time: arrival,
        total_seats: TOTAL_SEATS,
        available_seats: TOTAL_SEATS,
        status: 'scheduled',
      };
      flights.push(flight);
      fareClasses.push(
        { slot, class_name: 'Economy', price: 1_250_000, seat_quota: 144 },
        { slot, class_name: 'Business', price: 3_600_000, seat_quota: 36 },
      );
    }
  });

  const validFrom = new Date(now.getTime() - 60_000);
  const validTo = new Date(now.getTime() + 90 * 86_400_000);
  const promotions = PROMOTION_SPECS.map((promotion) => ({
    ...promotion, valid_from: validFrom, valid_to: validTo, max_uses: 100, used_count: 0,
  }));
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
  for (const startDate of candidateDates) {
    let plan;
    try { plan = buildDemoPlan({ airlines, airports, startDate, now }); } catch (_error) { continue; }
    const result = exactExistingPlan(plan, flights);
    if (result.complete) matches.push({ startDate, plan, matches: result.matches });
  }
  if (matches.length > 1) throw new Error('Multiple possible demo flight schedules were found; refusing to guess the seed identity.');
  return matches[0] || null;
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
  const existingUsers = {};
  const existingPromotions = {};
  for (const name of ['admin', 'staff', 'customer']) roles[name] = await models.Role.findOne({ where: { name }, ...options });
  for (const account of DEMO_ACCOUNTS) existingUsers[account.email] = await models.User.findOne({ where: { email: account.email }, ...options });
  for (const promotion of PROMOTION_SPECS) existingPromotions[promotion.code] = await models.Promotion.findOne({ where: { code: promotion.code }, ...options });
  return { airlines, airports, flights, fareClasses, roles, existingUsers, existingPromotions };
}

function makeExecutionPlan(snapshot, config, now, apply) {
  for (const name of ['admin', 'staff', 'customer']) {
    if (!snapshot.roles[name]) throw new Error(`Required role '${name}' was not found; refusing to create demo accounts.`);
  }
  if (!snapshot.airlines.length) throw new Error('Airline data is missing; no demo data was created.');
  const inferred = inferExistingStart({ airlines: snapshot.airlines, airports: snapshot.airports, flights: snapshot.flights, now });
  const configuredStart = config?.SEED_FLIGHT_START_DATE || '';
  let startDate = configuredStart ? codeDate(configuredStart) : inferred?.startDate;
  if (!startDate) {
    if (apply) throw new Error('Set SEED_FLIGHT_START_DATE once before the first apply; keep it unchanged for all reruns.');
    startDate = plusDays(vietnamDate(now), 1);
  }
  if (inferred && configuredStart && inferred.startDate !== configuredStart) {
    throw new Error(`An existing demo flight schedule starts on ${inferred.startDate}; refusing to create a second schedule. Keep SEED_FLIGHT_START_DATE unchanged.`);
  }
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
    if (daysAhead < 1 || daysAhead > 30) throw new Error('For a new demo schedule, SEED_FLIGHT_START_DATE must be 1–30 days in the future.');
    if (daysAhead > 7) throw new Error('Choose a start date within the next 7 days so the demo includes near-term flights.');
  }
  const accountsToCreate = DEMO_ACCOUNTS.filter((account) => !snapshot.existingUsers[account.email]);
  if (apply) assertSeedPasswords(config);
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

async function runDemoSeed({ models, sequelize, config = {}, apply = false, now = new Date() }) {
  const analyze = async (transaction) => {
    const snapshot = await loadSnapshot(models, transaction);
    const execution = makeExecutionPlan(snapshot, config, now, apply);
    const wouldCreate = {
      users: execution.accountsToCreate.length,
      flights: execution.flightsToCreate.length,
      fareClasses: execution.fareClassesToCreate.length,
      promotions: execution.promotionsToCreate.length,
    };
    const existing = {
      users: DEMO_ACCOUNTS.length - wouldCreate.users,
      flights: execution.flightScheduleExists ? execution.plan.flights.length : 0,
      fareClasses: execution.flightScheduleExists ? execution.plan.fareClasses.length : 0,
      promotions: execution.plan.promotions.length - wouldCreate.promotions,
    };
    if (!apply) return { mode: 'dry-run', scheduleStartDate: execution.plan.startDate, flightScheduleExists: execution.flightScheduleExists, existing, wouldCreate };

    for (const account of execution.accountsToCreate) {
      const password_hash = await bcrypt.hash(config[account.passwordKey], 12);
      await models.User.create({
        role_id: valueOf(execution.roles[account.role], 'id'),
        full_name: account.full_name,
        email: account.email,
        password_hash,
        phone: null,
        status: 'active',
      }, { transaction });
    }
    for (const promotion of execution.promotionsToCreate) {
      const { code, discount_type, discount_value, valid_from, valid_to, max_uses } = promotion;
      await models.Promotion.create({ code, discount_type, discount_value, valid_from, valid_to, max_uses, used_count: 0 }, { transaction });
    }
    if (!execution.flightScheduleExists) {
      const idsBySlot = new Map();
      for (const flight of execution.flightsToCreate) {
        const { slot, ...fields } = flight;
        const created = await models.Flight.create(fields, { transaction });
        idsBySlot.set(slot, valueOf(created, 'id'));
      }
      for (const fareClass of execution.fareClassesToCreate) {
        const { slot, ...fields } = fareClass;
        await models.FareClass.create({ ...fields, flight_id: idsBySlot.get(slot) }, { transaction });
      }
    }
    return { mode: 'apply', scheduleStartDate: execution.plan.startDate, flightScheduleExists: execution.flightScheduleExists, existing, created: wouldCreate };
  };

  if (!apply) return analyze(null);
  assertSeedPasswords(config);
  return sequelize.transaction((transaction) => analyze(transaction));
}

module.exports = { assertSafeDockerTarget, assertSeedPasswords, buildDemoPlan, runDemoSeed };
