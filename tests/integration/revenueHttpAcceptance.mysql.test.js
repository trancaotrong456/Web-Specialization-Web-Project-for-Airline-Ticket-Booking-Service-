'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startHttpIntegrationHarness } = require('./helpers/httpIntegrationHarness');

const auth = (token) => ({ authorization: `Bearer ${token}` });
const read = async (response) => ({ status: response.status, body: await response.json() });

test('STT 37 revenue HTTP aggregates successful payments by day/month and enforces admin access', async () => {
  const harness = await startHttpIntegrationHarness();
  try {
    const admin = await harness.createIdentity('admin');
    const customer = await harness.createIdentity('customer');
    const fixture = await harness.createFlightFixture({ availableSeats: 10, totalSeats: 10 });
    const booking = await harness.models.Booking.create({ booking_code: `REV${Date.now().toString(36).slice(-6).toUpperCase()}`, user_id: customer.user.id, flight_id: fixture.flight.id, fare_class_id: fixture.fareClass.id, status: 'confirmed', total_amount: 3000000 });
    harness.trackBooking(booking);
    const day = '2099-10-10';
    await harness.models.Payment.bulkCreate([
      { booking_id: booking.id, amount: 100000, payment_method: 'vnpay', status: 'success', transaction_ref: `rev-${Date.now()}-1`, paid_at: `${day} 12:00:00` },
      { booking_id: booking.id, amount: 50000, payment_method: 'payos', status: 'failed', transaction_ref: `rev-${Date.now()}-2` },
      { booking_id: booking.id, amount: 70000, payment_method: 'payos', status: 'pending', transaction_ref: `rev-${Date.now()}-3` },
    ]);
    const base = `http://127.0.0.1:${harness.server.address().port}`;
    const daily = await read(await fetch(`${base}/api/v1/payments/revenue?from_date=${day}&to_date=${day}&group_by=day`, { headers: auth(admin.token) }));
    assert.equal(daily.status, 200); assert.equal(daily.body.data.data[0].revenue, 100000); assert.equal(daily.body.data.total_revenue, 100000);
    const monthly = await read(await fetch(`${base}/api/v1/payments/revenue?from_date=2099-10-01&to_date=2099-10-31&group_by=month`, { headers: auth(admin.token) }));
    assert.equal(monthly.status, 200); assert.equal(monthly.body.data.data[0].revenue, 100000);
    const empty = await read(await fetch(`${base}/api/v1/payments/revenue?from_date=2099-11-01&to_date=2099-11-30&group_by=day`, { headers: auth(admin.token) }));
    assert.equal(empty.status, 200); assert.equal(empty.body.data.total_revenue, 0); assert.deepEqual(empty.body.data.data, []);
    assert.equal((await read(await fetch(`${base}/api/v1/payments/revenue?from_date=${day}&to_date=${day}&group_by=day`, { headers: auth(customer.token) }))).status, 403);
    assert.equal((await read(await fetch(`${base}/api/v1/payments/revenue?from_date=bad&to_date=${day}&group_by=day`, { headers: auth(admin.token) }))).status, 422);
  } finally { await harness.cleanup(); }
});

