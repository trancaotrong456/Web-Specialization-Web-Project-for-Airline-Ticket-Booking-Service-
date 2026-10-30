'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const PaymentService = require('../modules/payment/payment.service');

const withEnvironment = async (updates, run) => {
  const previous = {};
  for (const [key, value] of Object.entries(updates)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

function createLiveFixture({ paymentRequests = {}, verify = async (body) => body.data } = {}) {
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  const booking = {
    id: 42,
    booking_code: 'BK-LIVE-CONTRACT',
    status: 'holding',
    flight_id: 8,
    total_amount: '1250000.00',
    hold_expires_at: new Date(Date.now() + 15 * 60 * 1000),
    user_id: null,
    guest_email: 'guest@example.com',
  };
  const createdPayments = [];
  const calls = { factory: [], create: [], get: [], saves: 0, lookups: 0 };
  const payOS = {
    paymentRequests: {
      create: async (payload) => {
        calls.create.push(payload);
        if (paymentRequests.create) return paymentRequests.create(payload);
        return { checkoutUrl: 'https://pay.payos.example/checkout/42', qrCode: '0002010102126304ABCD', paymentLinkId: 'plink-42' };
      },
      get: async (orderCode) => {
        calls.get.push(orderCode);
        if (paymentRequests.get) return paymentRequests.get(orderCode);
        return { status: 'PAID', orderCode, amount: 1250000 };
      },
    },
    webhooks: { verify },
  };
  const repository = {
    findLockedBooking: async () => booking,
    findBookingSegments: async () => [],
    findLockedFlight: async () => ({ id: 8, status: 'scheduled', departure_time: new Date(Date.now() + 60 * 60 * 1000) }),
    createPayment: async (values) => {
      const payment = { id: createdPayments.length + 1, ...values };
      createdPayments.push(payment);
      return payment;
    },
    save: async () => { calls.saves += 1; },
    findPaymentWithBookingByRef: async () => {
      calls.lookups += 1;
      return null;
    },
  };
  const service = new PaymentService({
    repository,
    transactionManager: { transaction: (work) => work(transaction) },
    payOSFactory: (options) => {
      calls.factory.push(options);
      return payOS;
    },
  });
  return { service, repository, booking, createdPayments, calls };
}

const liveEnvironment = {
  NODE_ENV: 'test',
  PAYOS_MODE: 'live',
  PAYOS_CLIENT_ID: 'test-client-id',
  PAYOS_API_KEY: 'test-api-key',
  PAYOS_CHECKSUM_KEY: 'test-checksum-key',
  PAYOS_BASE_URL: 'https://api-merchant.payos.example',
  PAYOS_RETURN_URL: 'https://frontend.example/payments/result',
  PAYOS_CANCEL_URL: 'https://frontend.example/payments/result',
  CLIENT_URL: 'https://frontend.example',
};

test('live payOS payment-link contract maps SDK response without calling the real SDK', async () => {
  await withEnvironment(liveEnvironment, async () => {
    const fixture = createLiveFixture();
    const result = await fixture.service.initiatePayment({
      booking_id: fixture.booking.id,
      payment_method: 'payos',
      guest_email: fixture.booking.guest_email,
      return_url: 'https://frontend.example/payments/result',
    });

    assert.deepEqual(result, {
      payment_url: 'https://pay.payos.example/checkout/42',
      qr_code: '0002010102126304ABCD',
      payment_link_id: 'plink-42',
      transaction_ref: fixture.createdPayments[0].transaction_ref,
      booking_id: fixture.booking.id,
      amount: fixture.booking.total_amount,
      status: 'pending_payment',
    });
    assert.equal(fixture.calls.factory.length, 1);
    assert.deepEqual(fixture.calls.factory[0], {
      clientId: 'test-client-id',
      apiKey: 'test-api-key',
      checksumKey: 'test-checksum-key',
      baseURL: 'https://api-merchant.payos.example',
    });
    assert.equal(fixture.calls.create[0].amount, 1250000);
    assert.equal(fixture.calls.create[0].returnUrl, 'https://frontend.example/payments/result');
    assert.equal(fixture.calls.create[0].cancelUrl, 'https://frontend.example/payments/result');
  });
});

test('payOS status lookup uses the numeric orderCode and does not mutate local state', async () => {
  await withEnvironment(liveEnvironment, async () => {
    const fixture = createLiveFixture();
    const result = await fixture.service.getPayosPaymentStatus('123456');
    assert.deepEqual(result, { status: 'PAID', orderCode: 123456, amount: 1250000 });
    assert.deepEqual(fixture.calls.get, [123456]);
    assert.equal(fixture.calls.saves, 0);
  });
});

test('payOS SDK timeout is surfaced as an ambiguous 502 without hiding the transaction reference', async () => {
  await withEnvironment(liveEnvironment, async () => {
    const fixture = createLiveFixture({
      paymentRequests: { create: async () => { throw new Error('upstream timeout'); } },
    });
    await assert.rejects(
      fixture.service.initiatePayment({
        booking_id: fixture.booking.id,
        payment_method: 'payos',
        guest_email: fixture.booking.guest_email,
        return_url: 'https://frontend.example/payments/result',
      }),
      (error) => error.statusCode === 502 && /^Unable to confirm payOS payment-link creation:/.test(error.message)
        && String(error.transactionRef) === String(fixture.createdPayments[0].transaction_ref),
    );
    assert.equal(fixture.booking.status, 'pending_payment');
  });
});

test('invalid payOS webhook signature fails before local lookup or mutation', async () => {
  await withEnvironment(liveEnvironment, async () => {
    const fixture = createLiveFixture({ verify: async () => { throw new Error('bad signature'); } });
    await assert.rejects(
      fixture.service.handlePayosWebhook({ success: true, code: '00', data: { orderCode: 123, amount: 1250000 } }),
      (error) => error.statusCode === 400 && error.message === 'Invalid payOS webhook signature',
    );
    assert.equal(fixture.calls.lookups, 0);
    assert.equal(fixture.calls.saves, 0);
  });
});

test('verified payOS webhook rejects amount mismatch and unknown order without mutation', async () => {
  await withEnvironment(liveEnvironment, async () => {
    const mismatch = createLiveFixture({
      verify: async (body) => body.data,
    });
    mismatch.repository.findPaymentWithBookingByRef = async () => ({
      id: 9,
      booking_id: mismatch.booking.id,
      transaction_ref: '123',
      payment_method: 'payos',
      amount: '1250000.00',
      status: 'pending',
      booking: { ...mismatch.booking, status: 'pending_payment' },
    });
    await assert.rejects(
      mismatch.service.handlePayosWebhook({ success: true, code: '00', data: { orderCode: 123, amount: 1250001, code: '00' } }),
      (error) => error.statusCode === 400 && error.message === 'Amount mismatch',
    );
    assert.equal(mismatch.calls.saves, 0);

    const unknown = createLiveFixture();
    const result = await unknown.service.handlePayosWebhook({ success: true, code: '00', data: { orderCode: 999, amount: 1250000, code: '00' } });
    assert.equal(result.message, 'Webhook acknowledged; local order not found');
    assert.equal(unknown.calls.saves, 0);
  });
});
