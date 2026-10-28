'use strict';

const { after, afterEach, before, test } = require('node:test');
const assert = require('node:assert/strict');
const paymentService = require('../../services/payment.service');
const bookingService = require('../../services/booking.service');
const { models, verifyConnectedDatabase } = require('./helpers/mysqlTestDatabase');
const {
  cleanupTrackedFixtures, createFlightFixture, trackBooking, trackPayment,
} = require('./helpers/testFixtures');

process.env.PAYOS_MODE = 'demo';

async function createCaseFixture(suffix) {
  const fixture = await createFlightFixture({ availableSeats: 1, totalSeats: 1 });
  const booking = trackBooking(await bookingService.createHoldingBooking({
    flight_id: fixture.flight.id, fare_class_id: fixture.fareClass.id,
    passengers: [{ passenger_name: `Case ${suffix}`, passport_no: `CASE-${suffix}` }],
    guest_email: `case-${suffix}-${Date.now()}@example.test`,
  }));
  const initiated = await paymentService.initiatePayment({
    booking_id: booking.id, payment_method: 'payos', guest_email: booking.guest_email,
  });
  const payment = trackPayment(await models.Payment.findOne({ where: { transaction_ref: initiated.transaction_ref } }));
  const repository = paymentService.repository;
  const reconciliationCase = await models.sequelize.transaction((transaction) => repository.createOrFindCase({
    paymentId: payment.id, bookingId: booking.id, provider: 'payos', nextAttemptAt: new Date(0),
  }, { transaction }));
  return { fixture, booking, payment, reconciliationCase, repository };
}

async function claim(repository, owner, options = {}) {
  return models.sequelize.transaction((transaction) => repository.claimDueCases({
    owner, now: options.now || new Date(), leaseMs: options.leaseMs || 60000, limit: options.limit || 10,
  }, { transaction }));
}

before(async () => { await verifyConnectedDatabase(); });
afterEach(async () => { await cleanupTrackedFixtures(); });
after(async () => { await cleanupTrackedFixtures(); await models.sequelize.close(); });

test('IT-27 reconciliation case creation is unique per Payment', { timeout: 20000 }, async () => {
  const { payment, booking, repository } = await createCaseFixture('IT27');
  const second = await models.sequelize.transaction((transaction) => repository.createOrFindCase({
    paymentId: payment.id, bookingId: booking.id, provider: 'payos',
  }, { transaction }));
  assert.equal(second.id, (await models.PaymentReconciliationCase.findOne({ where: { payment_id: payment.id } })).id);
  assert.equal(await models.PaymentReconciliationCase.count({ where: { payment_id: payment.id } }), 1);
});

test('IT-27a Booking exposes reconciliation cases as a hasMany association', () => {
  assert.equal(models.Booking.associations.reconciliationCases.associationType, 'HasMany');
  assert.equal(models.Payment.associations.reconciliationCase.associationType, 'HasOne');
});

test('IT-27b concurrent matching creates return one case', { timeout: 20000 }, async () => {
  const { payment, booking, repository } = await createCaseFixture('IT27B');
  const create = () => models.sequelize.transaction((transaction) => repository.createOrFindCase({
    paymentId: payment.id, bookingId: booking.id, provider: 'payos',
  }, { transaction }));
  const results = await Promise.all([create(), create()]);
  assert.equal(new Set(results.map((item) => item.id)).size, 1);
  assert.equal(await models.PaymentReconciliationCase.count({ where: { payment_id: payment.id } }), 1);
});

test('IT-27c conflicting concurrent create is rejected without reassignment', { timeout: 20000 }, async () => {
  const { payment, booking, repository } = await createCaseFixture('IT27C');
  await assert.rejects(() => models.sequelize.transaction((transaction) => repository.createOrFindCase({
    paymentId: payment.id, bookingId: booking.id + 1, provider: 'payos',
  }, { transaction })), { code: 'RECONCILIATION_CASE_MISMATCH' });
  await assert.rejects(() => models.sequelize.transaction((transaction) => repository.createOrFindCase({
    paymentId: payment.id, bookingId: booking.id, provider: 'vnpay',
  }, { transaction })), { code: 'RECONCILIATION_CASE_MISMATCH' });
  const stored = await models.PaymentReconciliationCase.findOne({ where: { payment_id: payment.id } });
  assert.equal(String(stored.booking_id), String(booking.id));
  assert.equal(stored.provider, 'payos');
});

test('IT-28 concurrent workers claim a due case only once', { timeout: 20000 }, async () => {
  const { repository } = await createCaseFixture('IT28');
  const results = await Promise.all([claim(repository, 'worker-a'), claim(repository, 'worker-b')]);
  assert.equal(results.filter((rows) => rows.length === 1).length, 1);
  assert.equal(results.reduce((total, rows) => total + rows.length, 0), 1);
  assert.equal((await models.PaymentReconciliationCase.findOne()).attempt_count, 1);
});

test('IT-28a claim enforces the persisted retry budget', { timeout: 20000 }, async () => {
  const { repository, reconciliationCase } = await createCaseFixture('IT28A');
  await models.PaymentReconciliationCase.update({ max_attempts: 2, attempt_count: 1 }, { where: { id: reconciliationCase.id } });
  assert.equal((await claim(repository, 'worker-b')).length, 1);
  await models.PaymentReconciliationCase.update({ attempt_count: 2, lease_owner: null, lease_expires_at: null }, { where: { id: reconciliationCase.id } });
  assert.equal((await claim(repository, 'worker-c')).length, 0);
  await models.PaymentReconciliationCase.update({ attempt_count: 3 }, { where: { id: reconciliationCase.id } });
  assert.equal((await claim(repository, 'worker-d')).length, 0);
  const stored = await models.PaymentReconciliationCase.findByPk(reconciliationCase.id);
  assert.equal(stored.state, 'active');
  assert.equal(stored.attempt_count, 3);
});

test('IT-29 active lease protects a case and expired lease can be recovered', { timeout: 20000 }, async () => {
  const { repository, reconciliationCase } = await createCaseFixture('IT29');
  assert.equal((await claim(repository, 'worker-a')).length, 1);
  assert.equal((await claim(repository, 'worker-b')).length, 0);
  await models.PaymentReconciliationCase.update({ lease_expires_at: new Date(0) }, { where: { id: reconciliationCase.id } });
  assert.equal((await claim(repository, 'worker-b')).length, 1);
  const stored = await models.PaymentReconciliationCase.findByPk(reconciliationCase.id);
  assert.equal(stored.lease_owner, 'worker-b');
  assert.equal(stored.attempt_count, 2);
});

test('IT-30 stale worker cannot complete a case after lease takeover', { timeout: 20000 }, async () => {
  const { repository, reconciliationCase } = await createCaseFixture('IT30');
  await claim(repository, 'worker-a');
  await models.PaymentReconciliationCase.update({ lease_expires_at: new Date(0) }, { where: { id: reconciliationCase.id } });
  await claim(repository, 'worker-b');
  const staleResult = await models.sequelize.transaction((transaction) => repository.completeAttempt(
    reconciliationCase.id, 'worker-a', { lastGatewayStatus: 'PAID' }, { transaction },
  ));
  assert.equal(staleResult, null);
  const stored = await models.PaymentReconciliationCase.findByPk(reconciliationCase.id);
  assert.equal(stored.lease_owner, 'worker-b');
  assert.equal(stored.last_gateway_status, null);
});

test('IT-31 attempt counter increments once per successful claim', { timeout: 20000 }, async () => {
  const { repository, reconciliationCase } = await createCaseFixture('IT31');
  await claim(repository, 'worker-a');
  await claim(repository, 'worker-a');
  assert.equal((await models.PaymentReconciliationCase.findByPk(reconciliationCase.id)).attempt_count, 1);
});

test('IT-32 transaction rollback does not persist a reconciliation case', { timeout: 20000 }, async () => {
  const { payment, booking, repository } = await createCaseFixture('IT32');
  await models.PaymentReconciliationCase.destroy({ where: { payment_id: payment.id }, force: true });
  await assert.rejects(() => models.sequelize.transaction(async (transaction) => {
    await repository.createOrFindCase({ paymentId: payment.id, bookingId: booking.id, provider: 'payos' }, { transaction });
    throw new Error('rollback case creation');
  }), /rollback case creation/);
  assert.equal(await models.PaymentReconciliationCase.count({ where: { payment_id: payment.id } }), 0);
});

test('IT-33 persisted case survives worker restart and is reclaimable', { timeout: 20000 }, async () => {
  const { repository, reconciliationCase } = await createCaseFixture('IT33');
  await claim(repository, 'worker-before-restart');
  await models.PaymentReconciliationCase.update({ lease_expires_at: new Date(0) }, { where: { id: reconciliationCase.id } });
  const recovered = await claim(repository, 'worker-after-restart');
  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].lease_owner, 'worker-after-restart');
});

test('IT-49 manual-review listing is paginated and exposes only safe late-payment fields', { timeout: 20000 }, async () => {
  const first = await createCaseFixture('IT49A');
  const second = await createCaseFixture('IT49B');
  await models.PaymentReconciliationCase.update({
    state: 'manual_review',
    manual_review_reason: 'LATE_PAID_AFTER_EXPIRY',
    last_gateway_status: 'PAID',
    last_error: 'Authorization: Bearer should-not-be-returned',
  }, { where: { id: first.reconciliationCase.id } });
  const before = await models.PaymentReconciliationCase.findByPk(first.reconciliationCase.id, { raw: true });
  const page = await paymentService.getReconciliationCases({ state: 'manual_review', provider: 'payos', limit: 1, sort: 'updated_at', order: 'desc' });
  assert.equal(page.total, 1);
  assert.equal(page.data.length, 1);
  assert.equal(page.data[0].is_late_paid_exception, true);
  assert.equal('last_error' in page.data[0], false);
  const detail = await paymentService.getReconciliationCaseById(first.reconciliationCase.id);
  assert.match(detail.last_error, /REDACTED/);
  assert.equal(detail.payment.status, 'pending');
  assert.equal(detail.booking.status, 'pending_payment');
  const after = await models.PaymentReconciliationCase.findByPk(first.reconciliationCase.id, { raw: true });
  assert.equal(after.state, before.state);
  assert.equal(after.manual_review_reason, before.manual_review_reason);
  assert.equal(second.reconciliationCase.state, 'active');
});

test('IT-52 metrics count unresolved, exhausted and late-payment cases without mutation', { timeout: 20000 }, async () => {
  const f = await createCaseFixture('IT52');
  await models.PaymentReconciliationCase.update({
    state: 'manual_review', attempt_count: 6, max_attempts: 6,
    manual_review_reason: 'LATE_PAID_AFTER_EXPIRY', last_error: 'gateway timeout',
  }, { where: { id: f.reconciliationCase.id } });
  const before = await models.PaymentReconciliationCase.findByPk(f.reconciliationCase.id, { raw: true });
  const result = await paymentService.getReconciliationMetrics({ now: new Date(Date.now() + 3600000), pendingSlaMinutes: 0 });
  assert.ok(result.metrics.manual_review_cases >= 1);
  assert.ok(result.metrics.retry_exhaustion_cases >= 1);
  assert.ok(result.metrics.late_paid_cases >= 1);
  assert.ok(result.metrics.gateway_timeout_cases >= 1);
  const after = await models.PaymentReconciliationCase.findByPk(f.reconciliationCase.id, { raw: true });
  assert.equal(after.state, before.state);
  assert.equal(after.attempt_count, before.attempt_count);
});
