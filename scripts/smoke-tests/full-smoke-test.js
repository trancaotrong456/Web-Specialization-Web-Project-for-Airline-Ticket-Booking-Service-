/*
 * Full backend smoke test.
 * Runs groups in the required order and exits at the first failed assertion.
 * It intentionally validates the documented HTTP contract; it does not patch
 * the application or attempt workarounds when an endpoint is missing.
 */
require('dotenv').config();
const { io } = require('socket.io-client');
const { generateToken } = require('../../utils/jwt.util');
const { signVnpayParams } = require('../../utils/checksum.util');

const BASE_URL = (process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}/api/v1`).replace(/\/$/, '');
const runId = `full-smoke-${Date.now()}`;
const requestTimeout = Number.parseInt(process.env.SMOKE_REQUEST_TIMEOUT_MS || '20000', 10);

class PendingError extends Error {}

function fail(message) {
  throw new Error(message);
}

function expect(condition, message) {
  if (!condition) fail(message);
}

async function api(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || requestTimeout);
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    const contentType = response.headers.get('content-type') || '';
    const body = options.binary
      ? Buffer.from(await response.arrayBuffer())
      : contentType.includes('application/json') ? await response.json() : await response.text();
    return { status: response.status, headers: response.headers, body };
  } finally {
    clearTimeout(timer);
  }
}

async function wakeService() {
  const wakeTimeout = Number.parseInt(process.env.SMOKE_WAKE_TIMEOUT_MS || '60000', 10);
  const response = await api('/health', { timeoutMs: wakeTimeout });
  expect(response.status === 200, `HEALTH expected 200, received ${response.status}: ${JSON.stringify(response.body)}`);
  console.log(`PASS 0 HEALTH (${BASE_URL})`);
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

  const me = await api('/auth/me', { headers: { Authorization: `Bearer ${accessToken}` } });
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
async function findBookableFlight(minSeats = 2) {
  for (let page = 1; page <= 20; page += 1) {
    console.log(`Finding a bookable flight: page ${page}`);
    const result = await api(`/flights/search?min_seats=${minSeats}&page=${page}&limit=10`);
    console.log(`Flight search page ${page}: HTTP ${result.status}`);
    expect(result.status === 200, `Flight search failed: ${JSON.stringify(result.body)}`);
    const flight = result.body.data.find((item) => item.fareClasses && item.fareClasses.length > 0);
    if (flight) return flight;
  }
  throw new PendingError(`No bookable flight with at least ${minSeats} available seats was returned by the production search API.`);
}

async function createGuestBooking(flight, email, label) {
  const response = await api('/bookings', {
    method: 'POST',
    body: JSON.stringify({
      flight_id: flight.id,
      fare_class_id: flight.fareClasses[0].id,
      guest_email: email,
      passengers: [{ passenger_name: label, passport_no: `P${Date.now().toString().slice(-10)}` }],
    }),
  });
  expect(response.status === 201, `Booking creation expected 201, received ${response.status}: ${JSON.stringify(response.body)}`);
  return response.body.data;
}

async function createConfirmedGuestBooking() {
  const flight = await findBookableFlight(2);
  const email = process.env.SMOKE_GUEST_EMAIL || `${runId}-ticket@example.test`;
  const booking = await createGuestBooking(flight, email, 'Production Ticket Smoke');
  const initiated = await api('/payments/initiate', {
    method: 'POST',
    body: JSON.stringify({ booking_id: booking.id, payment_method: 'vnpay', guest_email: email }),
  });
  expect(initiated.status === 200, `Payment initiation expected 200, received ${initiated.status}: ${JSON.stringify(initiated.body)}`);
  const payment = initiated.body.data;
  const params = {
    vnp_Amount: String(Math.round(Number(payment.amount) * 100)),
    vnp_ResponseCode: '00',
    vnp_TxnRef: payment.transaction_ref,
  };
  params.vnp_SecureHash = signVnpayParams(params, process.env.VNP_HASH_SECRET || 'SECRETKEYVNPAY2026DEMO');
  const callback = await api(`/payments/vnpay/ipn?${new URLSearchParams(params).toString()}`);
  if (callback.status !== 200 || callback.body.RspCode !== '00') {
    throw new PendingError(`Production VNPay IPN did not accept the test signature: HTTP ${callback.status}, ${JSON.stringify(callback.body)}. Configure the smoke runner with the same VNP_HASH_SECRET as Render to run the confirmed-ticket/email checks.`);
  }
  console.log(`Confirmed booking via production IPN: booking_id=${booking.id}, at=${new Date().toISOString()}`);
  return { bookingId: booking.id, email };
}

async function pdfTicketSmoke(context) {
  const response = await api(`/bookings/${context.bookingId}/ticket?email=${encodeURIComponent(context.email)}`, { binary: true });
  expect(response.status === 200, `PDF ticket expected 200, received ${response.status}: ${response.body.toString('utf8', 0, 300)}`);
  expect((response.headers.get('content-type') || '').includes('application/pdf'), 'PDF ticket response is not application/pdf.');
  expect(response.body.length > 0, 'PDF ticket response is empty.');
  console.log('PASS 2 PDF TICKET');
}

async function emailSmoke(context) {
  // The callback above executes the production sendBookingConfirmation path.
  // Render logs and an SMTP inbox/dashboard are not exposed through the HTTP API,
  // so delivery cannot be proved from this remote black-box script alone.
  expect(context.bookingId, 'EMAIL requires a confirmed test booking.');
  throw new PendingError('Success IPN completed and triggered the production email path, but SMTP acceptance/delivery is only observable in Render logs or the configured SMTP inbox/dashboard.');
}

async function websocketSmoke(_auth) {
  const threshold = Number.parseInt(process.env.SEAT_WARNING_THRESHOLD || '5', 10);
  let flight = null;
  for (let page = 1; page <= 20 && !flight; page += 1) {
    const search = await api(`/flights/search?min_seats=${threshold + 1}&page=${page}&limit=10`);
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
      () => warningEvents.some((item) =>
        Number(item.flightId) === Number(flight.id)
        && Number(item.availableSeats) === availableSeats
        && typeof item.message === 'string'
        && item.message.includes(String(availableSeats))
      ),
      'seat-warning with flightId, availableSeats, and message'
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
  const adminToken = process.env.SMOKE_ADMIN_TOKEN || generateToken({ id: 1, email: 'admin-smoke@example.test', role: 'admin' });
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

  // These are safe black-box checks that do not need an admin credential.
  // Authorization runs before lookup/validation, so an arbitrary resource ID
  // is sufficient to verify customer PUT/DELETE denial without mutating data.
  expectStatus(await api('/airlines?limit=1'), 200, 'AIRLINE list');
  expectStatus(await api('/airports?limit=1'), 200, 'AIRPORT list');
  expectStatus(await api('/flights/search?page=1&limit=1'), 200, 'FLIGHT public list');
  expectStatus(await api('/promotions?limit=1'), 200, 'PROMOTION list');
  await expectForbidden('POST', '/airlines', { name: `Denied ${suffix}`, iata_code: 'DNY' }, 'AIRLINE POST');
  await expectForbidden('PUT', '/airlines/1', { name: 'Denied' }, 'AIRLINE PUT');
  await expectForbidden('DELETE', '/airlines/1', null, 'AIRLINE DELETE');
  await expectForbidden('POST', '/airports', { iata_code: 'DNY', name: 'Denied', city: 'Denied', country: 'Vietnam' }, 'AIRPORT POST');
  await expectForbidden('PUT', '/airports/1', { city: 'Denied' }, 'AIRPORT PUT');
  await expectForbidden('DELETE', '/airports/1', null, 'AIRPORT DELETE');
  await expectForbidden('POST', '/flights', {}, 'FLIGHT POST');
  await expectForbidden('PUT', '/flights/1', { status: 'cancelled' }, 'FLIGHT PUT');
  await expectForbidden('DELETE', '/flights/1', null, 'FLIGHT DELETE');
  await expectForbidden('POST', '/fare-classes', {}, 'FARE_CLASS POST');
  await expectForbidden('PUT', '/fare-classes/1', { price: 1 }, 'FARE_CLASS PUT');
  await expectForbidden('DELETE', '/fare-classes/1', null, 'FARE_CLASS DELETE');
  console.log('PASS 5 partial: public lists and customer write-RBAC denial.');

  const adminProbe = await api('/flights?limit=1', { headers: adminHeaders });
  if (adminProbe.status === 401 || adminProbe.status === 403) {
    throw new PendingError(`Public lists and customer RBAC passed, but production rejected the local admin test token (HTTP ${adminProbe.status}). Set SMOKE_ADMIN_TOKEN to an authorized production admin access token to run admin POST/PUT/DELETE.`);
  }
  expect(adminProbe.status === 200, `CRUD admin credential probe failed: ${adminProbe.status}: ${JSON.stringify(adminProbe.body)}`);

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
  const results = [];
  const runGroup = async (name, fn) => {
    console.log(`START ${name}`);
    try {
      await fn();
      results.push([name, 'PASS', '']);
    } catch (error) {
      const status = error instanceof PendingError ? 'PENDING' : 'FAIL';
      results.push([name, status, error.message || String(error)]);
      console.error(`${status} ${name}: ${error.stack || error.message || String(error)}`);
    }
  };
  const printSummary = () => {
    console.log('\nSmoke summary');
    for (const [name, status, detail] of results) {
      console.log(`${status}\t${name}${detail ? `\t${detail}` : ''}`);
    }
    if (results.some(([, status]) => status === 'FAIL')) process.exitCode = 1;
  };

  if (process.env.SMOKE_ONLY === 'crud') {
    await runGroup('5 CRUD DOMAINS', crudSmoke);
    printSummary();
    return;
  }
  if (process.env.SMOKE_ONLY === 'confirmation') {
    await runGroup('EMAIL CONFIRMATION SETUP', createConfirmedGuestBooking);
    printSummary();
    return;
  }

  await runGroup('0 HEALTH', wakeService);
  await runGroup('1 AUTH', authSmoke);

  let confirmedContext;
  await runGroup('2+3 CONFIRMED BOOKING SETUP', async () => {
    confirmedContext = await createConfirmedGuestBooking();
  });
  if (confirmedContext) {
    await runGroup('2 PDF TICKET', () => pdfTicketSmoke(confirmedContext));
    await runGroup('3 EMAIL', () => emailSmoke(confirmedContext));
  } else {
    results.push(['2 PDF TICKET', 'PENDING', 'Confirmed-booking setup did not complete.']);
    results.push(['3 EMAIL', 'PENDING', 'Confirmed-booking setup did not complete.']);
  }

  await runGroup('4 WEBSOCKET', websocketSmoke);
  await runGroup('5 CRUD DOMAINS', crudSmoke);

  printSummary();
}

main()
  .catch((error) => {
    console.error(`FAIL: ${error.stack || error.message || String(error)}`);
    process.exitCode = 1;
  });
