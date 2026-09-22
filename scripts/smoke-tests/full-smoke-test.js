/*
 * Full backend smoke test.
 * Runs groups in the required order and exits at the first failed assertion.
 * It intentionally validates the documented HTTP contract; it does not patch
 * the application or attempt workarounds when an endpoint is missing.
 */
require('dotenv').config();
const { io } = require('socket.io-client');
const { generateToken } = require('../../utils/jwt.util');

const BASE_URL = `http://localhost:${process.env.PORT || 5000}/api/v1`;
const runId = `full-smoke-${Date.now()}`;

function fail(message) {
  throw new Error(message);
}

function expect(condition, message) {
  if (!condition) fail(message);
}

async function api(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();
  return { status: response.status, headers: response.headers, body };
}

async function authSmoke() {
  const email = `${runId}@example.test`;
  const password = 'SmokePass123!';
  const registration = await api('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, full_name: 'Full Smoke Customer' }),
  });
  expect(registration.status === 201, `AUTH register expected 201, received ${registration.status}: ${JSON.stringify(registration.body)}`);
  console.log('PASS 1.1 AUTH register');

  const login = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  expect(login.status === 200, `AUTH login expected 200, received ${login.status}: ${JSON.stringify(login.body)}`);
  const { accessToken, refreshToken } = login.body.data || {};
  expect(accessToken && refreshToken, `AUTH login expected data.accessToken and data.refreshToken, received: ${JSON.stringify(login.body)}`);
  console.log('PASS 1.2 AUTH login');

  const me = await api('/users/my', { headers: { Authorization: `Bearer ${accessToken}` } });
  expect(me.status === 200, `AUTH profile expected 200, received ${me.status}: ${JSON.stringify(me.body)}`);
  expect(me.body.data && me.body.data.email === email, 'AUTH profile returned a different user.');
  console.log('PASS 1.3 AUTH profile');

  const refresh = await api('/auth/refresh-token', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });
  expect(refresh.status === 200 && refresh.body.data && refresh.body.data.accessToken, `AUTH refresh expected 200 with a new accessToken, received ${refresh.status}: ${JSON.stringify(refresh.body)}`);
  console.log('PASS 1.4 AUTH refresh');

  const logout = await api('/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ refreshToken }),
  });
  expect(logout.status === 200, `AUTH logout expected 200, received ${logout.status}: ${JSON.stringify(logout.body)}`);
  const revoked = await api('/auth/refresh-token', { method: 'POST', body: JSON.stringify({ refreshToken }) });
  expect(revoked.status >= 400, `AUTH revoked refresh token should be rejected, received ${revoked.status}.`);
  console.log('PASS 1.5 AUTH logout/revocation');
  return { email, accessToken, refreshToken };
}

// The remaining groups are deliberately defined in this same script so they
// can run without changing the test runner once AUTH meets its contract.
async function pdfTicketSmoke() {
  // Route availability is checked first. A registered route must respond before
  // creating a confirmed test booking and exercising the PDF binary contract.
  const response = await api('/bookings/100012/ticket');
  expect(
    response.status !== 404,
    `PDF ticket endpoint expected GET /bookings/:id/ticket but received 404: ${JSON.stringify(response.body)}`
  );
  fail('PDF ticket route exists; add the confirmed-booking PDF assertions here.');
}

async function emailSmoke() {
  const booking = await Booking.findOne({ where: { status: 'confirmed' }, order: [['id', 'DESC']] });
  expect(booking, 'EMAIL requires an existing confirmed booking.');

  await Promise.race([
    emailService.sendBookingConfirmation(booking.id),
    new Promise((_, reject) => setTimeout(() => reject(new Error('SMTP send timed out after 12 seconds')), 12_000)),
  ]);
  console.log(`PASS 3 EMAIL: SMTP accepted confirmation for booking #${booking.id}.`);
}

async function websocketSmoke(_auth) {
  const threshold = Number.parseInt(process.env.SEAT_WARNING_THRESHOLD || '5', 10);
  let flight = null;
  for (let page = 1; page <= 20 && !flight; page += 1) {
    const search = await api(`/flights/search?min_seats=${threshold + 1}&page=${page}&limit=100`);
    expect(search.status === 200, `WEBSOCKET flight search failed: ${JSON.stringify(search.body)}`);
    flight = search.body.data.find((item) =>
      Number(item.available_seats) <= threshold + 3 && item.fareClasses && item.fareClasses.length > 0
    );
  }
  expect(flight, `WEBSOCKET needs a scheduled flight with ${threshold + 1}-${threshold + 3} seats available.`);

  const warningEvents = [];
  const seatEvents = [];
  const socket = io(BASE_URL.replace('/api/v1', ''), { transports: ['websocket'], timeout: 10_000 });
  const once = (event) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`WEBSOCKET timed out waiting for ${event}.`)), 10_000);
    socket.once(event, (...args) => { clearTimeout(timer); resolve(args); });
  });
  const waitFor = async (predicate, name) => {
    const started = Date.now();
    while (Date.now() - started < 10_000) {
      if (predicate()) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    fail(`WEBSOCKET did not receive ${name} within 10 seconds.`);
  };

  try {
    await once('connect');
    socket.on('seat-warning', (payload) => warningEvents.push(payload));
    socket.on('flight_seats_updated', (payload) => seatEvents.push(payload));
    socket.emit('join_flight', flight.id);
    await new Promise((resolve) => setTimeout(resolve, 250));

    let availableSeats = Number(flight.available_seats);
    const createdBookingIds = [];
    const websocketGuestEmail = `${runId}-websocket@example.test`;
    while (availableSeats > threshold) {
      const booking = await api('/bookings', {
        method: 'POST',
        body: JSON.stringify({
          flight_id: flight.id,
          fare_class_id: flight.fareClasses[0].id,
          guest_email: websocketGuestEmail,
          passengers: [{ passenger_name: 'WebSocket Smoke', passport_no: `${runId}-${createdBookingIds.length}` }],
        }),
      });
      expect(booking.status === 201, `WEBSOCKET booking creation failed: ${JSON.stringify(booking.body)}`);
      createdBookingIds.push(booking.body.data.id);
      availableSeats = Number(booking.body.data.flight.available_seats);
    }

    await waitFor(
      () => seatEvents.some((item) => Number(item.flight_id) === Number(flight.id) && Number(item.available_seats) === availableSeats),
      'flight_seats_updated for low seat count'
    );
    await waitFor(
      () => warningEvents.some((item) => Number(item.flightId) === Number(flight.id) && Number(item.availableSeats) === availableSeats && item.message === `Chỉ còn ${availableSeats} ghế!`),
      'seat-warning with the required payload'
    );

    const warningCountBeforeCancel = warningEvents.length;
    const cancelledBookingId = createdBookingIds.pop();
    const cancelled = await api(`/bookings/${cancelledBookingId}/cancel`, {
      method: 'PUT',
      body: JSON.stringify({ guest_email: websocketGuestEmail }),
    });
    expect(cancelled.status === 200, `WEBSOCKET cancellation failed: ${JSON.stringify(cancelled.body)}`);
    const seatsAfterCancel = availableSeats + 1;
    expect(seatsAfterCancel > threshold, 'WEBSOCKET setup did not restore seats above threshold.');
    await waitFor(
      () => seatEvents.some((item) => Number(item.flight_id) === Number(flight.id) && Number(item.available_seats) === seatsAfterCancel),
      'flight_seats_updated after cancellation'
    );
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(warningEvents.length === warningCountBeforeCancel, 'WEBSOCKET emitted a seat-warning after seats rose above threshold.');
    console.log('PASS 4 WEBSOCKET: received flight_seats_updated and seat-warning; no warning after seats recovered.');
  } finally {
    socket.disconnect();
  }
}

async function crudSmoke() {
  const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
  const adminToken = generateToken({ id: 1, email: 'admin-smoke@example.test', role: 'admin' });
  const adminHeaders = { Authorization: `Bearer ${adminToken}` };
  const customer = await api('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: `${runId}-crud@example.test`,
      password: 'SmokePass123!',
      full_name: 'CRUD Smoke Customer',
    }),
  });
  expect(customer.status === 201, `CRUD customer registration failed: ${JSON.stringify(customer.body)}`);
  const customerHeaders = { Authorization: `Bearer ${customer.body.data.accessToken}` };
  const expectStatus = (response, status, label) =>
    expect(response.status === status, `${label}: expected ${status}, received ${response.status}: ${JSON.stringify(response.body)}`);
  const expectForbidden = async (method, path, body, label) => {
    const response = await api(path, {
      method,
      headers: customerHeaders,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    expectStatus(response, 403, `${label} as customer`);
  };

  // Airline: use a disposable record for the full lifecycle.
  const airlinePayload = { name: `Smoke Airline ${suffix}`, iata_code: `Z${suffix.slice(0, 2)}`, logo_url: 'https://example.test/logo.png' };
  expectStatus(await api('/airlines?limit=1'), 200, 'AIRLINE list');
  await expectForbidden('POST', '/airlines', airlinePayload, 'AIRLINE POST');
  let response = await api('/airlines', { method: 'POST', headers: adminHeaders, body: JSON.stringify(airlinePayload) });
  expectStatus(response, 201, 'AIRLINE POST');
  const airlineId = response.body.data.id;
  await expectForbidden('PUT', `/airlines/${airlineId}`, { name: 'Forbidden airline' }, 'AIRLINE PUT');
  response = await api(`/airlines/${airlineId}`, { method: 'PUT', headers: adminHeaders, body: JSON.stringify({ name: `${airlinePayload.name} Updated` }) });
  expectStatus(response, 200, 'AIRLINE PUT');
  await expectForbidden('DELETE', `/airlines/${airlineId}`, null, 'AIRLINE DELETE');
  expectStatus(await api(`/airlines/${airlineId}`, { method: 'DELETE', headers: adminHeaders }), 200, 'AIRLINE DELETE');
  console.log('PASS 5.1 AIRLINE CRUD and customer RBAC.');

  // Airports are tested with disposable records; separate related records are created for Flight below.
  const airportPayload = { iata_code: `X${suffix.slice(0, 2)}`, name: `Smoke Airport ${suffix}`, city: 'Smoke City', country: 'Vietnam' };
  expectStatus(await api('/airports?limit=1'), 200, 'AIRPORT list');
  await expectForbidden('POST', '/airports', airportPayload, 'AIRPORT POST');
  response = await api('/airports', { method: 'POST', headers: adminHeaders, body: JSON.stringify(airportPayload) });
  expectStatus(response, 201, 'AIRPORT POST');
  const airportId = response.body.data.id;
  await expectForbidden('PUT', `/airports/${airportId}`, { city: 'Forbidden City' }, 'AIRPORT PUT');
  expectStatus(await api(`/airports/${airportId}`, { method: 'PUT', headers: adminHeaders, body: JSON.stringify({ city: 'Updated City' }) }), 200, 'AIRPORT PUT');
  await expectForbidden('DELETE', `/airports/${airportId}`, null, 'AIRPORT DELETE');
  expectStatus(await api(`/airports/${airportId}`, { method: 'DELETE', headers: adminHeaders }), 200, 'AIRPORT DELETE');
  console.log('PASS 5.2 AIRPORT CRUD and customer RBAC.');

  // Create related resources dedicated to Flight/FareClass test data.
  const relatedAirline = await api('/airlines', {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ name: `Flight Airline ${suffix}`, iata_code: `Y${suffix.slice(0, 2)}` }),
  });
  expectStatus(relatedAirline, 201, 'FLIGHT related airline setup');
  const depAirport = await api('/airports', {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ iata_code: `D${suffix.slice(0, 2)}`, name: `Departure ${suffix}`, city: 'Smoke City', country: 'Vietnam' }),
  });
  expectStatus(depAirport, 201, 'FLIGHT departure airport setup');
  const arrAirport = await api('/airports', {
    method: 'POST', headers: adminHeaders,
    body: JSON.stringify({ iata_code: `R${suffix.slice(0, 2)}`, name: `Arrival ${suffix}`, city: 'Smoke City', country: 'Vietnam' }),
  });
  expectStatus(arrAirport, 201, 'FLIGHT arrival airport setup');
  const departure = new Date(Date.now() + 86_400_000).toISOString();
  const arrival = new Date(Date.now() + 93_600_000).toISOString();
  const flightPayload = {
    airline_id: relatedAirline.body.data.id,
    departure_airport_id: depAirport.body.data.id,
    arrival_airport_id: arrAirport.body.data.id,
    departure_time: departure,
    arrival_time: arrival,
    total_seats: 20,
    status: 'scheduled',
  };
  expectStatus(await api('/flights?limit=1', { headers: adminHeaders }), 200, 'FLIGHT list');
  await expectForbidden('POST', '/flights', flightPayload, 'FLIGHT POST');
  response = await api('/flights', { method: 'POST', headers: adminHeaders, body: JSON.stringify(flightPayload) });
  expectStatus(response, 201, 'FLIGHT POST');
  const flightId = response.body.data.id;
  await expectForbidden('PUT', `/flights/${flightId}`, { status: 'completed' }, 'FLIGHT PUT');
  expectStatus(await api(`/flights/${flightId}`, { method: 'PUT', headers: adminHeaders, body: JSON.stringify({ status: 'completed' }) }), 200, 'FLIGHT PUT');
  console.log('PASS 5.3 FLIGHT list/create/update and customer RBAC.');

  const farePayload = { flight_id: flightId, class_name: `Smoke Fare ${suffix}`, price: 123456, seat_quota: 10 };
  expectStatus(await api(`/fare-classes/flight/${flightId}`), 200, 'FARE_CLASS list');
  await expectForbidden('POST', '/fare-classes', farePayload, 'FARE_CLASS POST');
  response = await api('/fare-classes', { method: 'POST', headers: adminHeaders, body: JSON.stringify(farePayload) });
  expectStatus(response, 201, 'FARE_CLASS POST');
  const fareId = response.body.data.id;
  await expectForbidden('PUT', `/fare-classes/${fareId}`, { price: 1 }, 'FARE_CLASS PUT');
  expectStatus(await api(`/fare-classes/${fareId}`, { method: 'PUT', headers: adminHeaders, body: JSON.stringify({ price: 234567 }) }), 200, 'FARE_CLASS PUT');
  await expectForbidden('DELETE', `/fare-classes/${fareId}`, null, 'FARE_CLASS DELETE');
  expectStatus(await api(`/fare-classes/${fareId}`, { method: 'DELETE', headers: adminHeaders }), 200, 'FARE_CLASS DELETE');
  console.log('PASS 5.4 FARE_CLASS CRUD and customer RBAC.');

  await expectForbidden('DELETE', `/flights/${flightId}`, null, 'FLIGHT DELETE');
  expectStatus(await api(`/flights/${flightId}`, { method: 'DELETE', headers: adminHeaders }), 200, 'FLIGHT DELETE');
  console.log('PASS 5.3b FLIGHT DELETE and customer RBAC.');

  // Per requested scope, promotion is public-read only. Its source currently
  // exposes Admin CRUD routes, but those routes are intentionally not exercised.
  expectStatus(await api('/promotions?limit=1'), 200, 'PROMOTION list');
  console.log('PASS 5.5 PROMOTION public list; Admin CRUD intentionally skipped by requested scope.');
}

async function main() {
  // Email is pending because local TCP connectivity to SMTP port 587 is blocked.
  // Continue from group 4 as requested.
  await websocketSmoke();
  await crudSmoke();
}

main()
  .catch((error) => {
    console.error(`FAIL: ${error.stack || error.message || String(error)}`);
    process.exitCode = 1;
  });
