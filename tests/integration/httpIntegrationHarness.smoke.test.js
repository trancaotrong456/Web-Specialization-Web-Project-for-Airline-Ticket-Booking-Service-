'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startHttpIntegrationHarness } = require('./helpers/httpIntegrationHarness');

test('canonical HTTP harness starts, authenticates roles, enforces admin access and cleans up', async () => {
  const harness = await startHttpIntegrationHarness();
  try {
    const customer = await harness.createIdentity('customer');
    const admin = await harness.createIdentity('admin');
    const base = `http://127.0.0.1:${harness.server.address().port}`;

    const health = await fetch(`${base}/api/v1/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).status, 'ok');

    const customerPayments = await fetch(`${base}/api/v1/payments`, {
      headers: { authorization: `Bearer ${customer.token}` },
    });
    assert.equal(customerPayments.status, 403);

    const adminPayments = await fetch(`${base}/api/v1/payments`, {
      headers: { authorization: `Bearer ${admin.token}` },
    });
    assert.equal(adminPayments.status, 200);
    assert.equal(harness.identity.database_name, 'airline_booking_integration_test');
  } finally {
    await harness.cleanup();
  }
});

