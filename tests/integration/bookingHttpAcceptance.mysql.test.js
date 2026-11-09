'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startHttpIntegrationHarness } = require('./helpers/httpIntegrationHarness');

const json = async (response) => ({ status: response.status, body: await response.json() });
const auth = (token) => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' });

test('STT 30 HTTP booking create/detail/cancel preserves inventory and promotion exactly once', async () => {
  const harness = await startHttpIntegrationHarness();
  try {
    const customer = await harness.createIdentity('customer');
    const fixture = await harness.createFlightFixture({ availableSeats: 2, totalSeats: 2 });
    const promotion = await harness.createPromotionFixture({ maxUses: 1 });
    const base = `http://127.0.0.1:${harness.server.address().port}`;
    const create = await fetch(`${base}/api/v1/bookings`, {
      method: 'POST', headers: auth(customer.token),
      body: JSON.stringify({ flight_id: fixture.flight.id, fare_class_id: fixture.fareClass.id, promotion_code: promotion.code, passengers: [{ passenger_name: 'HTTP Passenger' }] }),
    });
    const created = await json(create);
    assert.equal(created.status, 201);
    const booking = created.body.data;
    harness.trackBooking(booking);
    assert.equal(booking.status, 'holding');
    assert.equal(Number((await harness.models.Flight.findByPk(fixture.flight.id)).available_seats), 1);
    assert.equal(Number((await harness.models.Promotion.findByPk(promotion.id)).used_count), 1);

    const detail = await fetch(`${base}/api/v1/bookings/${booking.id}`, { headers: auth(customer.token) });
    const detailResult = await json(detail);
    assert.equal(detailResult.status, 200);
    assert.equal(detailResult.body.data.id, booking.id);

    const cancel = await fetch(`${base}/api/v1/bookings/${booking.id}/cancel`, { method: 'PUT', headers: auth(customer.token), body: '{}' });
    assert.equal((await json(cancel)).status, 200);
    assert.equal((await harness.models.Booking.findByPk(booking.id)).status, 'cancelled');
    assert.equal(Number((await harness.models.Flight.findByPk(fixture.flight.id)).available_seats), 2);
    assert.equal(Number((await harness.models.Promotion.findByPk(promotion.id)).used_count), 0);

    const duplicate = await fetch(`${base}/api/v1/bookings/${booking.id}/cancel`, { method: 'PUT', headers: auth(customer.token), body: '{}' });
    assert.equal((await json(duplicate)).status, 400);
    assert.equal(Number((await harness.models.Flight.findByPk(fixture.flight.id)).available_seats), 2);
    assert.equal(Number((await harness.models.Promotion.findByPk(promotion.id)).used_count), 0);

    const invalid = await fetch(`${base}/api/v1/bookings`, { method: 'POST', headers: auth(customer.token), body: JSON.stringify({ flight_id: 'bad', passengers: [] }) });
    assert.equal((await json(invalid)).status, 422);
  } finally { await harness.cleanup(); }
});

test('STT 31 HTTP booking lists enforce ownership, admin RBAC, filters and pagination', async () => {
  const harness = await startHttpIntegrationHarness();
  try {
    const customer = await harness.createIdentity('customer');
    const other = await harness.createIdentity('customer');
    const admin = await harness.createIdentity('admin');
    const fixture = await harness.createFlightFixture({ availableSeats: 5, totalSeats: 5 });
    const base = `http://127.0.0.1:${harness.server.address().port}`;
    const createBooking = async (identity, name) => {
      const response = await fetch(`${base}/api/v1/bookings`, { method: 'POST', headers: auth(identity.token), body: JSON.stringify({ flight_id: fixture.flight.id, fare_class_id: fixture.fareClass.id, passengers: [{ passenger_name: name }] }) });
      const result = await json(response); assert.equal(result.status, 201); harness.trackBooking(result.body.data); return result.body.data;
    };
    const own = await createBooking(customer, 'Own');
    const чужой = await createBooking(other, 'Other');
    const mine = await json(await fetch(`${base}/api/v1/bookings/my-bookings?page=1&limit=1&status=holding`, { headers: auth(customer.token) }));
    assert.equal(mine.status, 200); assert.equal(mine.body.data.length, 1); assert.equal(mine.body.data[0].id, own.id); assert.equal(mine.body.pagination.total, 1);
    const forbidden = await json(await fetch(`${base}/api/v1/bookings/${чужой.id}`, { headers: auth(customer.token) })); assert.equal(forbidden.status, 403);
    const adminList = await json(await fetch(`${base}/api/v1/bookings/admin/all?page=1&limit=1&customer=${encodeURIComponent(other.user?.email || '')}`, { headers: auth(admin.token) }));
    assert.equal(adminList.status, 200);
    const nonAdmin = await json(await fetch(`${base}/api/v1/bookings/admin/all`, { headers: auth(customer.token) })); assert.equal(nonAdmin.status, 403);
    const invalid = await json(await fetch(`${base}/api/v1/bookings/my-bookings?page=0`, { headers: auth(customer.token) })); assert.equal(invalid.status, 422);
  } finally { await harness.cleanup(); }
});

