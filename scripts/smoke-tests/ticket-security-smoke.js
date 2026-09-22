require('dotenv').config();

const { signVnpayParams } = require('../../utils/checksum.util');
const { generateToken } = require('../../utils/jwt.util');

const BASE_URL = `http://localhost:${process.env.PORT || 5000}/api/v1`;
const runId = `ticket-security-${Date.now()}`;

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : await response.arrayBuffer();
  return { status: response.status, headers: response.headers, body };
}

async function register(label) {
  const response = await request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: `${runId}-${label}@example.test`,
      password: 'SmokePass123!',
      full_name: `Ticket ${label}`,
    }),
  });
  expect(response.status === 201, `register ${label} failed`);
  return response.body.data;
}

async function createBooking(flight, { accessToken, guestEmail, label }) {
  const response = await request('/bookings', {
    method: 'POST',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    body: JSON.stringify({
      flight_id: flight.id,
      fare_class_id: flight.fareClasses[0].id,
      ...(guestEmail ? { guest_email: guestEmail } : {}),
      passengers: [{ passenger_name: `Ticket ${label}`, passport_no: `T${Date.now().toString().slice(-8)}${label.slice(0, 6)}` }],
    }),
  });
  expect(response.status === 201, `create ${label} booking failed: ${JSON.stringify(response.body)}`);
  return response.body.data;
}

async function confirmBooking(bookingId, { accessToken, guestEmail } = {}) {
  const initiated = await request('/payments/initiate', {
    method: 'POST',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    body: JSON.stringify({ booking_id: bookingId, payment_method: 'vnpay', guest_email: guestEmail }),
  });
  expect(initiated.status === 200, `initiate payment failed for booking ${bookingId}`);
  const { transaction_ref, amount } = initiated.body.data;
  const params = {
    vnp_Amount: String(Math.round(Number(amount) * 100)),
    vnp_ResponseCode: '00',
    vnp_TxnRef: transaction_ref,
  };
  params.vnp_SecureHash = signVnpayParams(params, process.env.VNP_HASH_SECRET || 'SECRETKEYVNPAY2026DEMO');
  const ipn = await request(`/payments/vnpay/ipn?${new URLSearchParams(params)}`);
  expect(ipn.status === 200 && ipn.body.RspCode === '00', `success IPN failed for booking ${bookingId}`);
}

async function download(bookingId, { token, email } = {}) {
  const query = email ? `?email=${encodeURIComponent(email)}` : '';
  return request(`/bookings/${bookingId}/ticket${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

const getAdminToken = () => generateToken({ id: 1, email: 'admin-smoke@example.test', role: 'admin' });

async function expectPdf(response, label) {
  expect(response.status === 200, `${label}: expected 200, received ${response.status}`);
  expect(response.headers.get('content-type') === 'application/pdf', `${label}: expected application/pdf`);
  expect(response.body.byteLength > 0, `${label}: PDF is empty`);
}

async function main() {
  const search = await request('/flights/search?min_seats=20&limit=100');
  expect(search.status === 200, 'Could not search for a suitable flight.');
  const flight = search.body.data.find((item) => item.fareClasses && item.fareClasses.length > 0);
  expect(flight, 'No suitable scheduled flight found.');

  const owner = await register('owner');
  const other = await register('other');
  const adminToken = await getAdminToken();

  const userBooking = await createBooking(flight, { accessToken: owner.accessToken, label: 'owner' });
  await confirmBooking(userBooking.id, { accessToken: owner.accessToken });
  await expectPdf(await download(userBooking.id, { token: owner.accessToken }), 'Owner PDF');
  console.log('PASS 1: booking owner downloads confirmed PDF (200).');

  const otherResult = await download(userBooking.id, { token: other.accessToken });
  expect(otherResult.status === 403, `Other user expected 403, received ${otherResult.status}`);
  console.log('PASS 2: non-owner user is denied (403).');

  await expectPdf(await download(userBooking.id, { token: adminToken }), 'Admin PDF');
  console.log('PASS 3: admin downloads any confirmed PDF (200).');

  const guestEmail = `${runId}-guest@example.test`;
  const guestBooking = await createBooking(flight, { guestEmail, label: 'guest' });
  await confirmBooking(guestBooking.id, { guestEmail });
  await expectPdf(await download(guestBooking.id, { email: guestEmail }), 'Guest email PDF');
  console.log('PASS 4: guest booking with matching email downloads PDF (200).');

  const guestWrong = await download(guestBooking.id, { email: 'wrong@example.test' });
  const guestMissing = await download(guestBooking.id);
  expect(guestWrong.status === 403 && guestMissing.status === 403, 'Guest wrong/missing email must both return 403.');
  console.log('PASS 5: guest booking with wrong or missing email is denied (403).');

  const holdingBooking = await createBooking(flight, { accessToken: owner.accessToken, label: 'holding' });
  const holdingResult = await download(holdingBooking.id, { token: owner.accessToken });
  expect(holdingResult.status === 400, `Holding booking expected 400, received ${holdingResult.status}`);
  console.log('PASS 6: holding booking ticket download is denied (400).');
}

main()
  .catch((error) => { console.error(`FAIL: ${error.message}`); process.exitCode = 1; })
;
