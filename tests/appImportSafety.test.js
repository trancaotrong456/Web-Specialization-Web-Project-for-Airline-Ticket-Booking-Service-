const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const cron = require('node-cron');
const { sequelize } = require('../models');
const sockets = require('../sockets');
const expireBookingsJob = require('../jobs/expireBookings.job');

test('importing app creates no database, cron, socket, or HTTP-listener side effects', () => {
  const originalAuthenticate = sequelize.authenticate;
  const originalSchedule = cron.schedule;
  const originalInitSocket = sockets.initSocket;
  const originalInitJob = expireBookingsJob.initExpireBookingsJob;
  const originalListen = http.Server.prototype.listen;
  const calls = { authenticate: 0, schedule: 0, socket: 0, job: 0, listen: 0 };
  const appPath = require.resolve('../app');

  sequelize.authenticate = (...args) => { calls.authenticate += 1; return originalAuthenticate.apply(sequelize, args); };
  cron.schedule = (...args) => { calls.schedule += 1; return originalSchedule.apply(cron, args); };
  sockets.initSocket = (...args) => { calls.socket += 1; return originalInitSocket(...args); };
  expireBookingsJob.initExpireBookingsJob = (...args) => { calls.job += 1; return originalInitJob(...args); };
  http.Server.prototype.listen = function (...args) {
    calls.listen += 1;
    return originalListen.apply(this, args);
  };

  try {
    delete require.cache[appPath];
    const app = require('../app');
    assert.equal(typeof app, 'function');
    assert.equal(typeof app.createApp, 'function');
    assert.deepEqual(calls, { authenticate: 0, schedule: 0, socket: 0, job: 0, listen: 0 });
  } finally {
    sequelize.authenticate = originalAuthenticate;
    cron.schedule = originalSchedule;
    sockets.initSocket = originalInitSocket;
    expireBookingsJob.initExpireBookingsJob = originalInitJob;
    http.Server.prototype.listen = originalListen;
    delete require.cache[appPath];
  }
});
