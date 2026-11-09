'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createBookingMaintenanceJob } = require('../../infrastructure/jobs/bookingMaintenanceJob');
const { startHttpIntegrationHarness } = require('./helpers/httpIntegrationHarness');

test('STT 35 maintenance scheduler expires an owned holding booking exactly once', async () => {
  const harness = await startHttpIntegrationHarness();
  const originalPending = process.env.ENABLE_PENDING_RECONCILIATION;
  process.env.ENABLE_PENDING_RECONCILIATION = 'false';
  try {
    const customer = await harness.createIdentity('customer');
    const fixture = await harness.createFlightFixture({ availableSeats: 2, totalSeats: 2 });
    const booking = await harness.container.bookingModule.service.createHoldingBooking({ flight_id: fixture.flight.id, fare_class_id: fixture.fareClass.id, passengers: [{ passenger_name: 'Expiry Passenger' }], user_id: customer.user.id, currentUser: { id: customer.user.id, role: { name: 'customer' } } });
    harness.trackBooking(booking);
    await harness.models.Booking.update({ hold_expires_at: new Date(Date.now() - 60000) }, { where: { id: booking.id } });
    let tick;
    const scheduled = { stop() {} };
    const job = createBookingMaintenanceJob({ cron: { schedule(_expression, callback) { tick = callback; return scheduled; } }, bookingService: harness.container.bookingModule.service, environment: process.env, logger: { log() {}, error: assert.fail } });
    job.start(); assert.equal(typeof tick, 'function');
    await tick();
    assert.equal((await harness.models.Booking.findByPk(booking.id)).status, 'expired');
    assert.equal(Number((await harness.models.Flight.findByPk(fixture.flight.id)).available_seats), 2);
    await tick();
    assert.equal(Number((await harness.models.Flight.findByPk(fixture.flight.id)).available_seats), 2);
    assert.equal(await job.stop(), true);
  } finally {
    if (originalPending === undefined) delete process.env.ENABLE_PENDING_RECONCILIATION; else process.env.ENABLE_PENDING_RECONCILIATION = originalPending;
    await harness.cleanup();
  }
});

