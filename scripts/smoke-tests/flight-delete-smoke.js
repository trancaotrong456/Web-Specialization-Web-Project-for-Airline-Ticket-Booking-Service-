require('dotenv').config();

const { generateToken } = require('../../utils/jwt.util');

const BASE_URL = `http://localhost:${process.env.PORT || 5000}/api/v1`;
const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
const adminToken = generateToken({ id: 1, email: 'admin-smoke@example.test', role: 'admin' });

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function api(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();
  return { status: response.status, body };
}

async function admin(path, method = 'GET', body) {
  return api(path, {
    method,
    headers: { Authorization: `Bearer ${adminToken}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function main() {
  const customer = await api('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: `flight-delete-${Date.now()}@example.test`,
      password: 'SmokePass123!',
      full_name: 'Flight Delete Customer',
    }),
  });
  expect(customer.status === 201, 'Could not create customer test user.');
  const customerToken = customer.body.data.accessToken;

  const airline = await admin('/airlines', 'POST', { name: `Delete Smoke Airline ${suffix}`, iata_code: `Q${suffix.slice(0, 2)}` });
  expect(airline.status === 201, `Airline setup failed: ${JSON.stringify(airline.body)}`);
  const departureAirport = await admin('/airports', 'POST', { iata_code: `E${suffix.slice(0, 2)}`, name: `Delete Departure ${suffix}`, city: 'Smoke City', country: 'Vietnam' });
  const arrivalAirport = await admin('/airports', 'POST', { iata_code: `F${suffix.slice(0, 2)}`, name: `Delete Arrival ${suffix}`, city: 'Smoke City', country: 'Vietnam' });
  expect(departureAirport.status === 201 && arrivalAirport.status === 201, 'Airport setup failed.');

  const now = Date.now();
  const flight = await admin('/flights', 'POST', {
    airline_id: airline.body.data.id,
    departure_airport_id: departureAirport.body.data.id,
    arrival_airport_id: arrivalAirport.body.data.id,
    departure_time: new Date(now + 86_400_000).toISOString(),
    arrival_time: new Date(now + 93_600_000).toISOString(),
    total_seats: 20,
    status: 'scheduled',
  });
  expect(flight.status === 201, `Flight setup failed: ${JSON.stringify(flight.body)}`);
  const flightId = flight.body.data.id;

  const fareClass = await admin('/fare-classes', 'POST', {
    flight_id: flightId,
    class_name: 'Delete Smoke Fare',
    price: 100000,
    seat_quota: 20,
  });
  expect(fareClass.status === 201, `Fare class setup failed: ${JSON.stringify(fareClass.body)}`);
  const fareClassId = fareClass.body.data.id;

  // Case 3: customer cannot delete.
  const customerDelete = await api(`/flights/${flightId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${customerToken}` },
  });
  expect(customerDelete.status === 403, `Customer delete expected 403, received ${customerDelete.status}`);
  console.log('PASS case 3: customer DELETE /flights/:id returned 403.');

  // Case 1: no booking history => delete succeeds, including its fare class.
  const adminDelete = await admin(`/flights/${flightId}`, 'DELETE');
  expect(adminDelete.status === 200, `Admin delete expected 200, received ${adminDelete.status}: ${JSON.stringify(adminDelete.body)}`);
  const deletedFlight = await admin(`/flights/${flightId}`);
  const deletedFareClass = await api(`/fare-classes/${fareClassId}`);
  expect(deletedFlight.status === 404, `Deleted flight still exists: ${deletedFlight.status}`);
  expect(deletedFareClass.status === 404, `Related fare class was not removed: ${deletedFareClass.status}`);
  console.log('PASS case 1: admin deleted flight without bookings; flight and fare class are gone.');

  // Cleanup parent test records now that the flight is gone.
  await admin(`/airlines/${airline.body.data.id}`, 'DELETE');
  await admin(`/airports/${departureAirport.body.data.id}`, 'DELETE');
  await admin(`/airports/${arrivalAirport.body.data.id}`, 'DELETE');

  // Case 2: an existing booking on any flight blocks deletion and leaves the flight intact.
  const bookings = await admin('/bookings/admin/all?limit=1');
  expect(bookings.status === 200 && bookings.body.data && bookings.body.data.length > 0, 'No existing booking found for the conflict case.');
  const bookedFlightId = bookings.body.data[0].flight_id;
  const conflict = await admin(`/flights/${bookedFlightId}`, 'DELETE');
  expect(conflict.status === 409, `Booked flight delete expected 409, received ${conflict.status}: ${JSON.stringify(conflict.body)}`);
  expect(conflict.body.message === 'Không thể xóa chuyến bay đã có lịch sử đặt vé. Vui lòng dùng chức năng hủy chuyến bay thay thế.', 'Conflict response message does not match the required text.');
  const retainedFlight = await admin(`/flights/${bookedFlightId}`);
  expect(retainedFlight.status === 200, 'Booked flight was unexpectedly removed.');
  console.log('PASS case 2: booked flight deletion returned 409 and flight remains.');
}

main().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
});
