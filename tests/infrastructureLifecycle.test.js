const test = require('node:test');
const assert = require('node:assert/strict');

test('infrastructure adapters preserve legacy Email singleton and lazy Socket getter identity', () => {
  const { getEmailProvider } = require('../infrastructure/email/emailProvider');
  const { getSocket } = require('../infrastructure/realtime/socketProvider');
  assert.equal(getEmailProvider(), require('../services/email.service'));
  assert.equal(getSocket, require('../sockets').getIO);
  assert.throws(() => getSocket(), /not been initialized/);
});

test('composition root injects shared Email and Socket providers without starting them', () => {
  const { getDefaultAuthModule, getDefaultBookingModule, getDefaultPaymentModule, getDefaultFlightModule } = require('../application/buildContainer');
  const email = require('../services/email.service');
  const socket = require('../sockets').getIO;
  assert.equal(getDefaultAuthModule().service.emailService, email);
  assert.equal(getDefaultPaymentModule().service.emailProvider, email);
  assert.equal(getDefaultBookingModule().service.socket, socket);
  assert.equal(getDefaultPaymentModule().service.socket, socket);
  assert.equal(getDefaultFlightModule().service.getIO, socket);
});

test('runtime starts socket before DB, cron after DB, then HTTP, once', async () => {
  const { createRuntime } = require('../application/createRuntime');
  const events = [];
  const server = { listen(port, callback) { events.push(['listen', port]); callback(); } };
  const runtime = createRuntime({
    app: {}, createServer: () => { events.push('createServer'); return server; },
    initSocket: (value) => { assert.equal(value, server); events.push('socket'); },
    authenticate: async () => { events.push('database'); },
    initJob: () => { events.push('cron'); },
    validate: () => { events.push('validate'); },
    logger: { log() {}, error() {} },
    environment: { PORT: '5050', NODE_ENV: 'test' },
    exit: () => { throw Error('unexpected exit'); },
  });
  await runtime.start();
  await runtime.start();
  assert.deepEqual(events, ['validate', 'createServer', 'socket', 'database', 'cron', ['listen', '5050']]);
});

test('failed DB authentication never starts cron or HTTP and preserves exit behavior', async () => {
  const { createRuntime } = require('../application/createRuntime');
  const events = [];
  const failure = Error('database unavailable');
  const runtime = createRuntime({
    app: {}, createServer: () => ({ listen() { events.push('listen'); } }),
    initSocket: () => events.push('socket'),
    authenticate: async () => { throw failure; },
    initJob: () => events.push('cron'), validate: () => {},
    logger: { log() {}, error(...args) { assert.equal(args[1], failure); } },
    environment: {}, exit: (code) => { events.push(['exit', code]); },
  });
  await runtime.start();
  assert.deepEqual(events, ['socket', ['exit', 1]]);
});

test('runtime verifies bootstrap after DB authentication and before cron or HTTP', async () => {
  const { createRuntime } = require('../application/createRuntime');
  const events = [];
  const server = { listen(_port, callback) { events.push('listen'); callback(); } };
  const runtime = createRuntime({
    app: {}, createServer: () => server,
    initSocket: () => events.push('socket'),
    authenticate: async () => { events.push('database'); },
    verifyReadiness: async () => { events.push('readiness'); },
    initJob: () => events.push('cron'), validate() {},
    logger: { log() {}, error() {} }, environment: {}, exit() {},
  });

  await runtime.start();

  assert.deepEqual(events, ['socket', 'database', 'readiness', 'cron', 'listen']);
});

test('failed bootstrap readiness prevents cron and HTTP listen', async () => {
  const { createRuntime } = require('../application/createRuntime');
  const events = [];
  const failure = Error('bootstrap marker missing');
  const runtime = createRuntime({
    app: {}, createServer: () => ({ listen() { events.push('listen'); } }),
    initSocket: () => events.push('socket'), authenticate: async () => { events.push('database'); },
    verifyReadiness: async () => { events.push('readiness'); throw failure; },
    initJob: () => events.push('cron'), validate() {},
    logger: { log() {}, error(_message, error) { assert.equal(error, failure.message); } },
    environment: {}, exit: (code) => { events.push(['exit', code]); },
  });

  await runtime.start();

  assert.deepEqual(events, ['socket', 'database', 'readiness', ['exit', 1]]);
});

test('cron-disabled runtime does not register a job', async () => {
  const { createRuntime } = require('../application/createRuntime');
  let jobs = 0;
  const runtime = createRuntime({
    app: {}, createServer: () => ({ listen(_port, callback) { callback(); } }),
    initSocket() {}, authenticate: async () => {}, initJob: () => { jobs++; },
    validate() {}, logger: { log() {}, error() {} },
    environment: { DISABLE_CRON: 'true' }, exit() {},
  });
  await runtime.start();
  assert.equal(jobs, 0);
});

test('job factory schedules once and calls injected canonical booking service with live reconciliation flag', async () => {
  const { createBookingMaintenanceJob } = require('../infrastructure/jobs/bookingMaintenanceJob');
  let run;
  let schedules = 0;
  const calls = [];
  const environment = { ENABLE_PENDING_RECONCILIATION: 'false' };
  const job = createBookingMaintenanceJob({
    cron: { schedule(expression, callback) { assert.equal(expression, '* * * * *'); schedules++; run = callback; } },
    bookingService: {
      async expireHoldingBookings() { calls.push('expire'); return { expiredCount: 0 }; },
      async reconcileStalePendingPayments() { calls.push('reconcile'); return { reconciledCount: 0 }; },
    },
    environment, logger: { log() {}, error() {} },
  });
  job.start(); job.start();
  assert.equal(schedules, 1);
  await run();
  environment.ENABLE_PENDING_RECONCILIATION = 'true';
  await run();
  assert.deepEqual(calls, ['expire', 'expire', 'reconcile']);
});
