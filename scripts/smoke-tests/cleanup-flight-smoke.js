require('dotenv').config();

const { generateToken } = require('../../utils/jwt.util');

const BASE_URL = `http://localhost:${process.env.PORT || 5000}/api/v1`;
const adminToken = generateToken({ id: 1, email: 'admin-smoke@example.test', role: 'admin' });

async function request(path, method = 'GET') {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  return { status: response.status, body: await response.json() };
}

async function main() {
  const airlines = await request('/airlines?search=Flight%20Airline&limit=100');
  if (airlines.status !== 200) throw new Error('Cannot list prior Flight Airline smoke records.');
  const targetAirlineIds = new Set(airlines.body.data.map((airline) => Number(airline.id)));
  if (targetAirlineIds.size === 0) {
    console.log('No prior Flight Airline smoke records require cleanup.');
    return;
  }

  const flights = [];
  let page = 1;
  let totalPages = 1;
  do {
    const result = await request(`/flights?status=completed&limit=1000&page=${page}`);
    if (result.status !== 200) throw new Error(`Cannot scan completed flights (page ${page}).`);
    flights.push(...result.body.data.filter((flight) => targetAirlineIds.has(Number(flight.airline_id))));
    totalPages = result.body.pagination.totalPages;
    page += 1;
  } while (page <= totalPages && flights.length < targetAirlineIds.size);

  if (flights.length !== targetAirlineIds.size) {
    if (flights.length === 0) {
      for (const airlineId of targetAirlineIds) {
        const airline = await request(`/airlines/${airlineId}`, 'DELETE');
        if (airline.status !== 200) throw new Error(`Orphan smoke airline #${airlineId} was not deleted: HTTP ${airline.status}.`);
      }
      console.log(`Cleaned ${targetAirlineIds.size} orphan prior Flight Airline smoke record(s); their flights were already removed.`);
      return;
    }
    throw new Error(`Found ${flights.length}/${targetAirlineIds.size} prior smoke flight(s); no records were deleted.`);
  }

  for (const flight of flights) {
    const deleted = await request(`/flights/${flight.id}`, 'DELETE');
    if (deleted.status !== 200) throw new Error(`Flight #${flight.id} was not deleted: HTTP ${deleted.status}.`);
    for (const airportId of [flight.departure_airport_id, flight.arrival_airport_id]) {
      const airport = await request(`/airports/${airportId}`, 'DELETE');
      if (airport.status !== 200) throw new Error(`Smoke airport #${airportId} was not deleted: HTTP ${airport.status}.`);
    }
  }

  for (const airlineId of targetAirlineIds) {
    const airline = await request(`/airlines/${airlineId}`, 'DELETE');
    if (airline.status !== 200) throw new Error(`Smoke airline #${airlineId} was not deleted: HTTP ${airline.status}.`);
  }

  console.log(`Cleaned ${flights.length} prior flight smoke record(s) with their related airport and airline records.`);
}

main().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
});
