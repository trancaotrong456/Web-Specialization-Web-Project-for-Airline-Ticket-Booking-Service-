const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');

test('Booking repository keeps lock and transaction options on atomic reads', async () => {
  const { SequelizeBookingRepository } = require('../modules/booking/booking.repository');
  const calls = [];
  const model = (name) => ({
    findOne: async (options) => { calls.push({ name, options }); return null; },
  });
  const repository = new SequelizeBookingRepository({
    Booking: model('Booking'), BookingPassenger: {}, Flight: model('Flight'), FareClass: model('FareClass'),
    Promotion: model('Promotion'), User: {}, Payment: model('Payment'), Airline: {}, Airport: {},
  });
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  await repository.findFlightForUpdate(3, transaction);
  await repository.findPromotionByCodeForUpdate('SALE', transaction);
  await repository.findPendingPaymentForReconciliation(7, transaction);
  await repository.findBookingForReconciliation(7, transaction);
  assert.deepEqual(calls.map(({ name }) => name), ['Flight', 'Promotion', 'Payment', 'Booking']);
  for (const { options } of calls) {
    assert.equal(options.transaction, transaction);
    assert.equal(options.lock, 'UPDATE');
  }
  assert.deepEqual(calls[2].options.order, [['created_at', 'DESC']]);
  assert.deepEqual(calls[2].options.where, { booking_id: 7, status: 'pending' });
  assert.equal(calls[3].options.include[0].as, 'passengers');
});

test('Booking repository distinguishes holding expiry from pending-payment grace', async () => {
  const { SequelizeBookingRepository } = require('../modules/booking/booking.repository');
  const calls = [];
  const booking = { findAll: async (options) => { calls.push(options); return []; } };
  const repository = new SequelizeBookingRepository({ Booking: booking, BookingPassenger: {}, Flight: {}, FareClass: {}, Promotion: {}, User: {}, Payment: {}, Airline: {}, Airport: {} });
  const now = new Date('2026-10-15T00:00:00Z');
  await repository.findExpiredHoldingBookings(now);
  await repository.findStalePendingBookings(now);
  assert.equal(calls[0].where.status, 'holding');
  assert.equal(calls[0].where.hold_expires_at[Op.lt], now);
  assert.equal(calls[1].where.status, 'pending_payment');
  assert.equal(calls[1].where.hold_expires_at[Op.lt], now);
  assert.deepEqual(calls[1].attributes, ['id']);
});

test('Booking repository preserves detail, guest lookup and paginated association queries', async () => {
  const { SequelizeBookingRepository } = require('../modules/booking/booking.repository');
  const calls = [];
  const booking = {
    findByPk: async (id, options) => { calls.push({ kind: 'detail', id, options }); return null; },
    findOne: async (options) => { calls.push({ kind: 'code', options }); return null; },
    findAndCountAll: async (options) => { calls.push({ kind: 'list', options }); return { count: 0, rows: [] }; },
  };
  const repository = new SequelizeBookingRepository({ Booking: booking, BookingPassenger: {}, Flight: {}, FareClass: {}, Promotion: {}, User: {}, Payment: {}, Airline: {}, Airport: {} });
  await repository.findBookingDetail(2);
  await repository.findBookingByCode('BKTEST');
  await repository.listUserBookings(7, { status: 'holding', limit: 10, offset: 20 });
  await repository.listAllBookings({ status: 'confirmed', search: 'BK', limit: 20, offset: 0 });
  assert.equal(calls[0].id, 2);
  assert.deepEqual(calls[0].options.include.map((entry) => entry.as), ['flight', 'fareClass', 'promotion', 'passengers', 'payments', 'user']);
  assert.deepEqual(calls[0].options.include[5].attributes, ['id', 'full_name', 'email', 'phone']);
  assert.deepEqual(calls[1].options.where, { booking_code: 'BKTEST' });
  assert.deepEqual(calls[2].options.where, { user_id: 7, status: 'holding' });
  assert.equal(calls[2].options.limit, 10);
  assert.equal(calls[2].options.offset, 20);
  assert.equal(calls[3].options.where[Op.or][0].booking_code[Op.like], '%BK%');
  assert.deepEqual(calls[3].options.include[4].attributes, ['id', 'full_name', 'email']);
});

test('Booking module uses one injected controller, service and repository graph', () => {
  const { createBookingModule } = require('../modules/booking');
  const repository = { findBookingById: async () => null };
  const module = createBookingModule({ repository, transactionManager: { transaction: async () => {} } });
  assert.equal(module.repository, repository);
  assert.equal(module.service.repository, repository);
  assert.equal(module.controller.service, module.service);
  assert.equal(typeof module.router, 'function');
});

test('legacy Booking imports and cron resolve the canonical module', () => {
  const { getDefaultBookingModule } = require('../modules/booking');
  const module = getDefaultBookingModule();
  assert.equal(require('../services/booking.service'), module.service);
  assert.equal(require('../controllers/booking.controller'), module.controller);
  assert.equal(require('../routes/booking.route'), module.router);
  const routes = module.router.stack.filter((layer) => layer.route).map((layer) => [layer.route.stack[0].method, layer.route.path]);
  assert.deepEqual(routes, [
    ['post', '/'], ['get', '/my-bookings'], ['get', '/lookup/:code'], ['get', '/admin/all'],
    ['get', '/:id/ticket'], ['get', '/:id'], ['put', '/:id/cancel'],
  ]);
  const ticket = module.router.stack.find((layer) => layer.route?.path === '/:id/ticket');
  assert.equal(ticket.route.stack.at(-1).handle, require('../controllers/ticket.controller').downloadTicket);
  assert.equal(typeof module.service.expireHoldingBookings, 'function');
  assert.equal(typeof module.service.reconcileStalePendingPayments, 'function');
});
