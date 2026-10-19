'use strict';

const FIXTURES = require('../demo-fixtures');

const TOTAL_SEATS = 180;
const ROUTES = Object.freeze([
  { from: 'HAN', to: 'SGN', minutes: 130 }, { from: 'SGN', to: 'HAN', minutes: 130 },
  { from: 'HAN', to: 'DAD', minutes: 85 }, { from: 'DAD', to: 'HAN', minutes: 85 },
  { from: 'SGN', to: 'DAD', minutes: 85 }, { from: 'DAD', to: 'SGN', minutes: 85 },
  { from: 'SGN', to: 'CXR', minutes: 65 }, { from: 'CXR', to: 'SGN', minutes: 65 },
  { from: 'HAN', to: 'PQC', minutes: 125 }, { from: 'PQC', to: 'HAN', minutes: 125 },
]);

function planFlights({ airlines, airports, startDate }) {
  const airlineCodes = new Set(FIXTURES.airlines.map((airline) => airline.iata_code));
  const sortedAirlines = airlines
    .filter((airline) => airlineCodes.has(airline.iata_code))
    .sort((left, right) => String(left.iata_code).localeCompare(String(right.iata_code)));
  if (!sortedAirlines.length) throw new Error('No shared demo airline records are available; seed prerequisites are missing.');
  const airportByCode = new Map(airports.map((airport) => [airport.iata_code, airport]));
  for (const route of ROUTES) {
    if (!airportByCode.has(route.from) || !airportByCode.has(route.to)) {
      throw new Error(`Required demo route airport data is missing: ${route.from} / ${route.to}.`);
    }
  }

  return ROUTES.flatMap((route, routeIndex) => {
    const fromAirport = airportByCode.get(route.from);
    const toAirport = airportByCode.get(route.to);
    return Array.from({ length: 5 }, (_, dayIndex) => {
      const slotIndex = routeIndex * 5 + dayIndex;
      const date = new Date(Date.parse(`${startDate}T00:00:00Z`) + dayIndex * 86_400_000).toISOString().slice(0, 10);
      const hour = String(6 + routeIndex).padStart(2, '0');
      const departure = new Date(`${date}T${hour}:00:00+07:00`);
      const arrival = new Date(departure.getTime() + route.minutes * 60_000);
      return {
        slot: `demo-${route.from}-${route.to}-${date}-${hour}`,
        airline_id: sortedAirlines[slotIndex % sortedAirlines.length].id,
        departure_airport_id: fromAirport.id,
        arrival_airport_id: toAirport.id,
        departure_time: departure,
        arrival_time: arrival,
        total_seats: TOTAL_SEATS,
        available_seats: TOTAL_SEATS,
        status: 'scheduled',
      };
    });
  });
}

async function seed({ models, transaction, flights }) {
  const idsBySlot = new Map();
  for (const flight of flights) {
    const { slot, ...fields } = flight;
    const created = await models.Flight.create(fields, { ...(transaction ? { transaction } : {}) });
    const id = typeof created?.get === 'function' ? created.get('id') : created?.id;
    if (id == null) throw new Error(`FlightSeeder did not receive an id for planned slot ${slot}.`);
    idsBySlot.set(slot, id);
  }
  return idsBySlot;
}

module.exports = { TOTAL_SEATS, ROUTES, planFlights, seed };
