require('dotenv').config();

const { generateToken } = require('../../utils/jwt.util');

const BASE_URL = `http://localhost:${process.env.PORT || 5000}/api/v1`;
const runId = `booking-access-${Date.now()}`;

const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function api(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json();
  return { status: response.status, body };
}

async function register(label) {
  const response = await api('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: `${runId}-${label}@example.test`,
      password: 'SmokePass123!',
      full_name: `Booking Access ${label}`,
    }),
  });
  expect(response.status === 201, `Could not register ${label}: ${JSON.stringify(response.body)}`);
  return response.body.data;
}

const adminToken = () => generateToken({ id: 1, email: 'admin-smoke@example.test', role: 'admin' });

async function testFlight() {
  const response = await api('/flights/search?min_seats=20&limit=100');
  expect(response.status === 200, 'Could not search for a suitable flight.');
  const flight = response.body.data.find((item) => item.fareClasses && item.fareClasses.length > 0);
  expect(flight, 'No scheduled flight with fare class and at least 20 seats is available.');
  return flight;
}

async function createBooking(flight, { token, guestEmail, label }) {
  const response = await api('/bookings', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify({
      flight_id: flight.id,
      fare_class_id: flight.fareClasses[0].id,
      ...(guestEmail ? { guest_email: guestEmail } : {}),
      passengers: [{ passenger_name: `Access ${label}`, passport_no: `A${Date.now().toString().slice(-8)}${label.slice(0, 6)}` }],
    }),
  });
  expect(response.status === 201, `Create ${label} booking failed: ${JSON.stringify(response.body)}`);
  return response.body.data;
}

async function expectStatus(response, status, label) {
  expect(response.status === status, `${label}: expected ${status}, got ${response.status}: ${JSON.stringify(response.body)}`);
}

async function main() {
  const flight = await testFlight();
  const owner = await register('owner');
  const other = await register('other');
  const admin = adminToken();
  const ownerHeaders = { Authorization: `Bearer ${owner.accessToken}` };
  const otherHeaders = { Authorization: `Bearer ${other.accessToken}` };
  const adminHeaders = { Authorization: `Bearer ${admin}` };

  const detailUser = await createBooking(flight, { token: owner.accessToken, label: 'detail-owner' });
  await expectStatus(await api(`/bookings/${detailUser.id}`, { headers: ownerHeaders }), 200, 'GET owner');
  await expectStatus(await api(`/bookings/${detailUser.id}`, { headers: otherHeaders }), 403, 'GET other user');
  await expectStatus(await api(`/bookings/${detailUser.id}`, { headers: adminHeaders }), 200, 'GET admin');
  const detailGuestEmail = `${runId}-detail-guest@example.test`;
  const detailGuest = await createBooking(flight, { guestEmail: detailGuestEmail, label: 'detail-guest' });
  await expectStatus(await api(`/bookings/${detailGuest.id}?email=${encodeURIComponent(detailGuestEmail)}`), 200, 'GET guest correct email');
  await expectStatus(await api(`/bookings/${detailGuest.id}?email=wrong@example.test`), 403, 'GET guest wrong email');
  console.log('PASS GET /bookings/:id: owner/admin/correct guest email allowed; other/wrong guest email denied.');

  const cancelOwner = await createBooking(flight, { token: owner.accessToken, label: 'cancel-owner' });
  await expectStatus(await api(`/bookings/${cancelOwner.id}/cancel`, { method: 'PUT', headers: ownerHeaders, body: '{}' }), 200, 'CANCEL owner');
  const cancelOther = await createBooking(flight, { token: owner.accessToken, label: 'cancel-other' });
  await expectStatus(await api(`/bookings/${cancelOther.id}/cancel`, { method: 'PUT', headers: otherHeaders, body: '{}' }), 403, 'CANCEL other user');
  const cancelAdmin = await createBooking(flight, { token: owner.accessToken, label: 'cancel-admin' });
  await expectStatus(await api(`/bookings/${cancelAdmin.id}/cancel`, { method: 'PUT', headers: adminHeaders, body: '{}' }), 200, 'CANCEL admin');
  const cancelGuestEmail = `${runId}-cancel-guest@example.test`;
  const cancelGuest = await createBooking(flight, { guestEmail: cancelGuestEmail, label: 'cancel-guest' });
  await expectStatus(await api(`/bookings/${cancelGuest.id}/cancel`, { method: 'PUT', body: JSON.stringify({ guest_email: cancelGuestEmail }) }), 200, 'CANCEL guest correct email');
  const cancelGuestWrong = await createBooking(flight, { guestEmail: `${runId}-cancel-wrong@example.test`, label: 'cancel-guest-wrong' });
  await expectStatus(await api(`/bookings/${cancelGuestWrong.id}/cancel`, { method: 'PUT', body: JSON.stringify({ guest_email: 'wrong@example.test' }) }), 403, 'CANCEL guest wrong email');
  console.log('PASS PUT /bookings/:id/cancel: owner/admin/correct guest email allowed; other/wrong guest email denied.');

  const paymentOwner = await createBooking(flight, { token: owner.accessToken, label: 'payment-owner' });
  await expectStatus(await api('/payments/initiate', { method: 'POST', headers: ownerHeaders, body: JSON.stringify({ booking_id: paymentOwner.id, payment_method: 'vnpay' }) }), 200, 'PAYMENT owner');
  const paymentOther = await createBooking(flight, { token: owner.accessToken, label: 'payment-other' });
  await expectStatus(await api('/payments/initiate', { method: 'POST', headers: otherHeaders, body: JSON.stringify({ booking_id: paymentOther.id, payment_method: 'vnpay' }) }), 403, 'PAYMENT other user');
  const paymentAdmin = await createBooking(flight, { token: owner.accessToken, label: 'payment-admin' });
  await expectStatus(await api('/payments/initiate', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ booking_id: paymentAdmin.id, payment_method: 'vnpay' }) }), 200, 'PAYMENT admin');
  const paymentGuestEmail = `${runId}-payment-guest@example.test`;
  const paymentGuest = await createBooking(flight, { guestEmail: paymentGuestEmail, label: 'payment-guest' });
  await expectStatus(await api('/payments/initiate', { method: 'POST', body: JSON.stringify({ booking_id: paymentGuest.id, payment_method: 'vnpay', guest_email: paymentGuestEmail }) }), 200, 'PAYMENT guest correct email');
  const paymentGuestWrong = await createBooking(flight, { guestEmail: `${runId}-payment-wrong@example.test`, label: 'payment-guest-wrong' });
  await expectStatus(await api('/payments/initiate', { method: 'POST', body: JSON.stringify({ booking_id: paymentGuestWrong.id, payment_method: 'vnpay', guest_email: 'wrong@example.test' }) }), 403, 'PAYMENT guest wrong email');
  console.log('PASS POST /payments/initiate: owner/admin/correct guest email allowed; other/wrong guest email denied.');
}

main()
  .catch((error) => { console.error('FAIL:', error && (error.stack || error.message || error)); process.exitCode = 1; });
