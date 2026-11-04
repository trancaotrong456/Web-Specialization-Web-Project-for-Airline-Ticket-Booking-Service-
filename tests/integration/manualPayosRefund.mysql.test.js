'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startHttpIntegrationHarness } = require('./helpers/httpIntegrationHarness');
const paymentService = require('../../services/payment.service');

const headers = (token) => ({ authorization: `Bearer ${token}`, 'content-type': 'application/json' });
const read = async (response) => ({ status: response.status, body: await response.json() });

test('STT 33 manual payOS refund admin lifecycle is isolated, atomic and idempotent', { timeout: 30000 }, async () => {
  const harness = await startHttpIntegrationHarness();
  try {
    const [admin, staff, customer] = await Promise.all([harness.createIdentity('admin'), harness.createIdentity('staff'), harness.createIdentity('customer')]);
    const fixture = await harness.createFlightFixture({ availableSeats: 2, totalSeats: 2 });
    const promotion = await harness.createPromotionFixture({ maxUses: 1 });
    const base = `http://127.0.0.1:${harness.server.address().port}`;
    const bookingResponse = await fetch(`${base}/api/v1/bookings`, { method: 'POST', headers: headers(customer.token), body: JSON.stringify({ flight_id: fixture.flight.id, fare_class_id: fixture.fareClass.id, promotion_code: promotion.code, passengers: [{ passenger_name: 'Refund Passenger' }] }) });
    const bookingResult = await read(bookingResponse); assert.equal(bookingResult.status, 201);
    const booking = bookingResult.body.data; harness.trackBooking(booking);
    await harness.models.Booking.update({ status: 'confirmed' }, { where: { id: booking.id } });
    const payment = await harness.models.Payment.create({ booking_id: booking.id, amount: booking.total_amount, payment_method: 'payos', status: 'success', transaction_ref: `MANUAL-${Date.now()}-${Math.random()}` , paid_at: new Date() });

    const createPayload = JSON.stringify({ reason: 'Verified bank refund', evidence_reference: 'BANK-EVIDENCE-1' });
    const creates = await Promise.all([1, 2].map(() => fetch(`${base}/api/v1/payments/${payment.id}/manual-refund`, { method: 'POST', headers: headers(admin.token), body: createPayload }).then(read)));
    assert.equal(creates.filter((x) => x.status === 200).length, 1); assert.equal(creates.filter((x) => x.status === 409).length, 1);
    const created = creates.find((x) => x.status === 200); assert.equal(created.body.data.status, 'pending'); assert.equal(String(created.body.data.amount), String(payment.amount));
    const requestId = created.body.data.id;
    for (const token of [staff.token, customer.token]) { const denied = await fetch(`${base}/api/v1/payments/${payment.id}/manual-refund`, { method: 'POST', headers: headers(token), body: JSON.stringify({ reason: 'Denied', evidence_reference: 'X' }) }); assert.equal((await read(denied)).status, 403); }
    const duplicate = await fetch(`${base}/api/v1/payments/${payment.id}/manual-refund`, { method: 'POST', headers: headers(admin.token), body: JSON.stringify({ reason: 'Duplicate', evidence_reference: 'X' }) }); assert.equal((await read(duplicate)).status, 409);
    assert.equal((await harness.models.Payment.findByPk(payment.id)).status, 'success');

    const missingEvidence = await fetch(`${base}/api/v1/payments/manual-refunds/${requestId}/settle`, { method: 'POST', headers: headers(admin.token), body: JSON.stringify({ settlement_reference: 'SET-1' }) }); assert.equal((await read(missingEvidence)).status, 422);
    const originalSave = paymentService.repository.save; let injected = false;
    paymentService.repository.save = async (entity, options) => { if (!injected && entity?.payment_method === 'payos' && entity?.status === 'refunded') { injected = true; throw new Error('injected settlement persistence failure'); } return originalSave.call(paymentService.repository, entity, options); };
    try {
      const rollback = await fetch(`${base}/api/v1/payments/manual-refunds/${requestId}/settle`, { method: 'POST', headers: headers(admin.token), body: JSON.stringify({ evidence_reference: 'BANK-EVIDENCE-1', settlement_reference: 'SET-ROLLBACK' }) });
      assert.equal((await read(rollback)).status, 500);
    } finally { paymentService.repository.save = originalSave; }
    assert.equal((await harness.models.Payment.findByPk(payment.id)).status, 'success'); assert.equal((await harness.models.ManualPaymentRefundRequest.findByPk(requestId)).status, 'pending');
    const rejected = await fetch(`${base}/api/v1/payments/manual-refunds/${requestId}/reject`, { method: 'POST', headers: headers(admin.token), body: JSON.stringify({ reason: 'Evidence rejected' }) }); assert.equal((await read(rejected)).status, 200);
    assert.equal((await harness.models.Payment.findByPk(payment.id)).status, 'success'); assert.equal((await harness.models.Booking.findByPk(booking.id)).status, 'confirmed');
    const recreate = await fetch(`${base}/api/v1/payments/${payment.id}/manual-refund`, { method: 'POST', headers: headers(admin.token), body: JSON.stringify({ reason: 'Reopen', evidence_reference: 'X' }) }); assert.equal((await read(recreate)).status, 409);

    const fixture2 = await harness.createFlightFixture({ availableSeats: 2, totalSeats: 2 });
    const booking2Response = await fetch(`${base}/api/v1/bookings`, { method: 'POST', headers: headers(customer.token), body: JSON.stringify({ flight_id: fixture2.flight.id, fare_class_id: fixture2.fareClass.id, passengers: [{ passenger_name: 'Settlement Passenger' }] }) });
    const booking2 = (await read(booking2Response)).body.data; harness.trackBooking(booking2); await harness.models.Booking.update({ status: 'confirmed' }, { where: { id: booking2.id } });
    const payment2 = await harness.models.Payment.create({ booking_id: booking2.id, amount: booking2.total_amount, payment_method: 'payos', status: 'success', transaction_ref: `MANUAL-${Date.now()}-${Math.random()}`, paid_at: new Date() });
    const request2 = (await read(await fetch(`${base}/api/v1/payments/${payment2.id}/manual-refund`, { method: 'POST', headers: headers(admin.token), body: JSON.stringify({ reason: 'Settlement', evidence_reference: 'BANK-EVIDENCE-2' }) }))).body.data;
    const beforeSeats = Number((await harness.models.Flight.findByPk(fixture2.flight.id)).available_seats);
    const settles = await Promise.all([1, 2].map(() => fetch(`${base}/api/v1/payments/manual-refunds/${request2.id}/settle`, { method: 'POST', headers: headers(admin.token), body: JSON.stringify({ evidence_reference: 'BANK-EVIDENCE-2', settlement_reference: 'SETTLE-UNIQUE-2' }) }).then(read)));
    assert.equal(settles.filter((x) => x.status === 200).length, 2); assert.equal(settles.filter((x) => x.status === 409).length, 0);
    assert.equal((await harness.models.Payment.findByPk(payment2.id)).status, 'refunded'); assert.equal((await harness.models.Booking.findByPk(booking2.id)).status, 'cancelled');
    assert.equal(Number((await harness.models.Flight.findByPk(fixture2.flight.id)).available_seats), beforeSeats + 1); assert.equal(Number((await harness.models.Promotion.findByPk(promotion.id)).used_count), 1);
    const retry = await fetch(`${base}/api/v1/payments/manual-refunds/${request2.id}/settle`, { method: 'POST', headers: headers(admin.token), body: JSON.stringify({ evidence_reference: 'BANK-EVIDENCE-2', settlement_reference: 'SETTLE-UNIQUE-2' }) }); assert.equal((await read(retry)).status, 200);
    const conflict = await fetch(`${base}/api/v1/payments/manual-refunds/${request2.id}/settle`, { method: 'POST', headers: headers(admin.token), body: JSON.stringify({ evidence_reference: 'BANK-EVIDENCE-2', settlement_reference: 'SETTLE-OTHER' }) }); assert.equal((await read(conflict)).status, 409);
    await paymentService._processVerifiedPayosWebhook({ orderCode: payment2.transaction_ref, amount: payment2.amount, isSuccess: true });
    assert.equal((await harness.models.Payment.findByPk(payment2.id)).status, 'refunded');
    const audit = await read(await fetch(`${base}/api/v1/payments/manual-refunds/${request2.id}`, { headers: headers(admin.token) })); assert.equal(audit.status, 200); assert.equal(audit.body.data.auditLogs.length, 2); assert.equal(audit.body.data.auditLogs.at(-1).admin_user_id, admin.user.id);
  } finally { await harness.cleanup(); }
});
